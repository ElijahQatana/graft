import { addIcon, moment, Notice, Platform, Plugin, TFile, type WorkspaceLeaf } from "obsidian";
import { GraftSettingTab } from "./settings.ts";
import { DEFAULT_SETTINGS, loadGraftSettings, type GraftSettings } from "./config/settings.ts";
import { SyncPreviewModal, type LoadedPreview } from "./preview/modal.ts";
import type { SyncRange } from "./sync/range.ts";
import { prepareSync, applySync, type PreparedSync } from "./sync/flow.ts";
import { UserFacingError, VaultChangedError } from "./sync/userFacingError.ts";
import { hydrateSecrets, prepareForSave, secretStoreOf } from "./config/secrets.ts";
import { resolveWeekStart, type WeekDay } from "./util/weekStart.ts";
import { fetchIcs } from "./ics/fetch.ts";
import { isLoggable, isInsideNoteFolders, logEntryFromPreview } from "./sync/log.ts";
import { writeSyncLog } from "./sync/logFile.ts";
import { countPlannedChanges, FAILURES_BEFORE_WARNING, planFingerprint } from "./sync/scheduled.ts";
import { DateTime } from "luxon";
import { BrowseCache } from "./calendar/cache.ts";
import { browseSettings } from "./calendar/browse.ts";
import { GRAFT_ICON_ID, GRAFT_ICON_SVG } from "./icon.ts";
import { CALENDAR_VIEW_TYPE, CalendarView } from "./calendar/view.ts";

