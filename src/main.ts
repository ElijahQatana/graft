import { Notice, Plugin } from "obsidian";
import { GraftSettingTab } from "./settings.ts";
import { loadGraftSettings, type GraftSettings } from "./config/settings.ts";

/** Loads the plugin settings and tab. Sync commands are not connected yet. */
export default class GraftPlugin extends Plugin {
	settings: GraftSettings;
	private settingsSave: Promise<void> = Promise.resolve();

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new GraftSettingTab(this.app, this));
	}

	onunload() {}

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
