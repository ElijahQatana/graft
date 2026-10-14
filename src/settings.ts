import { App, PluginSettingTab, Setting, TFile } from "obsidian";
import type GraftPlugin from "./main.ts";
import {
	isDayCount, isFeedUrl, isFilenameRule, isTimezone, isTitleRule, isVaultPath,
} from "./config/settings.ts";
import {
	MINIMAL_SCHEMA, ORIGINAL_SCHEMA, OPTIONAL_MEETING_FIELDS, cloneSchema, isExtraField, isFieldName, isHeading, isTypeValue,
	schemaConflict, type ExtraField, type MeetingFieldKey, type NoteSchema, type PersonFieldKey, type SeriesFieldKey,
} from "./config/schema.ts";
import type { TitleMatchRule } from "./filters/titleMatch.ts";
import type { FilenameConventionRule } from "./generate/personStub.ts";

type Kind = "name" | "optionalName" | "type" | "heading";

const LABEL = { meeting: "Meeting", person: "Person", series: "Series", company: "Company" } as const;
const MEETING_LABELS: Record<MeetingFieldKey, string> = {
	title: "Title", date: "Date", scheduledStart: "Scheduled start", scheduledEnd: "Scheduled end", organizer: "Organizer",
	invited: "Invited", series: "Series link", invitedAs: "Invited as", inviteUpdated: "Invite updated", uid: "Event UID",
	recurrenceId: "Recurrence ID", occurrenceStatus: "Occurrence status",
};
const PERSON_LABELS: Record<PersonFieldKey, string> = {
	email: "Email", emailAliases: "Email aliases", company: "Company links", fullName: "Full name", firstName: "First name", lastName: "Last name",
};
const SERIES_LABELS: Record<SeriesFieldKey, string> = { uid: "Event UID", title: "Title" };
const RENAME_NOTE = "Changing this does not rename it in existing notes, which may then show as new.";
const MEETING_MATCH: MeetingFieldKey[] = ["uid", "recurrenceId"];
const PERSON_MATCH: PersonFieldKey[] = ["email", "emailAliases"];

export class GraftSettingTab extends PluginSettingTab {
	/** Where settings rows are added; the schema section swaps in a collapsible block. */
	private target!: HTMLElement;
	/** Survives display() rebuilds so row saves and presets do not collapse the schema section. */
	private schemaOpen = false;