/** Loads settings and connects the sync commands. */
export default class GraftPlugin extends Plugin {
	settings: GraftSettings = structuredClone(DEFAULT_SETTINGS);
	private settingsSave: Promise<void> = Promise.resolve();
	private syncing = false;
	private previewModal?: SyncPreviewModal;
	private unloaded = false;
	/** Clears the running status, if one is showing. */
	private clearBusy?: () => void;
	/** Calendar ids as last saved, so a removed calendar's secret can be cleared. */
	private savedCalendarIds = new Set<string>();
	/** The timer for scheduled checks and the settings it was made from, so an unrelated save leaves it running. */
	private checkTimer?: number;
	private checkTimerKey = "";
	private checkFailures = 0;
	/** Fingerprint of the plan last announced, so the same pending changes are announced once. */
	private lastAnnounced = "";
	/** The status bar item that says changes are ready or the last check failed. */
	private readyItem?: HTMLElement;
	/** Feed results for the dockable calendar, kept until Refresh or a settings change. */
	private browseCache = new BrowseCache(
		async () => (await prepareSync(this.app, browseSettings(this.settings), fetchIcs)).preview,
		(error) => errorMessage(error, "Graft could not read the calendars. Check the calendar settings."),
	);

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new GraftSettingTab(this.app, this));
		this.addCommand({ id: "preview-sync", name: "Preview sync", callback: () => { void this.runSync(true); } });
		this.addCommand({ id: "sync-now", name: "Sync now", callback: () => { void this.runSync(false); } });
		addIcon(GRAFT_ICON_ID, GRAFT_ICON_SVG);
		this.registerView(CALENDAR_VIEW_TYPE, (leaf: WorkspaceLeaf) => new CalendarView(leaf, {
			cache: this.browseCache,
			timezone: () => this.settings.timezone,
			weekStart: () => this.weekStart(),
			openNote: (path) => { void this.openNote(path); },
		}));
		this.addRibbonIcon(GRAFT_ICON_ID, "Open Graft calendar", () => { void this.openCalendar(); });
		this.addCommand({ id: "open-calendar", name: "Open calendar", callback: () => { void this.openCalendar(); } });
		this.app.workspace.onLayoutReady(() => {
			if (this.settings.autoRunOnStartup) void this.runSync(false);
		});
		this.scheduleChecks();
	}

	onunload() {
		this.unloaded = true;
		this.clearBusy?.();
		this.clearReady();
		this.previewModal?.close();
		this.browseCache.clear();
	}

	/** Shows the calendar view, reusing an open one and expanding the right sidebar if it is collapsed. */
	async openCalendar() {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(CALENDAR_VIEW_TYPE)[0];
		if (!leaf) {
			leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
			await leaf.setViewState({ type: CALENDAR_VIEW_TYPE, active: true });
		}
		if (leaf.getRoot() === workspace.rightSplit) workspace.rightSplit.expand();
		workspace.setActiveLeaf(leaf, { focus: true });
	}

	private async openNote(path: string) {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) await this.app.workspace.getLeaf(false).openFile(file);
		else new Notice("That Meeting note is not in the vault.");
	}

	async runSync(previewOnly: boolean) {
		if (this.syncing) {
			new Notice("A Graft sync or preview is already open.");
			return;
		}
		this.syncing = true;
		this.clearReady();
		try {
			const settings: GraftSettings = structuredClone(this.settings);
			// A preview opens at once and shows that it is working. Sync now waits for the plan first.
			const early = previewOnly || settings.previewBeforeApply ? this.openPreview(settings) : undefined;
			let preparing = true;
			void early?.closed.then(() => { if (preparing) this.clearBusy?.(); });
			let prepared: PreparedSync;
			try {
				prepared = await this.whileBusy(previewOnly ? "Graft: checking calendars" : "Graft: syncing", () => prepareSync(this.app, settings, fetchIcs));
			} catch (error) {
				early?.modal.close();
				throw error;
			} finally {
				preparing = false;
			}
			if (this.unloaded) return;
			const direct = !previewOnly && !settings.previewBeforeApply && prepared.canApply;
			const apply = () => this.applyPrepared(prepared, direct ? "Sync now" : "Apply from preview");
			if (early) {
				// Closing the preview while it loads cancels the run, and the plan is dropped.
				if (early.modal.isClosed) return;
				early.modal.ready(prepared.preview, prepared.canApply ? apply : undefined);
				await early.closed;
			} else if (!prepared.canApply) {
				const late = this.openPreview(settings, prepared, undefined);
				await late.closed;
			} else {
				await apply();
			}
		} catch (error) {
			new Notice(errorMessage(error, "Graft could not prepare the sync. Check the calendar settings, folders, templates, and ignore list."));
		} finally {
			this.syncing = false;
		}
	}

	private async applyPrepared(prepared: PreparedSync, source: string) {
		if (this.unloaded) return;
		try {
			await this.whileBusy("Graft: writing notes", () => applySync(this.app, prepared));
			new Notice("Graft sync finished.");
			await this.recordRun(prepared, source);
		} catch (error) {
			const message = errorMessage(error, "Graft sync stopped. Check the vault and run Preview sync again.");
			new Notice(message);
			await this.recordRun(prepared, source, message);
		}
	}

	/** (Re)starts the timer for scheduled checks when the mode or interval changed. Obsidian only runs it while
	 * it is open, and mobile may pause it in the background. */
	private scheduleChecks() {
		const { scheduledSync, syncIntervalMinutes } = this.settings;
		const key = `${scheduledSync}:${syncIntervalMinutes}`;
		if (key === this.checkTimerKey) return;
		this.checkTimerKey = key;
		if (this.checkTimer !== undefined) window.clearInterval(this.checkTimer);
		this.checkTimer = undefined;
		this.checkFailures = 0;
		this.lastAnnounced = "";
		this.clearReady();
		if (scheduledSync === "off") return;
		this.checkTimer = this.registerInterval(window.setInterval(() => { void this.scheduledCheck(); }, syncIntervalMinutes * 60_000));
	}

	/** One background check. It plans like Preview sync. In Notify mode it writes nothing and says so only when new
	 * changes are ready. In Automatic mode it applies a plan that is clean and small enough, and otherwise falls back to Notify. */
	async scheduledCheck() {
		if (this.syncing || this.unloaded || this.settings.scheduledSync === "off") return;
		this.syncing = true;
		try {
			const prepared = await prepareSync(this.app, structuredClone(this.settings), fetchIcs);
			if (this.unloaded) return;
			if (prepared.preview.errors.length) throw new Error("A calendar could not be read.");
			const changes = countPlannedChanges(prepared.preview);
			if (!changes) {
				this.checkFailures = 0;
				this.lastAnnounced = "";
				this.clearReady();
				return;
			}
			const { scheduledSync, automaticMaxNotes } = this.settings;
			if (scheduledSync === "automatic" && prepared.canApply && changes <= automaticMaxNotes) {
				await this.applyScheduled(prepared, changes);
				return;
			}
			this.checkFailures = 0;
			const fingerprint = planFingerprint(prepared.preview);
			if (fingerprint === this.lastAnnounced) return;
			this.lastAnnounced = fingerprint;
			const noun = changes === 1 ? "change" : "changes";
			if (scheduledSync === "automatic" && !prepared.canApply) this.announceReady(`Graft: ${changes} ${noun} need review before they can be applied`);
			else if (scheduledSync === "automatic") this.announceReady(`Graft: ${changes} ${noun} ready to review (over the automatic limit of ${automaticMaxNotes})`);
			else this.announceReady(`Graft: ${changes} ${noun} ready to review`);
		} catch {
			this.checkFailures++;
			if (this.checkFailures === FAILURES_BEFORE_WARNING) this.announceReady("Graft: the last check failed", "Graft: scheduled checks keep failing. Run Preview sync to see why.");
		} finally {
			this.syncing = false;
		}
	}

	/** Applies a plan from a scheduled run, as if the user had read the preview and pressed Apply. A stop because
	 * the vault changed is retried on the next run without a word. Any other failure is shown, logged and counted. */
	private async applyScheduled(prepared: PreparedSync, changes: number) {
		try {
			await this.whileBusy("Graft: writing notes", () => applySync(this.app, prepared));
		} catch (error) {
			if (error instanceof VaultChangedError) return;
			const message = errorMessage(error, "Graft sync stopped. Check the vault and run Preview sync again.");
			new Notice(`Graft: scheduled sync stopped. ${message}`);
			await this.recordRun(prepared, "Scheduled sync", message);
			throw error;
		}
		this.checkFailures = 0;
		this.lastAnnounced = "";
		this.clearReady();
		new Notice(`Graft: scheduled sync wrote ${changes} ${changes === 1 ? "change" : "changes"}.${this.settings.syncLogPath ? " See the sync log for details." : ""}`);
		await this.recordRun(prepared, "Scheduled sync");
	}

	/** Shows `label` in the status bar on desktop, and as a notice that opens Preview sync when clicked. */
	private announceReady(label: string, noticeText = label) {
		this.clearReady();
		if (!Platform.isMobile) {
			const item = this.addStatusBarItem();
			item.addClass("graft-status", "graft-status-ready");
			item.setAttribute("role", "button");
			item.setAttribute("tabindex", "0");
			item.setAttribute("aria-label", "Open Graft preview");
			item.createSpan({ text: label });
			onActivate(item, () => { void this.runSync(true); });
			this.readyItem = item;
		}
		const notice = new Notice(createFragment((fragment) => {
			fragment.createSpan({ text: `${noticeText} ` });
			const open = fragment.createEl("a", { text: "Open preview", attr: { role: "button", tabindex: "0" } });
			onActivate(open, () => { notice.hide(); void this.runSync(true); });
		}), 10000);
	}

	private clearReady() {
		this.readyItem?.remove();
		this.readyItem = undefined;
	}

	/** Adds the run to the sync log note, if one is set. A problem with the log never stops a sync. */
	private async recordRun(prepared: PreparedSync, source: string, error?: string) {
		const { syncLogPath, timezone, folders } = this.settings;
		if (!syncLogPath) return;
		try {
			if (isInsideNoteFolders(syncLogPath, Object.values(folders))) {
				new Notice("Graft did not write the sync log, because it is inside a note folder. Change the sync log note in Graft settings.");
				return;
			}
			const when = DateTime.now().setZone(timezone).toFormat("yyyy-LL-dd HH:mm");
			const entry = logEntryFromPreview(prepared.preview, when, source, error);
			if (isLoggable(entry)) await writeSyncLog(this.app, syncLogPath, entry);
		} catch {
			new Notice("Graft could not write the sync log.");
		}
	}

	/** Shows a spinner with `label` while `work` runs: in the status bar on desktop, and as a notice on mobile,
	 * which has no status bar. It clears when the work ends, whether it succeeds or fails. */
	private async whileBusy<T>(label: string, work: () => Promise<T>): Promise<T> {
		this.clearBusy?.();
		let clear: () => void;
		if (Platform.isMobile) {
			const notice = new Notice(label, 0);
			clear = () => notice.hide();
		} else {
			const item = this.addStatusBarItem();
			item.addClass("graft-status");
			item.setAttribute("role", "status");
			item.createSpan({ cls: "graft-spinner", attr: { "aria-hidden": "true" } });
			item.createSpan({ text: label });
			clear = () => item.remove();
		}
		this.clearBusy = clear;
		try {
			return await work();
		} finally {
			clear();
			if (this.clearBusy === clear) this.clearBusy = undefined;
		}
	}

	/** Opens the preview, with the plan if there is one yet. `closed` resolves when it closes. */
	private openPreview(settings: GraftSettings, prepared?: PreparedSync, apply?: () => Promise<void>) {
		// Plans the chosen range against the loaded settings. Nothing is saved.
		const reload = async (range?: SyncRange): Promise<LoadedPreview> => {
			try {
				const next = await this.whileBusy("Graft: reading calendars", () => prepareSync(this.app, settings, fetchIcs, new Date(), range));
				return { preview: next.preview, apply: next.canApply ? () => this.applyPrepared(next, "Apply from preview") : undefined };
			} catch (error) {
				new Notice(errorMessage(error, "Graft could not prepare that range. Check the calendar settings, folders, templates, and ignore list."));
				throw error;
			}
		};
		let resolve!: () => void;
		const closed = new Promise<void>((done) => { resolve = done; }).then(() => { this.previewModal = undefined; });
		const modal = new SyncPreviewModal(this.app, prepared?.preview, prepared?.canApply ? apply : undefined, resolve, reload, this.weekStart());
		this.previewModal = modal;
		modal.open();
		return { modal, closed };
	}

	/** The configured first day of the week, or the one Obsidian's language uses. */
	private weekStart(): WeekDay {
		return resolveWeekStart(this.settings.weekStart, moment.localeData().firstDayOfWeek());
	}

	async loadSettings() {
		this.settings = loadGraftSettings(await this.loadData());
		this.savedCalendarIds = new Set(this.settings.calendars.map((calendar) => calendar.id));
		const { moved, failed } = hydrateSecrets(this.settings, secretStoreOf(this.app));
		if (failed) new Notice("Graft could not read a feed address from secret storage.");
		if (moved) await this.saveSettings();
	}

	async saveSettings() {
		const snapshot: GraftSettings = structuredClone(this.settings);
		this.settingsSave = this.settingsSave.catch(() => {}).then(async () => {
			const ids = new Set(snapshot.calendars.map((calendar) => calendar.id));
			const removed = [...this.savedCalendarIds].filter((id) => !ids.has(id));
			const { data, failed } = prepareForSave(snapshot, secretStoreOf(this.app), removed);
			await this.saveData(data);
			this.savedCalendarIds = ids;
			if (failed) new Notice("Graft could not use secret storage for a feed address. It stays in the plugin settings for now.");
		});
		try {
			await this.settingsSave;
			this.browseCache.clear();
			this.scheduleChecks();
		} catch {
			new Notice("Graft could not save settings. Try editing the setting again.");
		}
	}
}

/** Runs `action` on a click, or on Enter or Space when the element has focus. */
function onActivate(el: HTMLElement, action: () => void) {
	el.addEventListener("click", action);
	el.addEventListener("keydown", (event: KeyboardEvent) => {
		if (event.key !== "Enter" && event.key !== " ") return;
		event.preventDefault();
		action();
	});
}

function errorMessage(error: unknown, fallback: string): string {
	return error instanceof UserFacingError ? error.message : fallback;
}
