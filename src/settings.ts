import { App, PluginSettingTab, Setting, TFile } from "obsidian";
import type GraftPlugin from "./main.ts";
import {
	isDayCount, isFeedUrl, isFilenameRule, isTimezone, isTitleRule, isVaultPath,
} from "./config/settings.ts";
import type { TitleMatchRule } from "./filters/titleMatch.ts";
import type { FilenameConventionRule } from "./generate/personStub.ts";

export class GraftSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: GraftPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		const settings = this.plugin.settings;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Graft" });
		containerEl.createEl("p", { text: "Settings save automatically. Calendar feeds stay read-only. Sync commands and preview are still being connected; these settings do not start a sync yet." });

		this.heading("Calendar feeds");
		containerEl.createEl("p", { text: "Feed URLs are private and stored in this vault's plugin settings. Keep them out of shared notes, screenshots, and logs. Leave a URL blank to leave that feed unconfigured." });
		for (const [key, label] of [["google", "Google"], ["outlook", "Outlook / Microsoft 365"]] as const) {
			this.text(`${label} ICS URL`, "Use the calendar's ICS subscription URL, preferably HTTPS.", settings.feeds[key].url,
				(value) => { settings.feeds[key].url = value.trim(); },
				(value) => isFeedUrl(value) ? undefined : "Use an HTTP or HTTPS URL without a username or password, or leave blank.", true);
			this.text(`${label} invited as`, "Identity to write to the Meeting note's invited_as field.", settings.feeds[key].invitedAs,
				(value) => { settings.feeds[key].invitedAs = value; });
		}

		this.heading("Folders and templates");
		for (const [key, label] of [["meeting", "Meeting"], ["person", "Person"], ["series", "Series"], ["company", "Company"]] as const) {
			this.text(`${label} folder`, key === "company" ? "Folder containing existing Company notes. Graft does not create Company notes." : "Vault-relative folder for matching and new notes.", settings.folders[key],
				(value) => { settings.folders[key] = value; },
				(value) => isVaultPath(value, false) ? undefined : "Use a non-empty vault-relative path without parent traversal.");
		}
		for (const [key, label] of [["meeting", "Meeting"], ["person", "Person"], ["series", "Series"]] as const) {
			this.text(`${label} template`, "Path to a Markdown template in this vault. Blank uses the built-in body. Graft placeholders use {{name}}; Templater scripts are not executed.", settings.templates[key],
				(value) => { settings.templates[key] = value; },
				(value) => this.templateError(value));
		}
		this.text("Meeting filename pattern", "Available placeholders: {{title}} and {{date}}. Unknown placeholders remain visible.", settings.meetingFilenamePattern,
			(value) => { settings.meetingFilenamePattern = value; },
			(value) => value.trim() ? undefined : "Enter a filename pattern.");

		this.heading("Filters");
		this.text("Ignore-list file", "Vault-relative JSON file path. Blank disables the ignore list; a missing file ignores nothing.", settings.ignoreListPath,
			(value) => { settings.ignoreListPath = value; },
			(value) => isVaultPath(value) ? undefined : "Use a vault-relative path without parent traversal, or leave blank.");
		this.titleRules();
		this.filenameRules();

		this.heading("Sync window");
		this.text("Timezone", "Timezone used for Meeting dates and times, such as UTC or Europe/London.", settings.timezone,
			(value) => { settings.timezone = value; },
			(value) => isTimezone(value) ? undefined : "Enter a valid timezone.");
		this.days("Days back", "daysBack");
		this.days("Days ahead", "daysAhead");

		this.heading("Sync behavior");
		for (const [key, name, desc] of [
			["createPersonStubs", "Create Person stubs", "Create a minimal Person note when an attendee has no match."],
			["createSeriesStubs", "Create Series stubs", "Create a minimal Series note when a recurring event has no match."],
			["strictCompanyLinks", "Strict Company links", "Require Company links to resolve to existing Company notes."],
			["previewBeforeApply", "Preview before apply", "Show planned changes before writing notes."],
			["autoRunOnStartup", "Sync on startup", "Run sync when the plugin loads, once the sync commands are connected."],
		] as const) {
			new Setting(containerEl).setName(name).setDesc(desc).addToggle((toggle) => toggle
				.setValue(settings[key]).onChange(async (value) => {
					settings[key] = value;
					await this.plugin.saveSettings();
				}));
		}
	}

	private heading(text: string): void {
		this.containerEl.createEl("h3", { text });
	}

	private text(
		name: string, description: string, value: string, update: (value: string) => void,
		validate: (value: string) => string | undefined = () => undefined, masked = false,
	): void {
		const setting = new Setting(this.containerEl).setName(name).setDesc(description);
		const error = setting.descEl.createEl("div", { attr: { role: "status", "aria-live": "polite" } });
		setting.addText((input) => {
			input.setValue(value);
			input.inputEl.setAttribute("aria-label", name);
			if (masked) {
				input.inputEl.type = "password";
				input.inputEl.autocomplete = "off";
				input.inputEl.spellcheck = false;
			}
			input.onChange(async (next) => {
				const message = validate(next);
				error.setText(message ? `${message} Change not saved.` : "");
				input.inputEl.setAttribute("aria-invalid", String(Boolean(message)));
				if (message) return;
				update(next);
				await this.plugin.saveSettings();
			});
		});
	}

	private templateError(value: string): string | undefined {
		if (!isVaultPath(value)) return "Use a vault-relative path without parent traversal, or leave blank.";
		if (!value) return undefined;
		if (!value.endsWith(".md")) return "Choose a Markdown (.md) file.";
		if (!(this.app.vault.getAbstractFileByPath(value) instanceof TFile)) return "The template file does not exist in this vault.";
		return undefined;
	}

	private days(name: string, key: "daysBack" | "daysAhead"): void {
		this.text(name, "Whole number of days, zero or greater.", String(this.plugin.settings[key]),
			(value) => { this.plugin.settings[key] = Number(value); },
			(value) => /^\d+$/.test(value) && isDayCount(Number(value)) ? undefined : "Enter a whole number of days, zero or greater.");
	}

	private titleRules(): void {
		this.heading("Title skip rules");
		this.containerEl.createEl("p", { text: "The first matching rule skips the event. Rules run from top to bottom. Save each row after editing." });
		const rules = this.plugin.settings.titleMatchRules;
		rules.forEach((rule, index) => this.titleRow({ ...rule }, index));
		this.titleRow({ mode: "contains", value: "", caseSensitive: false });
	}

	private titleRow(draft: TitleMatchRule, index?: number): void {
		const row = new Setting(this.containerEl).setName(index === undefined ? "New title rule" : `Title rule ${index + 1}`);
		const error = row.descEl.createEl("div", { attr: { role: "status", "aria-live": "polite" } });
		row.addDropdown((input) => input.addOptions({ exact: "Exact", prefix: "Prefix", suffix: "Suffix", contains: "Contains" })
			.setValue(draft.mode).onChange((value) => { draft.mode = value as TitleMatchRule["mode"]; }));
		row.addText((input) => {
			input.inputEl.setAttribute("aria-label", "Title rule text");
			input.setPlaceholder("Title text to skip").setValue(draft.value).onChange((value) => { draft.value = value; });
		});
		row.addToggle((input) => input.setTooltip("Case-sensitive match").setValue(draft.caseSensitive ?? false)
			.onChange((value) => { draft.caseSensitive = value; }));
		row.addButton((button) => button.setButtonText(index === undefined ? "Add" : "Save").onClick(async () => {
			if (!isTitleRule(draft)) { error.setText("Enter non-empty title text. Change not saved."); return; }
			const rules = this.plugin.settings.titleMatchRules;
			if (index === undefined) rules.push({ ...draft }); else rules[index] = { ...draft };
			this.display();
			await this.plugin.saveSettings();
		}));
		if (index !== undefined) this.rowActions(row, this.plugin.settings.titleMatchRules, index);
	}

	private filenameRules(): void {
		this.heading("Person filename conventions");
		this.containerEl.createEl("p", { text: "The first matching email domain selects the filename style. Unlisted domains use the full name. Save each row after editing." });
		this.plugin.settings.personFilenameRules.forEach((rule, index) => this.filenameRow({ ...rule }, index));
		this.filenameRow({ domain: "", style: "full" });
	}

	private filenameRow(draft: FilenameConventionRule, index?: number): void {
		const row = new Setting(this.containerEl).setName(index === undefined ? "New filename rule" : `Filename rule ${index + 1}`);
		const error = row.descEl.createEl("div", { attr: { role: "status", "aria-live": "polite" } });
		row.addText((input) => {
			input.inputEl.setAttribute("aria-label", "Email domain");
			input.setPlaceholder("example.com").setValue(draft.domain).onChange((value) => { draft.domain = value.trim().toLowerCase(); });
		});
		row.addDropdown((input) => input.addOptions({ full: "Full name", firstOnly: "First name", initialLast: "Initial and last name" })
			.setValue(draft.style).onChange((value) => { draft.style = value as FilenameConventionRule["style"]; }));
		row.addButton((button) => button.setButtonText(index === undefined ? "Add" : "Save").onClick(async () => {
			if (!isFilenameRule(draft)) { error.setText("Enter an email domain without an address or URL. Change not saved."); return; }
			const rules = this.plugin.settings.personFilenameRules;
			if (index === undefined) rules.push({ ...draft }); else rules[index] = { ...draft };
			this.display();
			await this.plugin.saveSettings();
		}));
		if (index !== undefined) this.rowActions(row, this.plugin.settings.personFilenameRules, index);
	}

	private rowActions<T>(row: Setting, rules: T[], index: number): void {
		for (const [label, offset] of [["Up", -1], ["Down", 1]] as const) {
			row.addButton((button) => button.setButtonText(label).setDisabled(index + offset < 0 || index + offset >= rules.length)
				.onClick(async () => {
					[rules[index], rules[index + offset]] = [rules[index + offset], rules[index]];
					this.display();
					await this.plugin.saveSettings();
				}));
		}
		row.addButton((button) => button.setButtonText("Remove").onClick(async () => {
			rules.splice(index, 1);
			this.display();
			await this.plugin.saveSettings();
		}));
	}
}
