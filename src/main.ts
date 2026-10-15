import { Notice, Platform, Plugin } from "obsidian";
import { GraftSettingTab } from "./settings.ts";
import { DEFAULT_SETTINGS, loadGraftSettings, type GraftSettings } from "./config/settings.ts";
import { SyncPreviewModal } from "./preview/modal.ts";
import { prepareSync, applySync, type PreparedSync } from "./sync/flow.ts";
import { UserFacingError } from "./sync/userFacingError.ts";
import { hydrateSecrets, prepareForSave, secretStoreOf } from "./config/secrets.ts";
import { fetchIcs } from "./ics/fetch.ts";
import { isLoggable, isInsideNoteFolders, logEntryFromPreview } from "./sync/log.ts";
import { writeSyncLog } from "./sync/logFile.ts";
import { countPlannedChanges, FAILURES_BEFORE_WARNING, planFingerprint } from "./sync/scheduled.ts";
import { DateTime } from "luxon";

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

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new GraftSettingTab(this.app, this));
		this.addCommand({ id: "preview-sync", name: "Preview sync", callback: () => { void this.runSync(true); } });
		this.addCommand({ id: "sync-now", name: "Sync now", callback: () => { void this.runSync(false); } });
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
			const prepared = await this.whileBusy(previewOnly ? "Graft: checking calendars" : "Graft: syncing", () => prepareSync(this.app, settings, fetchIcs));
			if (this.unloaded) return;
			const direct = !previewOnly && !settings.previewBeforeApply && prepared.canApply;
			const apply = () => this.applyPrepared(prepared, direct ? "Sync now" : "Apply from preview");
			if (previewOnly || settings.previewBeforeApply || !prepared.canApply) {
				await this.showPreview(prepared, apply);
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

	/** One background check. It plans like Preview sync but writes nothing, and says so only when new changes are ready. */
	async scheduledCheck() {
		if (this.syncing || this.unloaded || this.settings.scheduledSync === "off") return;
		this.syncing = true;
		try {
			const prepared = await prepareSync(this.app, structuredClone(this.settings), fetchIcs);
			if (this.unloaded) return;
			if (prepared.preview.errors.length) throw new Error("A calendar could not be read.");
			this.checkFailures = 0;
			const changes = countPlannedChanges(prepared.preview);
			if (!changes) {
				this.lastAnnounced = "";
				this.clearReady();
				return;
			}
			const fingerprint = planFingerprint(prepared.preview);
			if (fingerprint === this.lastAnnounced) return;
			this.lastAnnounced = fingerprint;
			this.announceReady(`Graft: ${changes} ${changes === 1 ? "change" : "changes"} ready to review`);
		} catch {
			this.checkFailures++;
			if (this.checkFailures === FAILURES_BEFORE_WARNING) this.announceReady("Graft: the last check failed", "Graft: scheduled checks keep failing. Run Preview sync to see why.");
		} finally {
			this.syncing = false;
		}
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
			item.addEventListener("click", () => { void this.runSync(true); });
			this.readyItem = item;
		}
		const notice = new Notice(createFragment((fragment) => {
			fragment.createSpan({ text: `${noticeText} ` });
			const open = fragment.createEl("a", { text: "Open preview", attr: { role: "button", tabindex: "0" } });
			open.addEventListener("click", () => { notice.hide(); void this.runSync(true); });
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

	/** Resolves when the preview closes. Apply is offered only when the plan can be applied. */
	private async showPreview(prepared: PreparedSync, apply: () => Promise<void>) {
		await new Promise<void>((resolve) => {
			this.previewModal = new SyncPreviewModal(this.app, prepared.preview, prepared.canApply ? apply : undefined, resolve);
			this.previewModal.open();
		});
		this.previewModal = undefined;
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
			this.scheduleChecks();
		} catch {
			new Notice("Graft could not save settings. Try editing the setting again.");
		}
	}
}

function errorMessage(error: unknown, fallback: string): string {
	return error instanceof UserFacingError ? error.message : fallback;
}
