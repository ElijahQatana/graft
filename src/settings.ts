import { App, PluginSettingTab, Setting, TFile } from "obsidian";
import type GraftPlugin from "./main.ts";
import {
	isCalendarType, isCalendarUrl, isDayCount, isFilenameRule, isTimezone, isTitleRule, isVaultPath, sameCalendarName,
	type CalendarSettings,
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

/** A settings row the search can show or hide. */
interface Row { el?: HTMLElement; text: string; error: boolean; section?: Section }

/** A collapsible group of rows. Groups can nest, as the Note schema sub-groups do. */
interface Section { id: string; details: HTMLDetailsElement; body: HTMLElement; rows: Row[]; loose: HTMLElement[]; children: Section[]; parent?: Section; defaultOpen: boolean }

export class GraftSettingTab extends PluginSettingTab {
	/** Where settings rows are added: the tab itself, or the body of the section being built. */
	private target!: HTMLElement;
	private current?: Section;
	private sections: Section[] = [];
	private rowOf = new WeakMap<Setting, Row>();
	/** Survives display() rebuilds, so saving, moving or removing a row does not collapse what the user opened. */
	private openState = new Map<string, boolean>();
	/** Survives display() rebuilds, so a search stays applied while a row is saved. */
	private query = "";
	private emptyEl?: HTMLElement;

	constructor(app: App, private plugin: GraftPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		const settings = this.plugin.settings;
		const scrollTop = containerEl.scrollTop;
		containerEl.empty();
		containerEl.classList?.add("graft-settings");
		this.target = containerEl;
		this.current = undefined;
		this.sections = [];
		this.rowOf = new WeakMap();
		containerEl.createEl("p", { cls: "graft-intro", text: "Settings save automatically. Calendar feeds stay read-only. Run Graft: Preview sync or Graft: Sync now from the command palette to use these settings." });
		this.searchBox();

		this.calendars();

		this.group("folders", "Folders and templates");
		for (const [key, label] of [["meeting", "Meeting"], ["person", "Person"], ["series", "Series"], ["company", "Company"]] as const) {
			if (key === "company" && !settings.companyLinking) continue;
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

		this.group("filters", "Filters");
		this.text("Ignore-list file", "Vault-relative JSON file path. Blank disables the ignore list; a missing file ignores nothing.", settings.ignoreListPath,
			(value) => { settings.ignoreListPath = value; },
			(value) => isVaultPath(value) ? undefined : "Use a vault-relative path without parent traversal, or leave blank.");
		this.titleRules();
		this.filenameRules();

		this.group("window", "Sync window");
		this.text("Timezone", "Timezone used for Meeting dates and times, such as UTC or Europe/London.", settings.timezone,
			(value) => { settings.timezone = value; },
			(value) => isTimezone(value) ? undefined : "Enter a valid timezone.");
		this.days("Days back", "daysBack");
		this.days("Days ahead", "daysAhead");

		this.group("behavior", "Sync behavior");
		for (const [key, name, desc] of [
			["createPersonStubs", "Create Person stubs", "Create a minimal Person note when an attendee has no match."],
			["createSeriesStubs", "Create Series stubs", "Create a minimal Series note when a recurring event has no match."],
			["companyLinking", "Company linking", "Link Person and Meeting notes to existing Company notes. Off by default. Turn on to set the Company folder, type, domain property and strict links."],
			["strictCompanyLinks", "Strict Company links", "Require Company links to resolve to existing Company notes."],
			["previewBeforeApply", "Preview before apply", "Show planned changes before writing notes."],
			["autoRunOnStartup", "Sync on startup", "Run Sync now when Obsidian starts. Follows the preview setting."],
		] as const) {
			if (key === "strictCompanyLinks" && !settings.companyLinking) continue;
			this.row(name, desc).addToggle((toggle) => toggle
				.setValue(settings[key]).onChange(async (value) => {
					settings[key] = value;
					await this.plugin.saveSettings();
					if (key === "companyLinking") this.display();
				}));
		}
		this.schemaSection();
		this.emptyEl = containerEl.createEl("p", { cls: "graft-help graft-no-results", attr: { role: "status", "aria-live": "polite" } });
		this.applyFilter();
		containerEl.scrollTop = scrollTop;
	}

	hide(): void {
		this.query = "";
	}

	/** A section heading inside a group. It is a row, so a search can match it by name. */
	private heading(text: string): void {
		const setting = this.row(text).setHeading();
		setting.settingEl?.classList?.add("graft-heading");
	}

	private help(text: string): void {
		this.loose(this.target.createEl("p", { cls: "graft-help", text }));
	}

	/** Headings and help text have nothing to match, so a search hides them. */
	private loose(el: HTMLElement): void {
		this.current?.loose.push(el);
	}

	private searchBox(): void {
		const bar = this.containerEl.createEl("div", { cls: "graft-search" });
		const input = bar.createEl("input", { cls: "graft-search-input", attr: { type: "search", placeholder: "Search settings", "aria-label": "Search settings", autocomplete: "off", spellcheck: "false" } });
		input.value = this.query;
		const clear = bar.createEl("button", { cls: "graft-search-clear", text: "Clear", attr: { type: "button", "aria-label": "Clear search" } });
		clear.hidden = this.query === "";
		const update = (value: string) => {
			this.query = value;
			clear.hidden = value === "";
			this.applyFilter();
		};
		input.addEventListener("input", () => update(input.value));
		input.addEventListener("keydown", (event: KeyboardEvent) => {
			if (event.key !== "Escape" || !input.value) return;
			event.stopPropagation();
			input.value = "";
			update("");
		});
		clear.addEventListener("click", () => {
			input.value = "";
			update("");
			input.focus();
		});
	}

	/** Collapsible group. Its open state is remembered by id, so it survives display(). */
	private group(id: string, title: string, parent?: Section, defaultOpen = !parent && id !== "schema"): Section {
		const host = parent ? parent.body : this.containerEl;
		const details = host.createEl("details", { cls: parent ? "graft-group graft-subgroup" : "graft-group", attr: { "data-graft-group": id } });
		details.open = this.openState.get(id) ?? defaultOpen;
		details.createEl("summary", { cls: "graft-group-title", text: title });
		const body = details.createEl("div", { cls: "graft-group-body" });
		const section: Section = { id, details, body, rows: [], loose: [], children: [], parent, defaultOpen };
		(parent ? parent.children : this.sections).push(section);
		details.addEventListener("toggle", () => {
			// A section holding an error message stays open, so the message cannot be hidden.
			if (!details.open && this.hasError(section)) { details.open = true; return; }
			// While searching, sections are opened and closed by the search, not the user.
			if (!this.query.trim()) this.openState.set(id, details.open);
		});
		this.target = body;
		this.current = section;
		return section;
	}

	/** Adds a settings row that the search can find by name and description. */
	private row(name: string, description = "", keywords = ""): Setting {
		const setting = new Setting(this.target).setName(name);
		if (description) setting.setDesc(description);
		const row: Row = { el: setting.settingEl, text: `${name} ${description} ${keywords}`.toLowerCase(), error: false, section: this.current };
		this.current?.rows.push(row);
		this.rowOf.set(setting, row);
		return setting;
	}

	/** The message line of a row. A row with a message stays visible while searching, and keeps its section open. */
	private errorSlot(setting: Setting): { setText(message: string): void } {
		const el = setting.descEl.createEl("div", { cls: "graft-error", attr: { role: "status", "aria-live": "polite" } });
		const row = this.rowOf.get(setting);
		return {
			setText: (message: string) => {
				el.setText(message);
				if (!row || row.error === (message !== "")) return;
				row.error = message !== "";
				if (this.query.trim()) this.applyFilter();
			},
		};
	}

	private hasError(section: Section): boolean {
		return section.rows.some((row) => row.error) || section.children.some((child) => this.hasError(child));
	}

	private applyFilter(): void {
		const terms = this.query.toLowerCase().split(/\s+/).filter(Boolean);
		let found = false;
		const visit = (section: Section): boolean => {
			let any = false;
			for (const row of section.rows) {
				const show = !terms.length || row.error || terms.every((term) => row.text.includes(term));
				if (row.el) row.el.hidden = !show;
				any ||= show;
			}
			for (const child of section.children) any = visit(child) || any;
			for (const el of section.loose) el.hidden = terms.length > 0;
			section.details.hidden = terms.length > 0 && !any;
			section.details.open = terms.length ? any : this.openState.get(section.id) ?? section.defaultOpen;
			return any;
		};
		for (const section of this.sections) found = visit(section) || found;
		if (this.emptyEl) this.emptyEl.setText(terms.length && !found ? "No settings match your search." : "");
	}

	private text(
		name: string, description: string, value: string, update: (value: string) => void,
		validate: (value: string) => string | undefined = () => undefined, masked = false,
	): void {
		const setting = this.row(name, description);
		const error = this.errorSlot(setting);
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

	private calendars(): void {
		this.group("calendars", "Calendars");
		this.help("Add each calendar's private ICS URL, stored in this vault's plugin settings. Keep URLs out of shared notes, screenshots, and logs. Calendars sync from top to bottom; if two hold the same event, the earlier one is used. Removing a calendar does not change existing notes. Save each row after editing.");
		const calendars = this.plugin.settings.calendars;
		if (!calendars.length) this.help("No calendars yet. Add one below to use Preview sync or Sync now.");
		calendars.forEach((calendar, index) => this.calendarRow({ ...calendar }, index));
		this.calendarRow({ name: "", type: "google", url: "", invitedAs: "" });
	}

	private calendarRow(draft: CalendarSettings, index?: number): void {
		const row = this.row(index === undefined ? "New calendar" : `Calendar ${index + 1}`, "", "name type google outlook microsoft ICS URL invited as");
		row.settingEl?.classList?.add("graft-rule-row", index === undefined ? "graft-rule-new" : "graft-rule-saved");
		const error = this.errorSlot(row);
		row.addText((input) => {
			input.inputEl.setAttribute("aria-label", "Calendar name");
			input.setPlaceholder("Name, such as Work").setValue(draft.name).onChange((value) => { draft.name = value; });
		});
		row.addDropdown((input) => input.addOptions({ google: "Google", outlook: "Outlook / Microsoft 365" })
			.setValue(draft.type).onChange((value) => { if (isCalendarType(value)) draft.type = value; }));
		row.addText((input) => {
			input.inputEl.setAttribute("aria-label", "Calendar ICS URL");
			input.inputEl.type = "password";
			input.inputEl.autocomplete = "off";
			input.inputEl.spellcheck = false;
			input.setPlaceholder("Private ICS URL").setValue(draft.url).onChange((value) => { draft.url = value; });
		});
		row.addText((input) => {
			input.inputEl.setAttribute("aria-label", "Calendar invited as");
			input.setPlaceholder("Invited as").setValue(draft.invitedAs).onChange((value) => { draft.invitedAs = value; });
		});
		row.addButton((button) => button.setButtonText(index === undefined ? "Add calendar" : "Save").onClick(async () => {
			const calendars = this.plugin.settings.calendars;
			const name = draft.name.trim();
			const message = !name ? "Enter a calendar name."
				: calendars.some((calendar, other) => other !== index && sameCalendarName(calendar.name, name)) ? "Another calendar already uses that name."
				: !isCalendarUrl(draft.url) ? "Enter an HTTP or HTTPS ICS URL without a username or password."
				: undefined;
			if (message) { error.setText(`${message} Change not saved.`); return; }
			const saved = { name, type: draft.type, url: draft.url.trim(), invitedAs: draft.invitedAs };
			if (index === undefined) calendars.push(saved); else calendars[index] = saved;
			this.display();
			await this.plugin.saveSettings();
		}));
		if (index !== undefined) this.rowActions(row, this.plugin.settings.calendars, index);
	}

	private titleRules(): void {
		this.heading("Title skip rules");
		this.help("The first matching rule skips the event. Rules run from top to bottom. Save each row after editing.");
		const rules = this.plugin.settings.titleMatchRules;
		rules.forEach((rule, index) => this.titleRow({ ...rule }, index));
		this.titleRow({ mode: "contains", value: "", caseSensitive: false });
	}

	private titleRow(draft: TitleMatchRule, index?: number): void {
		const row = this.row(index === undefined ? "New title rule" : `Title rule ${index + 1}`, "", "title skip rule exact prefix suffix contains match case");
		row.settingEl?.classList?.add("graft-rule-row", index === undefined ? "graft-rule-new" : "graft-rule-saved");
		const error = this.errorSlot(row);
		row.addDropdown((input) => input.addOptions({ exact: "Exact", prefix: "Prefix", suffix: "Suffix", contains: "Contains" })
			.setValue(draft.mode).onChange((value) => { draft.mode = value as TitleMatchRule["mode"]; }));
		row.addText((input) => {
			input.inputEl.setAttribute("aria-label", "Title rule text");
			input.setPlaceholder("Title text to skip").setValue(draft.value).onChange((value) => { draft.value = value; });
		});
		row.controlEl?.createEl("span", { text: "Match case", cls: "graft-inline-label" });
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
		this.help("The first matching email domain selects the filename style. Unlisted domains use the full name. Save each row after editing.");
		this.plugin.settings.personFilenameRules.forEach((rule, index) => this.filenameRow({ ...rule }, index));
		this.filenameRow({ domain: "", style: "full" });
	}

	private filenameRow(draft: FilenameConventionRule, index?: number): void {
		const row = this.row(index === undefined ? "New filename rule" : `Filename rule ${index + 1}`, "", "person filename email domain full name first name initial last name");
		row.settingEl?.classList?.add("graft-rule-row", index === undefined ? "graft-rule-new" : "graft-rule-saved");
		const error = this.errorSlot(row);
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
		const schemaGroup = this.group("schema", "Note schema (advanced)");
		this.help("Property names, note types and headings Graft reads and writes. Defaults suit a new vault; change them to match your own notes. Existing notes keep their current names until you edit them.");
		this.row("Schema preset", "Replaces every schema setting below. Minimal is the default for new vaults. Original matches the schema used before these settings existed.", "minimal original")
			.addButton((button) => button.setButtonText("Use minimal").onClick(async () => this.applyPreset(MINIMAL_SCHEMA)))
			.addButton((button) => button.setButtonText("Use original").onClick(async () => this.applyPreset(ORIGINAL_SCHEMA)));
		const schema = this.plugin.settings.schema;

		this.group("schema.types", "Note types", schemaGroup);
		this.schemaText("Type property", "Property that holds the note type.", "name", (s) => s.typeField, (s, v) => { s.typeField = v; }, true);
		const linking = this.plugin.settings.companyLinking;
		for (const key of ["meeting", "person", "series", "company"] as const) {
			if (key === "company" && !linking) continue;
			this.schemaText(`${LABEL[key]} type value`, "Value of the type property for these notes.", "type", (s) => s.types[key], (s, v) => { s.types[key] = v; }, true);
		}

		this.group("schema.meeting", "Meeting properties", schemaGroup);
		for (const key of Object.keys(MEETING_LABELS) as MeetingFieldKey[]) {
			const optional = OPTIONAL_MEETING_FIELDS.includes(key);
			this.schemaText(`Meeting property: ${MEETING_LABELS[key]}`, optional ? "Property name. Leave blank to skip it." : "Property name.", optional ? "optionalName" : "name", (s) => s.meeting[key], (s, v) => { s.meeting[key] = v; }, MEETING_MATCH.includes(key));
		}
		this.group("schema.person", "Person properties", schemaGroup);
		for (const key of Object.keys(PERSON_LABELS) as PersonFieldKey[]) {
			if (key === "company" && !linking) continue;
			this.schemaText(`Person property: ${PERSON_LABELS[key]}`, "Property name.", "name", (s) => s.person[key], (s, v) => { s.person[key] = v; }, PERSON_MATCH.includes(key));
		}
		this.group("schema.series", linking ? "Series and Company properties" : "Series properties", schemaGroup);
		for (const key of Object.keys(SERIES_LABELS) as SeriesFieldKey[]) {
			this.schemaText(`Series property: ${SERIES_LABELS[key]}`, key === "uid" ? "Property that stores the calendar event UID." : "Property name.", "name", (s) => s.series[key], (s, v) => { s.series[key] = v; }, key === "uid");
		}
		if (linking) this.schemaText("Company property: Domain", "Property that holds a Company's email domain.", "name", (s) => s.company.domain, (s, v) => { s.company.domain = v; }, true);

		this.group("schema.headings", "Headings and Meeting body", schemaGroup);
		this.schemaText("Invite agenda heading", "Heading Graft keeps up to date, such as ## Invite Agenda.", "heading", (s) => s.headings.inviteAgenda, (s, v) => { s.headings.inviteAgenda = v; });
		this.schemaText("Series agenda heading", "Heading for the Series agenda in new built-in Meeting bodies.", "heading", (s) => s.headings.seriesAgenda, (s, v) => { s.headings.seriesAgenda = v; });
		this.schemaText("Standing agenda heading", "Heading in a Series note whose content is copied into new Meetings.", "heading", (s) => s.headings.standingAgenda, (s, v) => { s.headings.standingAgenda = v; });

		const body = this.row("Built-in Meeting body", "Used when no Meeting template is set. Placeholders: {{series_section}} and {{invite_section}}; the invite section is required.");
		body.settingEl?.classList?.add("graft-wide-row");
		const bodyError = this.errorSlot(body);
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

		this.group("schema.values", "Status and recurrence values", schemaGroup);
		this.schemaText("Status value: scheduled", "Written to the occurrence status property for a live event.", "type", (s) => s.statusValues.scheduled, (s, v) => { s.statusValues.scheduled = v; });
		this.schemaText("Status value: cancelled", "Written when the calendar marks an occurrence cancelled.", "type", (s) => s.statusValues.cancelled, (s, v) => { s.statusValues.cancelled = v; });
		this.schemaText("Recurrence value: series", "{{recurrence}} for a Meeting that belongs to a Series note.", "type", (s) => s.recurrenceValues.series, (s, v) => { s.recurrenceValues.series = v; });
		this.schemaText("Recurrence value: one-off", "{{recurrence}} for a Meeting without a Series note.", "type", (s) => s.recurrenceValues.oneOff, (s, v) => { s.recurrenceValues.oneOff = v; });

		this.group("schema.extras", "Extra Meeting properties", schemaGroup);
		this.help("Extra properties written to new Meeting notes. Turn on Update to refresh one on every sync. Values can use {{title}}, {{date}}, {{week}}, {{month}}, {{year}}, {{weekday}}, {{recurrence}} and {{companies}}. Write a list as [\"a\", \"b\"]. Save each row after editing.");
		schema.meetingExtras.forEach((field, index) => this.extraRow({ ...field }, index));
		this.extraRow({ key: "", value: "", updateOnSync: false });
		this.target = this.containerEl;
		this.current = undefined;
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
			if (!valid) return kind === "heading" ? "Use a Markdown heading such as ## Title." : kind === "type" ? "Enter a non-empty value without surrounding spaces." : "Enter a non-empty name without colons or surrounding spaces.";
			const candidate = cloneSchema(schema);
			write(candidate, value);
			const conflict = schemaConflict(candidate);
			if (!conflict) return undefined;
			return conflict.startsWith("Two ") ? "Another property of this note type already uses that name." : conflict;
		});
	}

	private extraRow(draft: ExtraField, index?: number): void {
		const row = this.row(index === undefined ? "New extra property" : `Extra property ${index + 1}`, "", "meeting property value update each sync");
		row.settingEl?.classList?.add("graft-rule-row", index === undefined ? "graft-rule-new" : "graft-rule-saved");
		const error = this.errorSlot(row);
		let text = Array.isArray(draft.value) ? JSON.stringify(draft.value) : draft.value;
		row.addText((input) => {
			input.inputEl.setAttribute("aria-label", "Extra property name");
			input.setPlaceholder("Property name").setValue(draft.key).onChange((value) => { draft.key = value; });
		});
		row.addText((input) => {
			input.inputEl.setAttribute("aria-label", "Extra property value");
			input.setPlaceholder("Value").setValue(text).onChange((value) => { text = value; });
		});
		row.controlEl?.createEl("span", { text: "Update each sync", cls: "graft-inline-label" });
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
