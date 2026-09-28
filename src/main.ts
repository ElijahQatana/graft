import { Plugin } from "obsidian";
import {
	DEFAULT_SETTINGS,
	GraftSettings,
	GraftSettingTab,
} from "./settings.ts";

/**
 * Graft syncs a Google Calendar and an Outlook/Microsoft 365 calendar,
 * read-only, into the Meeting/Series/Person/Company notes this vault
 * already uses. This is just the load/unload skeleton; the sync
 * engine itself lands in later milestones.
 */
export default class GraftPlugin extends Plugin {
	settings: GraftSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new GraftSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
