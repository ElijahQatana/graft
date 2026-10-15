import { Notice, Plugin } from "obsidian";
import { GraftSettingTab } from "./settings.ts";
import { loadGraftSettings, type GraftSettings } from "./config/settings.ts";
import { SyncPreviewModal } from "./preview/modal.ts";
import { prepareSync, applySync, type PreparedSync } from "./sync/flow.ts";
import { UserFacingError } from "./sync/userFacingError.ts";
import { hydrateSecrets, prepareForSave, secretStoreOf } from "./config/secrets.ts";
import { fetchIcs } from "./ics/fetch.ts";

/** Loads settings and connects the sync commands. */
export default class GraftPlugin extends Plugin {
	settings: GraftSettings;
	private settingsSave: Promise<void> = Promise.resolve();
	private syncing = false;
	private previewModal?: SyncPreviewModal;
	private unloaded = false;
	/** Calendar ids as last saved, so a removed calendar's secret can be cleared. */
	private savedCalendarIds = new Set<string>();

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new GraftSettingTab(this.app, this));
		this.addCommand({ id: "preview-sync", name: "Preview sync", callback: () => { void this.runSync(true); } });
		this.addCommand({ id: "sync-now", name: "Sync now", callback: () => { void this.runSync(false); } });
		this.app.workspace.onLayoutReady(() => {
			if (this.settings.autoRunOnStartup) void this.runSync(false);
		});
	}

	onunload() {
		this.unloaded = true;
		this.previewModal?.close();
	}

	async runSync(previewOnly: boolean) {
		if (this.syncing) {
			new Notice("A Graft sync or preview is already open.");
			return;
		}
		this.syncing = true;
		try {
			const settings: GraftSettings = structuredClone(this.settings);
			const prepared = await prepareSync(this.app, settings, fetchIcs);
			if (this.unloaded) return;
			const apply = () => this.applyPrepared(prepared);
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

	private async applyPrepared(prepared: PreparedSync) {
		if (this.unloaded) return;
		try {
			await applySync(this.app, prepared);
			new Notice("Graft sync finished.");
		} catch (error) {
			new Notice(errorMessage(error, "Graft sync stopped. Check the vault and run Preview sync again."));
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
		} catch {
			new Notice("Graft could not save settings. Try editing the setting again.");
		}
	}
}

function errorMessage(error: unknown, fallback: string): string {
	return error instanceof UserFacingError ? error.message : fallback;
}
