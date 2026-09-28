import { App, PluginSettingTab, Setting } from "obsidian";
import type GraftPlugin from "./main.ts";

/**
 * Empty for now. Every real setting (feed URLs, folders, templates,
 * filters, feature toggles) lands in GFT-014; this is just the tab
 * shell so settings.ts and its persistence wiring exist from the
 * start rather than being bolted on later.
 */
export interface GraftSettings {}

export const DEFAULT_SETTINGS: GraftSettings = {};

export class GraftSettingTab extends PluginSettingTab {
	plugin: GraftPlugin;

	constructor(app: App, plugin: GraftPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Graft" });
		containerEl.createEl("p", {
			text: "Read-only sync of a Google Calendar and an Outlook/Microsoft 365 calendar into your existing meeting-note schema. Settings land here in a later milestone.",
		});
	}
}