	constructor(app: App, private plugin: GraftPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		const settings = this.plugin.settings;
		const scrollTop = containerEl.scrollTop;
		containerEl.empty();
		this.target = containerEl;
		containerEl.createEl("h2", { text: "Graft" });
		containerEl.createEl("p", { text: "Settings save automatically. Calendar feeds stay read-only. Run Graft: Preview sync or Graft: Sync now from the command palette to use these settings." });

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
			["autoRunOnStartup", "Sync on startup", "Run Sync now when Obsidian starts. Follows the preview setting."],
		] as const) {
			new Setting(containerEl).setName(name).setDesc(desc).addToggle((toggle) => toggle
				.setValue(settings[key]).onChange(async (value) => {
					settings[key] = value;
					await this.plugin.saveSettings();
				}));
		}
		this.schemaSection();
		containerEl.scrollTop = scrollTop;
	}

	private heading(text: string): void {
		this.target.createEl("h3", { text });
	}

	private text(
		name: string, description: string, value: string, update: (value: string) => void,
		validate: (value: string) => string | undefined = () => undefined, masked = false,
	): void {
		const setting = new Setting(this.target).setName(name).setDesc(description);
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
		this.target.createEl("p", { text: "The first matching rule skips the event. Rules run from top to bottom. Save each row after editing." });
		const rules = this.plugin.settings.titleMatchRules;
		rules.forEach((rule, index) => this.titleRow({ ...rule }, index));
		this.titleRow({ mode: "contains", value: "", caseSensitive: false });
	}

	private titleRow(draft: TitleMatchRule, index?: number): void {
		const row = new Setting(this.target).setName(index === undefined ? "New title rule" : `Title rule ${index + 1}`);
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
		this.target.createEl("p", { text: "The first matching email domain selects the filename style. Unlisted domains use the full name. Save each row after editing." });
		this.plugin.settings.personFilenameRules.forEach((rule, index) => this.filenameRow({ ...rule }, index));
		this.filenameRow({ domain: "", style: "full" });
	}

	private filenameRow(draft: FilenameConventionRule, index?: number): void {
		const row = new Setting(this.target).setName(index === undefined ? "New filename rule" : `Filename rule ${index + 1}`);
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

	private schemaSection(): void {
		const details = this.containerEl.createEl("details");
		details.open = this.schemaOpen;
		details.addEventListener("toggle", () => { this.schemaOpen = details.open; });
		details.createEl("summary", { text: "Note schema (advanced)" });
		this.target = details;
		this.target.createEl("p", { text: "Property names, note types and headings Graft reads and writes. Defaults suit a new vault; change them to match your own notes. Existing notes keep their current names until you edit them." });
		new Setting(this.target).setName("Schema preset").setDesc("Replaces every schema setting below. Minimal is the default for new vaults. Original matches the schema used before these settings existed.")
			.addButton((button) => button.setButtonText("Use minimal").onClick(async () => this.applyPreset(MINIMAL_SCHEMA)))
			.addButton((button) => button.setButtonText("Use original").onClick(async () => this.applyPreset(ORIGINAL_SCHEMA)));
		const schema = this.plugin.settings.schema;

		this.heading("Note types");
		this.schemaText("Type property", "Property that holds the note type.", "name", (s) => s.typeField, (s, v) => { s.typeField = v; }, true);
		for (const key of ["meeting", "person", "series", "company"] as const) {
			this.schemaText(`${LABEL[key]} type value`, "Value of the type property for these notes.", "type", (s) => s.types[key], (s, v) => { s.types[key] = v; }, true);
		}

		this.heading("Meeting properties");
		for (const key of Object.keys(MEETING_LABELS) as MeetingFieldKey[]) {
			const optional = OPTIONAL_MEETING_FIELDS.includes(key);
			this.schemaText(`Meeting property: ${MEETING_LABELS[key]}`, optional ? "Property name. Leave blank to skip it." : "Property name.", optional ? "optionalName" : "name", (s) => s.meeting[key], (s, v) => { s.meeting[key] = v; }, MEETING_MATCH.includes(key));
		}
		this.heading("Person properties");
		for (const key of Object.keys(PERSON_LABELS) as PersonFieldKey[]) {
			this.schemaText(`Person property: ${PERSON_LABELS[key]}`, "Property name.", "name", (s) => s.person[key], (s, v) => { s.person[key] = v; }, PERSON_MATCH.includes(key));
		}
		this.heading("Series and Company properties");
		for (const key of Object.keys(SERIES_LABELS) as SeriesFieldKey[]) {
			this.schemaText(`Series property: ${SERIES_LABELS[key]}`, key === "uid" ? "Property that stores the calendar event UID." : "Property name.", "name", (s) => s.series[key], (s, v) => { s.series[key] = v; }, key === "uid");
		}
		this.schemaText("Company property: Domain", "Property that holds a Company's email domain.", "name", (s) => s.company.domain, (s, v) => { s.company.domain = v; }, true);

		this.heading("Headings");
		this.schemaText("Invite agenda heading", "Heading Graft keeps up to date, such as ## Invite Agenda.", "heading", (s) => s.headings.inviteAgenda, (s, v) => { s.headings.inviteAgenda = v; });
		this.schemaText("Series agenda heading", "Heading for the Series agenda in new built-in Meeting bodies.", "heading", (s) => s.headings.seriesAgenda, (s, v) => { s.headings.seriesAgenda = v; });
		this.schemaText("Standing agenda heading", "Heading in a Series note whose content is copied into new Meetings.", "heading", (s) => s.headings.standingAgenda, (s, v) => { s.headings.standingAgenda = v; });

		const body = new Setting(this.target).setName("Built-in Meeting body").setDesc("Used when no Meeting template is set. Placeholders: {{series_section}} and {{invite_section}}; the invite section is required.");
		const bodyError = body.descEl.createEl("div", { attr: { role: "status", "aria-live": "polite" } });
		body.addTextArea((input) => {
			input.inputEl.setAttribute("aria-label", "Built-in Meeting body");
			input.setValue(schema.meetingBody).onChange(async (value) => {
				const message = value.includes("{{invite_section}}") ? undefined : "Include {{invite_section}}.";
				bodyError.setText(message ? `${message} Change not saved.` : "");
				if (message) return;
				schema.meetingBody = value;
				await this.plugin.saveSettings();
			});
		});

		this.heading("Extra Meeting properties");
		this.target.createEl("p", { text: "Extra properties written to new Meeting notes. Turn on Update to refresh one on every sync. Values can use {{title}}, {{date}}, {{week}}, {{month}}, {{year}}, {{weekday}}, {{recurrence}} and {{companies}}. Write a list as [\"a\", \"b\"]. Save each row after editing." });
		schema.meetingExtras.forEach((field, index) => this.extraRow({ ...field }, index));
		this.extraRow({ key: "", value: "", updateOnSync: false });
		this.target = this.containerEl;
	}

	private applyPreset(preset: NoteSchema): void {
		this.plugin.settings.schema = cloneSchema(preset);
		this.display();
		void this.plugin.saveSettings();
	}

	private schemaText(name: string, description: string, kind: Kind, read: (schema: NoteSchema) => string, write: (schema: NoteSchema, value: string) => void, matches = false): void {
		const schema = this.plugin.settings.schema;
		this.text(name, matches ? `${description} ${RENAME_NOTE}` : description, read(schema), (value) => write(schema, value), (value) => {
			const valid = kind === "heading" ? isHeading(value) : kind === "type" ? isTypeValue(value) : kind === "optionalName" ? value === "" || isFieldName(value) : isFieldName(value);
			if (!valid) return kind === "heading" ? "Use a Markdown heading such as ## Title." : "Enter a non-empty name without colons or surrounding spaces.";
			const candidate = cloneSchema(schema);
			write(candidate, value);
			return schemaConflict(candidate) ? "Another property of this note type already uses that name." : undefined;
		});
	}

	private extraRow(draft: ExtraField, index?: number): void {
		const row = new Setting(this.target).setName(index === undefined ? "New extra property" : `Extra property ${index + 1}`);
		const error = row.descEl.createEl("div", { attr: { role: "status", "aria-live": "polite" } });
		let text = Array.isArray(draft.value) ? JSON.stringify(draft.value) : draft.value;
		row.addText((input) => {
			input.inputEl.setAttribute("aria-label", "Extra property name");
			input.setPlaceholder("Property name").setValue(draft.key).onChange((value) => { draft.key = value; });
		});
		row.addText((input) => {
			input.inputEl.setAttribute("aria-label", "Extra property value");
			input.setPlaceholder("Value").setValue(text).onChange((value) => { text = value; });
		});
		row.addToggle((input) => input.setTooltip("Update on every sync").setValue(draft.updateOnSync).onChange((value) => { draft.updateOnSync = value; }));
		row.addButton((button) => button.setButtonText(index === undefined ? "Add" : "Save").onClick(async () => {
			const field = { key: draft.key, value: parseExtraValue(text), updateOnSync: draft.updateOnSync };
			if (!isExtraField(field)) { error.setText("Enter a property name and a text or list value. Change not saved."); return; }
			const schema = this.plugin.settings.schema;
			const candidate = cloneSchema(schema);
			if (index === undefined) candidate.meetingExtras.push(field); else candidate.meetingExtras[index] = field;
			if (schemaConflict(candidate)) { error.setText("Another Meeting property already uses that name. Change not saved."); return; }
			schema.meetingExtras = candidate.meetingExtras;
			this.display();
			await this.plugin.saveSettings();
		}));
		if (index !== undefined) this.rowActions(row, this.plugin.settings.schema.meetingExtras, index);
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

/** Text is a literal value; text that starts with [ must be a JSON list of strings. */
function parseExtraValue(text: string): unknown {
	if (!text.trim().startsWith("[")) return text;
	try { return JSON.parse(text); } catch { return undefined; }
}
