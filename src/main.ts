import { Notice, Plugin } from "obsidian";
import { GraftSettingTab } from "./settings.ts";
import { loadGraftSettings, type GraftSettings } from "./config/settings.ts";
import { SyncPreviewModal } from "./preview/modal.ts";
import { prepareSync, applySync } from "./sync/flow.ts";
import { fetchIcs } from "./ics/fetch.ts";

/** Loads settings and connects the sync commands. */
export default class GraftPlugin extends Plugin {
	settings: GraftSettings;
	private settingsSave: Promise<void> = Promise.resolve();
	private syncing = false;
	private previewModal?: SyncPreviewModal;
	private unloaded = false;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new GraftSettingTab(this.app, this));
		this.addCommand({ id: "preview-sync", name: "Preview sync", callback: () => { void this.runSync(true); } });
		this.addCommand({ id: "sync-now", name: "Sync now", callback: () => { void this.runSync(false); } });
		this.app.workspace.onLayoutReady(() => { if (this.settings.autoRunOnStartup) void this.runSync(false); });
	}

	onunload() { this.unloaded = true; this.previewModal?.close(); }

	async runSync(previewOnly: boolean) {
		if (this.syncing) { new Notice("A Graft sync or preview is already open."); return; }
		this.syncing = true;
		try {
			const settings: GraftSettings = JSON.parse(JSON.stringify(this.settings));
			const prepared = await prepareSync(this.app, settings, fetchIcs);
			if (this.unloaded) return;
			const apply = async () => {
				if (this.unloaded) return;
				try { await applySync(this.app, prepared); new Notice("Graft sync finished."); }
				catch { new Notice("Graft sync stopped. Check the vault and run Preview sync again."); }
			};
			if (previewOnly || settings.previewBeforeApply || !prepared.canApply) {
				await new Promise<void>((resolve) => {
					this.previewModal = new SyncPreviewModal(this.app, prepared.preview, prepared.canApply ? apply : undefined, resolve);
					this.previewModal.open();
				});
				this.previewModal = undefined;
			} else await apply();
		} catch { new Notice("Graft could not prepare the sync. Check the feed settings, folders, templates, and ignore list."); }
		finally { this.syncing = false; }
	}

	async loadSettings() {
		this.settings = loadGraftSettings(await this.loadData());
	}

	async saveSettings() {
		const snapshot: GraftSettings = JSON.parse(JSON.stringify(this.settings));
		this.settingsSave = this.settingsSave.catch(() => {}).then(() => this.saveData(snapshot));
		try {
			await this.settingsSave;
		} catch {
			new Notice("Graft could not save settings. Try editing the setting again.");
		}
	}
}
