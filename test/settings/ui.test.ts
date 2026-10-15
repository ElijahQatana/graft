import { test, before } from "node:test";
import { strict as assert } from "node:assert";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";
import { loadGraftSettings } from "../../src/config/settings.ts";

class Element {
	[key: string]: any;
	children: any[] = [];
	attributes: Record<string, any> = {};
	text = "";
	scrollTop = 0;
	hidden = false;
	open = false;
	value = "";
	listeners: Record<string, any> = {};
	focus() { this.focused = true; }
	createEl(tag: any, options: any = {}) {
		const child = new Element();
		child.text = options.text ?? "";
		child.cls = options.cls ?? "";
		child.attributes = options.attr ?? {};
		child.tag = tag;
		this.children.push(child);
		return child;
	}
	empty() { this.children = []; }
	setText(text: any) { this.text = text; }
	addEventListener(type: any, listener: any) { this.listeners[type] = listener; }
	setAttribute(key: any, value: any) { this.attributes[key] = value; }
}

class Control {
	[key: string]: any;
	inputEl = new Element();
	setValue(value: any) { this.value = value; return this; }
	setPlaceholder(value: any) { return this; }
	setTooltip(value: any) { return this; }
	setDisabled(value: any) { this.disabled = value; return this; }
	setButtonText(value: any) { this.label = value; return this; }
	addOptions(value: any) { this.options = value; return this; }
	onChange(callback: any) { this.change = callback; return this; }
	onClick(callback: any) { this.click = callback; return this; }
}

class Setting {
	[key: string]: any;
	controls: any[] = [];
	descEl = new Element();
	settingEl = new Element();
	constructor(container: any) { container.children.push(this); }
	setName(name: any) { this.name = name; return this; }
	setDesc(description: any) { this.description = description; return this; }
	setHeading() { this.isHeading = true; return this; }
	add(kind: any, setup: any) { const control = new Control(); control.kind = kind; this.controls.push(control); setup(control); return this; }
	addText(setup: any) { return this.add("text", setup); }
	addTextArea(setup: any) { return this.add("textarea", setup); }
	addDropdown(setup: any) { return this.add("dropdown", setup); }
	addToggle(setup: any) { return this.add("toggle", setup); }
	addButton(setup: any) { return this.add("button", setup); }
}

class TFile {}
const notices: any[] = [];
class Notice { constructor(message: any) { notices.push(message); } }
class PluginSettingTab {
	[key: string]: any;
	containerEl = new Element();
	constructor(app: any) { this.app = app; }
}
class Plugin {
	[key: string]: any;
	addSettingTab(tab: any) { this.tab = tab; }
	addCommand(command: any) { (this.commands ??= []).push(command); }
}
class Modal {}
const obsidian = { PluginSettingTab, Setting, TFile, Notice, Plugin, Modal };

async function loadModule(entry: string): Promise<any> {
	const result = await build({ entryPoints: [entry], bundle: true, write: false, platform: "node", format: "cjs", external: ["obsidian"] });
	const module: { exports: any } = { exports: {} };
	runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require: () => obsidian, URL, Intl, structuredClone });
	return module.exports;
}
let GraftSettingTab: any;
let GraftPlugin: any;
before(async () => {
	({ GraftSettingTab } = await loadModule("src/settings.ts"));
	({ default: GraftPlugin } = await loadModule("src/main.ts"));
});

function fixture({ linking = false, secretStorage, calendars }: { linking?: boolean; secretStorage?: any; calendars?: any } = {}): any {
	const saves: any[] = [];
	const plugin = { settings: { ...loadGraftSettings({}), companyLinking: linking, ...(calendars ? { calendars } : {}) }, async saveSettings() { saves.push(JSON.parse(JSON.stringify(this.settings))); } };
	const app = { secretStorage, vault: { getAbstractFileByPath(path: any) { return path === "Templates/Meeting.md" ? new TFile() : null; } } };
	const tab = new GraftSettingTab(app, plugin);
	tab.display();
	function find(parent: any, name: any): any { for (const child of parent.children ?? []) { if (child.name === name) return child; const nested: any = find(child, name); if (nested) return nested; } }
	function row(name: any) { return find(tab.containerEl, name); }
	function control(name: any, kind: any, label?: any) { return row(name).controls.find((item: any) => item.kind === kind && (label === undefined || item.label === label)); }
	return { plugin, tab, saves, row, control };
}

const noIds = (calendars: any) => calendars.map(({ id, ...rest }: any) => { assert.match(id, /^[a-z0-9]{1,40}$/); return rest; });
function walk(parent: any, visit: any) { for (const child of parent.children ?? []) { visit(child); walk(child, visit); } }
function group(tab: any, id: any) { let found: any; walk(tab.containerEl, (child: any) => { if (child.attributes?.["data-graft-group"] === id) found = child; }); return found; }
function byClass(tab: any, cls: any) { let found: any; walk(tab.containerEl, (child: any) => { if (child.cls?.split(" ").includes(cls)) found ??= child; }); return found; }
function search(tab: any, text: any) { const input = byClass(tab, "graft-search-input"); input.value = text; input.listeners.input(); }
function toggle(tab: any, id: any, open: any) { const details = group(tab, id); details.open = open; details.listeners.toggle(); }
function isHidden(row: any) { return row.settingEl.hidden; }
const TOP = ["calendars", "folders", "filters", "window", "behavior", "schema"];
const SUB = ["schema.types", "schema.meeting", "schema.person", "schema.series", "schema.headings", "schema.values", "schema.extras"];

test("settings controls update every scalar and nested field", async () => {
	const { plugin, control, saves } = fixture();
	await control("Company linking", "toggle").change(true);
	const edits = [
		["Meeting folder", "Custom/Meetings"], ["Person folder", "Custom/People"], ["Series folder", "Custom/Series"], ["Company folder", "Custom/Companies"],
		["Meeting template", "Templates/Meeting.md"], ["Person template", "Templates/Meeting.md"], ["Series template", "Templates/Meeting.md"],
		["Meeting filename pattern", "{{date}} {{title}}"], ["Ignore-list file", "Config/ignore.json"],
		["Timezone", "Europe/London"], ["Days back", "0"], ["Days ahead", "60"],
	];
	for (const [name, value] of edits) await control(name, "text").change(value);
	for (const name of ["Create Person stubs", "Create Series stubs", "Strict Company links", "Preview before apply"]) await control(name, "toggle").change(false);
	await control("Sync on startup", "toggle").change(true);
	assert.equal(saves.length, edits.length + 6);
	assert.deepEqual(loadGraftSettings(saves.at(-1)), plugin.settings);
	assert.equal(plugin.settings.daysBack, 0);
	assert.equal(plugin.settings.autoRunOnStartup, true);
	assert.equal(plugin.settings.templates.series, "Templates/Meeting.md");
});

test("invalid input never changes saved settings and errors never echo its value", async () => {
	const { control, saves, row } = fixture();
	for (const [name, value] of [
		["Meeting folder", "../outside"],
		["Meeting template", "Templates/Missing.md"], ["Person template", "Templates/Meeting.txt"],
		["Ignore-list file", "/absolute"], ["Timezone", "Invalid/Zone"], ["Days back", "-1"],
		["Days ahead", "1.5"], ["Meeting filename pattern", ""],
	]) {
		await control(name, "text").change(value);
		const message = row(name).descEl.children[0].text;
		assert.match(message, /Change not saved/);
		if (value) assert.equal(message.includes(value), false);
	}
	assert.equal(saves.length, 0);
	await control("Days back", "text").change("12");
	assert.equal(saves.length, 1);
	assert.equal(row("Days back").descEl.children[0].text, "");
});

test("title rules can be added, edited, reordered, and removed", async () => {
	const { plugin, control, saves } = fixture();
	await control("New title rule", "button", "Add").click();
	assert.equal(saves.length, 0);
	for (const value of ["Synthetic", "Skip"]) {
		control("New title rule", "text").change(value);
		await control("New title rule", "button", "Add").click();
	}
	control("Title rule 1", "dropdown").change("prefix");
	control("Title rule 1", "toggle").change(true);
	control("Title rule 1", "text").change("Updated");
	await control("Title rule 1", "button", "Save").click();
	await control("Title rule 2", "button", "Up").click();
	assert.deepEqual(plugin.settings.titleMatchRules.map((rule: any) => rule.value), ["Skip", "Updated"]);
	assert.equal(plugin.settings.titleMatchRules[1].caseSensitive, true);
	assert.equal(plugin.settings.titleMatchRules[1].mode, "prefix");
	assert.equal(control("Title rule 1", "button", "Up").disabled, true);
	await control("Title rule 1", "button", "Remove").click();
	assert.equal(plugin.settings.titleMatchRules.length, 1);
});

test("calendars start empty and can be added, edited, reordered, and removed", async () => {
	const { plugin, control, saves, row } = fixture();
	assert.deepEqual(plugin.settings.calendars, []);
	const fill = (rowName: any, name: any, type: any, url: any, invitedAs: any) => {
		const [nameInput, urlInput, invitedInput] = row(rowName).controls.filter((item: any) => item.kind === "text");
		nameInput.change(name); urlInput.change(url); invitedInput.change(invitedAs);
		if (type) control(rowName, "dropdown").change(type);
	};
	fill("New calendar", "Work", "outlook", " https://example.com/work.ics ", "one@example.com");
	await control("New calendar", "button", "Add calendar").click();
	fill("New calendar", "Personal", undefined, "https://example.com/personal.ics", "");
	await control("New calendar", "button", "Add calendar").click();
	assert.equal(saves.length, 2);
	assert.deepEqual(noIds(plugin.settings.calendars), [
		{ name: "Work", type: "outlook", url: "https://example.com/work.ics", invitedAs: "one@example.com" },
		{ name: "Personal", type: "google", url: "https://example.com/personal.ics", invitedAs: "" },
	]);
	assert.notEqual(plugin.settings.calendars[0].id, plugin.settings.calendars[1].id);
	const homeId = plugin.settings.calendars[1].id;
	assert.equal(row("Work").description, "Outlook / Microsoft 365 · one@example.com · address saved on this device");
	assert.equal(row("Personal").description, "Google · no Invited as value · address saved on this device");
	await control("Work", "button", "Edit").click();
	await control("Personal", "button", "Edit").click();
	for (const calendar of [row("Calendar 1"), row("Calendar 2")]) {
		assert.equal(calendar.controls.filter((item: any) => item.kind === "text")[1].inputEl.type, "password");
	}
	await control("Calendar 1", "button", "Cancel").click();
	assert.ok(row("Work"));
	assert.equal(plugin.settings.calendars[0].name, "Work");
	fill("Calendar 2", "Home", "outlook", "https://example.com/home.ics", "two@example.com");
	await control("Calendar 2", "button", "Save").click();
	assert.deepEqual(noIds([plugin.settings.calendars[1]]), [{ name: "Home", type: "outlook", url: "https://example.com/home.ics", invitedAs: "two@example.com" }]);
	assert.equal(plugin.settings.calendars[1].id, homeId);
	assert.equal(row("Home").controls.length > 0 && row("Home").controls.some((item: any) => item.kind === "text"), false);
	assert.equal(control("Work", "button", "Up").disabled, true);
	await control("Home", "button", "Up").click();
	assert.deepEqual(plugin.settings.calendars.map((calendar: any) => calendar.name), ["Home", "Work"]);
	await control("Home", "button", "Remove").click();
	assert.deepEqual(plugin.settings.calendars.map((calendar: any) => calendar.name), ["Work"]);
	await control("Work", "button", "Remove").click();
	assert.deepEqual(plugin.settings.calendars, []);
	assert.deepEqual(loadGraftSettings(saves.at(-1)).calendars, []);
});

test("calendar rows reject missing names, duplicate names, and bad URLs without echoing them", async () => {
	const { plugin, control, saves, row } = fixture();
	const fill = (rowName: any, name: any, url: any) => {
		const [nameInput, urlInput] = row(rowName).controls.filter((item: any) => item.kind === "text");
		nameInput.change(name); urlInput.change(url);
	};
	const message = (rowName: any) => row(rowName).descEl.children[0].text;
	fill("New calendar", " ", "https://example.com/a.ics");
	await control("New calendar", "button", "Add calendar").click();
	assert.match(message("New calendar"), /Enter a calendar name/);
	for (const url of ["", "file:///synthetic-secret", "https://user:synthetic-secret@example.com/a.ics", "not a url"]) {
		fill("New calendar", "Work", url);
		await control("New calendar", "button", "Add calendar").click();
		assert.match(message("New calendar"), /Change not saved/);
		if (url) assert.equal(message("New calendar").includes(url), false);
	}
	assert.equal(saves.length, 0);
	fill("New calendar", "Work", "https://example.com/work.ics");
	await control("New calendar", "button", "Add calendar").click();
	fill("New calendar", " WORK ", "https://example.com/other.ics");
	await control("New calendar", "button", "Add calendar").click();
	assert.match(message("New calendar"), /Another calendar already uses that name/);
	fill("New calendar", "Home", "https://example.com/home.ics");
	await control("New calendar", "button", "Add calendar").click();
	await control("Home", "button", "Edit").click();
	fill("Calendar 2", "work", "https://example.com/home.ics");
	await control("Calendar 2", "button", "Save").click();
	assert.match(message("Calendar 2"), /Another calendar already uses that name/);
	fill("Calendar 2", "Home", "");
	await control("Calendar 2", "button", "Save").click();
	assert.match(message("Calendar 2"), /Change not saved/);
	// Saving a row under its own name is not a duplicate.
	await control("Work", "button", "Edit").click();
	fill("Calendar 1", "Work", "https://example.com/work2.ics");
	await control("Calendar 1", "button", "Save").click();
	assert.equal(plugin.settings.calendars[0].url, "https://example.com/work2.ics");
	assert.equal(plugin.settings.calendars.length, 2);
	assert.equal(saves.length, 3);
});

test("filename conventions normalize domains and persist style, order, and removal", async () => {
	const { plugin, control, saves } = fixture();
	control("New filename rule", "text").change("one@example.com");
	await control("New filename rule", "button", "Add").click();
	assert.equal(saves.length, 0);
	for (const domain of ["EXAMPLE.COM", "example.org"]) {
		control("New filename rule", "text").change(domain);
		await control("New filename rule", "button", "Add").click();
	}
	control("Filename rule 1", "dropdown").change("initialLast");
	await control("Filename rule 1", "button", "Save").click();
	await control("Filename rule 1", "button", "Down").click();
	assert.deepEqual(plugin.settings.personFilenameRules.map((rule: any) => rule.domain), ["example.org", "example.com"]);
	assert.equal(plugin.settings.personFilenameRules[1].style, "initialLast");
	await control("Filename rule 1", "button", "Remove").click();
	assert.equal(plugin.settings.personFilenameRules.length, 1);
});

test("plugin settings writes remain ordered, use snapshots, and recover after failure", async () => {
	const plugin = new GraftPlugin();
	plugin.loadData = async () => ({ daysBack: 0 });
	await plugin.loadSettings();
	assert.equal(plugin.settings.daysBack, 0);
	const writes: any[] = [];
	let release: any;
	plugin.saveData = async (snapshot: any) => {
		writes.push(snapshot.daysBack);
		if (writes.length === 1) await new Promise((resolve) => { release = resolve; });
	};
	plugin.settings.daysBack = 1;
	const first = plugin.saveSettings();
	plugin.settings.daysBack = 2;
	const second = plugin.saveSettings();
	plugin.settings.daysBack = 3;
	await new Promise((resolve) => setImmediate(resolve));
	assert.deepEqual(writes, [1]);
	release();
	await Promise.all([first, second]);
	assert.deepEqual(writes, [1, 2]);
	plugin.saveData = async () => { throw new Error("synthetic private error"); };
	await plugin.saveSettings();
	assert.equal(notices.at(-1).includes("synthetic private error"), false);
	plugin.saveData = async (snapshot: any) => { writes.push(snapshot.daysBack); };
	await plugin.saveSettings();
	assert.deepEqual(writes, [1, 2, 3]);
});

test("schema section edits names, types, headings, body, and extras with conflict checks", async () => {
	const { plugin, control, saves, row } = fixture();
	await control("Type property", "text").change("kind");
	await control("Meeting type value", "text").change("Call");
	await control("Meeting property: Event UID", "text").change("cal_uid");
	await control("Meeting property: Occurrence status", "text").change("");
	await control("Series property: Event UID", "text").change("cal_uid");
	await control("Invite agenda heading", "text").change("### Invite");
	await control("Built-in Meeting body", "textarea").change("{{invite_section}}\n");
	const schema = plugin.settings.schema;
	assert.equal(schema.typeField, "kind");
	assert.equal(schema.types.meeting, "Call");
	assert.equal(schema.meeting.uid, "cal_uid");
	assert.equal(schema.meeting.occurrenceStatus, "");
	assert.equal(schema.series.uid, "cal_uid");
	assert.equal(schema.headings.inviteAgenda, "### Invite");
	assert.equal(schema.meetingBody, "{{invite_section}}\n");
	assert.equal(saves.length, 7);
	assert.deepEqual(loadGraftSettings(saves.at(-1)).schema, schema);

	for (const [name, value] of [
		["Meeting property: Title", "date"], ["Meeting property: Date", ""], ["Meeting property: Event UID", "a:b"],
		["Type property", "title"], ["Person property: Email", "full_name"], ["Invite agenda heading", "Invite"],
		["Meeting type value", " Call"],
	]) {
		const before = JSON.stringify(plugin.settings.schema);
		await control(name, "text").change(value);
		assert.match(row(name).descEl.children[0].text, /Change not saved/);
		assert.equal(JSON.stringify(plugin.settings.schema), before);
	}
	await control("Built-in Meeting body", "textarea").change("no sections");
	assert.equal(plugin.settings.schema.meetingBody, "{{invite_section}}\n");
	assert.equal(saves.length, 7);
});

test("matching and type properties warn that renaming does not update existing notes", () => {
	const { row } = fixture({ linking: true });
	const warned = [
		"Type property", "Meeting type value", "Person type value", "Series type value", "Company type value",
		"Meeting property: Event UID", "Meeting property: Recurrence ID", "Person property: Email",
		"Person property: Email aliases", "Series property: Event UID", "Company property: Domain",
	];
	for (const name of warned) assert.match(row(name).description, /does not rename it in existing notes/, name);
	for (const name of ["Meeting property: Title", "Meeting property: Date", "Person property: Full name", "Series property: Title", "Invite agenda heading"]) {
		assert.doesNotMatch(row(name).description, /rename/, name);
	}
});

test("extra Meeting properties can be added, edited, reordered, removed, and rejected on conflict", async () => {
	const { plugin, control, saves, row } = fixture();
	const add = async (key: any, value: any, update = false) => {
		control("New extra property", "text").change(key);
		const values = row("New extra property").controls.filter((item: any) => item.kind === "text");
		values[1].change(value);
		control("New extra property", "toggle").change(update);
		await control("New extra property", "button", "Add").click();
	};
	await add("", "x");
	await add("title", "x");
	assert.equal(saves.length, 0);
	assert.match(row("New extra property").descEl.children[0].text, /Change not saved/);
	await add("tags", '["Meeting"]');
	await add("orgs", "{{companies}}", true);
	await add("bad", '["unterminated');
	assert.deepEqual(JSON.parse(JSON.stringify(plugin.settings.schema.meetingExtras)), [
		{ key: "tags", value: ["Meeting"], updateOnSync: false },
		{ key: "orgs", value: "{{companies}}", updateOnSync: true },
	]);
	assert.equal(saves.length, 2);
	row("Extra property 1").controls.filter((item: any) => item.kind === "text")[1].change("plain");
	await control("Extra property 1", "button", "Save").click();
	await control("Extra property 2", "button", "Up").click();
	assert.deepEqual([...plugin.settings.schema.meetingExtras.map((field: any) => field.key)], ["orgs", "tags"]);
	assert.equal(plugin.settings.schema.meetingExtras[1].value, "plain");
	await control("Extra property 1", "button", "Remove").click();
	assert.deepEqual([...plugin.settings.schema.meetingExtras.map((field: any) => field.key)], ["tags"]);
});

test("schema presets replace the whole schema and save", async () => {
	const { plugin, control, saves } = fixture();
	await control("Schema preset", "button", "Use original").click();
	assert.equal(plugin.settings.schema.series.uid, "google_recurring_event_id");
	assert.ok(plugin.settings.schema.meetingExtras.length > 5);
	await control("Schema preset", "button", "Use minimal").click();
	assert.equal(plugin.settings.schema.series.uid, "ics_uid");
	assert.deepEqual(JSON.parse(JSON.stringify(plugin.settings.schema.meetingExtras)), []);
	await Promise.resolve();
	assert.equal(saves.length, 2);
});

test("schema section stays open and keeps scroll across re-renders", async () => {
	const { tab, control, row } = fixture();
	const details = () => group(tab, "schema");
	assert.equal(details().open, false);
	details().open = true;
	details().listeners.toggle();
	tab.containerEl.scrollTop = 240;
	await control("Schema preset", "button", "Use original").click();
	assert.equal(details().open, true);
	assert.equal(tab.containerEl.scrollTop, 240);
	control("New extra property", "text").change("tags");
	row("New extra property").controls.filter((item: any) => item.kind === "text")[1].change('["Meeting"]');
	await control("New extra property", "button", "Add").click();
	assert.equal(details().open, true);
	assert.equal(tab.containerEl.scrollTop, 240);
	details().open = false;
	details().listeners.toggle();
	tab.display();
	assert.equal(details().open, false);
	assert.ok(row("Schema preset"));
});

const COMPANY_ROWS = ["Company folder", "Strict Company links", "Company type value", "Person property: Company links", "Company property: Domain"];

test("Company settings are hidden while Company linking is off", () => {
	const { row, control, plugin } = fixture();
	assert.equal(plugin.settings.companyLinking, false);
	assert.equal(control("Company linking", "toggle").value, false);
	for (const name of COMPANY_ROWS) assert.equal(row(name), undefined, name);
	assert.ok(row("Person property: Email"));
	assert.ok(row("Series property: Event UID"));
	assert.ok(row("Preview before apply"));
});

test("turning Company linking on shows the Company settings, and off hides them again", async () => {
	const { row, control, plugin, saves } = fixture();
	await control("Company linking", "toggle").change(true);
	assert.equal(plugin.settings.companyLinking, true);
	assert.equal(saves.at(-1).companyLinking, true);
	for (const name of COMPANY_ROWS) assert.ok(row(name), name);
	assert.equal(control("Strict Company links", "toggle").value, true);
	await control("Company linking", "toggle").change(false);
	assert.equal(plugin.settings.companyLinking, false);
	for (const name of COMPANY_ROWS) assert.equal(row(name), undefined, name);
	assert.equal(plugin.settings.strictCompanyLinks, true);
});

test("every section and every Note schema sub-group is a collapsible details element", () => {
	const { tab } = fixture();
	for (const id of [...TOP, ...SUB]) {
		const details = group(tab, id);
		assert.equal(details.tag, "details", id);
		assert.ok(details.children.some((child: any) => child.tag === "summary" && child.text), id);
	}
	assert.equal(group(tab, "schema").open, false);
	assert.equal(group(tab, "schema.types").open, false);
	for (const id of TOP) assert.equal(group(tab, id).open, false, id);
});

test("search matches row names and descriptions, ignoring case, and needs every word", () => {
	const { tab, row } = fixture();
	search(tab, "TIMEZONE");
	assert.equal(isHidden(row("Timezone")), false);
	assert.equal(isHidden(row("Days back")), true);
	search(tab, "minimal person note");
	assert.equal(isHidden(row("Create Person stubs")), false);
	assert.equal(isHidden(row("Create Series stubs")), true);
	search(tab, "person note minimal zzz");
	assert.equal(isHidden(row("Create Person stubs")), true);
	search(tab, "   whole   number ");
	assert.equal(isHidden(row("Days back")), false);
	assert.equal(isHidden(row("Days ahead")), false);
	assert.equal(isHidden(row("Timezone")), true);
});

test("search hides sections without a match and opens the ones with a match", () => {
	const { tab } = fixture();
	search(tab, "days ahead");
	assert.equal(group(tab, "window").hidden, false);
	assert.equal(group(tab, "window").open, true);
	for (const id of TOP.filter((id) => id !== "window")) assert.equal(group(tab, id).hidden, true, id);
	search(tab, "meeting property: scheduled start");
	assert.equal(group(tab, "schema").hidden, false);
	assert.equal(group(tab, "schema").open, true);
	assert.equal(group(tab, "schema.meeting").open, true);
	assert.equal(group(tab, "schema.meeting").hidden, false);
	for (const id of SUB.filter((id) => id !== "schema.meeting")) assert.equal(group(tab, id).hidden, true, id);
	assert.equal(group(tab, "calendars").hidden, true);
});

test("an empty box or the clear button restores the normal view and remembered state", () => {
	const { tab, row } = fixture();
	toggle(tab, "folders", true);
	search(tab, "meeting property: scheduled start");
	assert.equal(group(tab, "schema").open, true);
	assert.equal(group(tab, "window").hidden, true);
	byClass(tab, "graft-search-clear").listeners.click();
	assert.equal(byClass(tab, "graft-search-input").value, "");
	assert.equal(byClass(tab, "graft-search-clear").hidden, true);
	for (const id of [...TOP, ...SUB]) assert.equal(group(tab, id).hidden, false, id);
	assert.equal(group(tab, "schema").open, false);
	assert.equal(group(tab, "schema.meeting").open, false);
	assert.equal(group(tab, "window").open, false);
	assert.equal(group(tab, "folders").open, true);
	assert.equal(isHidden(row("Timezone")), false);
	search(tab, "timezone");
	assert.equal(byClass(tab, "graft-search-clear").hidden, false);
	search(tab, "");
	assert.equal(isHidden(row("Days back")), false);
	assert.equal(group(tab, "window").open, false);
});

test("Escape in the search box clears it", () => {
	const { tab } = fixture();
	search(tab, "timezone");
	const input = byClass(tab, "graft-search-input");
	let stopped = false;
	input.listeners.keydown({ key: "Escape", stopPropagation() { stopped = true; } });
	assert.equal(input.value, "");
	assert.equal(stopped, true);
	assert.equal(group(tab, "window").hidden, false);
});

test("a search with no match shows a message, and clearing removes it", () => {
	const { tab } = fixture();
	const message = () => byClass(tab, "graft-no-results").text;
	assert.equal(message(), "");
	search(tab, "no such setting anywhere");
	assert.match(message(), /No settings match/);
	for (const id of [...TOP, ...SUB]) assert.equal(group(tab, id).hidden, true, id);
	search(tab, "timezone");
	assert.equal(message(), "");
	search(tab, "zzz");
	search(tab, "");
	assert.equal(message(), "");
});

test("searching and collapsing never change saved values", async () => {
	const { plugin, tab, saves } = fixture();
	const before = JSON.stringify(plugin.settings);
	search(tab, "timezone");
	search(tab, "zzz");
	search(tab, "");
	for (const id of [...TOP, ...SUB]) { toggle(tab, id, true); toggle(tab, id, false); }
	assert.equal(JSON.stringify(plugin.settings), before);
	assert.equal(saves.length, 0);
});

test("open and closed state survives re-renders from saving, moving and removing rows", async () => {
	const { tab, control, row } = fixture();
	const ids = ["calendars", "filters", "schema", "schema.extras", "schema.types", "window"];
	toggle(tab, "window", true);
	toggle(tab, "schema", true);
	toggle(tab, "schema.extras", true);
	const want = [false, false, true, true, false, true];
	const state = () => ids.map((id) => group(tab, id).open);
	assert.deepEqual(state(), want);
	for (const [name, url] of [["Work", "https://example.com/work.ics"], ["Home", "https://example.com/home.ics"]]) {
		const [nameInput, urlInput] = row("New calendar").controls.filter((item: any) => item.kind === "text");
		nameInput.change(name); urlInput.change(url);
		await control("New calendar", "button", "Add calendar").click();
		assert.deepEqual(state(), want);
	}
	await control("Home", "button", "Up").click();
	assert.deepEqual(state(), want);
	await control("Home", "button", "Remove").click();
	assert.deepEqual(state(), want);
	control("New extra property", "text").change("tags");
	await control("New extra property", "button", "Add").click();
	assert.deepEqual(state(), want);
	await control("Company linking", "toggle").change(true);
	assert.deepEqual(state(), want);
	await control("Schema preset", "button", "Use original").click();
	assert.deepEqual(state(), want);
});

test("open and closed state is remembered when the tab is displayed again", () => {
	const { tab } = fixture();
	toggle(tab, "calendars", true);
	toggle(tab, "schema.values", true);
	tab.hide();
	tab.display();
	assert.equal(group(tab, "folders").open, false);
	assert.equal(group(tab, "schema.values").open, true);
	assert.equal(group(tab, "schema").open, false);
	assert.equal(group(tab, "calendars").open, true);
});

test("a section the user opened stays open after a search is cleared", () => {
	const { tab } = fixture();
	toggle(tab, "schema", true);
	search(tab, "timezone");
	assert.equal(group(tab, "schema").hidden, true);
	search(tab, "");
	assert.equal(group(tab, "schema").open, true);
	assert.equal(group(tab, "schema").hidden, false);
});

test("a search stays applied across re-renders and is cleared when the tab closes", async () => {
	const { tab, control, row } = fixture();
	search(tab, "days");
	await control("Days back", "text").change("3");
	tab.display();
	assert.equal(byClass(tab, "graft-search-input").value, "days");
	assert.equal(isHidden(row("Timezone")), true);
	assert.equal(isHidden(row("Days back")), false);
	assert.equal(group(tab, "calendars").hidden, true);
	tab.hide();
	tab.display();
	assert.equal(byClass(tab, "graft-search-input").value, "");
	assert.equal(isHidden(row("Timezone")), false);
	assert.equal(group(tab, "calendars").hidden, false);
});

test("opening or closing sections during a search does not change what is remembered", () => {
	const { tab } = fixture();
	toggle(tab, "window", true);
	search(tab, "days ahead");
	toggle(tab, "window", false);
	search(tab, "");
	assert.equal(group(tab, "window").open, true);
	assert.equal(group(tab, "schema").open, false);
});

test("rows with an error message stay visible while searching", async () => {
	const { tab, control, row, plugin } = fixture();
	await control("Timezone", "text").change("Not/AZone");
	assert.match(row("Timezone").descEl.children[0].text, /Change not saved/);
	assert.notEqual(plugin.settings.timezone, "Not/AZone");
	search(tab, "meeting property: scheduled start");
	assert.equal(isHidden(row("Timezone")), false);
	assert.equal(group(tab, "window").hidden, false);
	assert.equal(isHidden(row("Days back")), true);
	assert.equal(byClass(tab, "graft-no-results").text, "");
	await control("Timezone", "text").change("Europe/London");
	assert.equal(row("Timezone").descEl.children[0].text, "");
	assert.equal(isHidden(row("Timezone")), true);
	assert.equal(group(tab, "window").hidden, true);
});

test("a section holding an error message cannot be collapsed over it", async () => {
	const { tab, control } = fixture();
	await control("Days back", "text").change("-1");
	toggle(tab, "window", false);
	assert.equal(group(tab, "window").open, true);
	await control("Days back", "text").change("4");
	toggle(tab, "window", false);
	assert.equal(group(tab, "window").open, false);
	assert.equal(group(tab, "window").hidden, false);
});

test("errors in a nested schema group keep it and its parent visible", async () => {
	const { tab, control, row } = fixture();
	await control("Type property", "text").change("");
	search(tab, "timezone");
	assert.equal(isHidden(row("Type property")), false);
	assert.equal(group(tab, "schema.types").hidden, false);
	assert.equal(group(tab, "schema").hidden, false);
	assert.equal(group(tab, "schema").open, true);
	toggle(tab, "schema.types", false);
	assert.equal(group(tab, "schema.types").open, true);
});

test("the tab has no plugin-name title and its section headings are Setting headings in order", () => {
	const { tab } = fixture();
	const tags: any[] = [];
	walk(tab.containerEl, (child: any) => { if (child.tag) tags.push(child.tag); });
	assert.equal(tags.includes("h2"), false);
	assert.equal(tags.includes("h3"), false);
	assert.ok(byClass(tab, "graft-intro"));
	const headings: any[] = [];
	walk(tab.containerEl, (child: any) => { if (child.isHeading) headings.push(child.name); });
	assert.deepEqual(headings, ["Start here", "Title skip rules", "Person filename conventions"]);
});

test("search matches a heading by name and hides it otherwise", () => {
	const { tab, row } = fixture();
	assert.equal(isHidden(row("Title skip rules")), false);
	search(tab, "conventions");
	assert.equal(isHidden(row("Person filename conventions")), false);
	assert.equal(isHidden(row("Title skip rules")), true);
	assert.equal(group(tab, "filters").hidden, false);
	assert.equal(group(tab, "filters").open, true);
	search(tab, "");
	assert.equal(isHidden(row("Title skip rules")), false);
});

test("collapse state survives a re-render that rebuilds the headings", async () => {
	const { tab, control, row } = fixture();
	toggle(tab, "filters", false);
	tab.display();
	assert.equal(group(tab, "filters").open, false);
	toggle(tab, "filters", true);
	control("New title rule", "text").change("Skip");
	await control("New title rule", "button", "Add").click();
	assert.equal(group(tab, "filters").open, true);
	assert.equal(row("Title skip rules").isHeading, true);
});

function mockSecrets(initial: any = {}, failOn?: any) {
	const secrets = new Map(Object.entries(initial));
	return {
		secrets,
		getSecret(id: any) { if (failOn === "get") throw new Error("synthetic storage failure"); return secrets.get(id) ?? null; },
		setSecret(id: any, value: any) { if (failOn === "set") throw new Error("synthetic storage failure"); secrets.set(id, value); },
	};
}
function plugin(secretStorage: any, data: any) {
	const instance = new GraftPlugin();
	instance.app = { secretStorage };
	instance.loadData = async () => data;
	instance.saved = [];
	instance.saveData = async (value: any) => { instance.saved.push(JSON.parse(JSON.stringify(value))); };
	return instance;
}
const FEED = "https://example.com/private-feed.ics";
const saved = (instance: any) => JSON.stringify(instance.saved);

test("with secret storage, saving keeps the URL out of data.json and loading restores it", async () => {
	const secretStorage = mockSecrets();
	const first = plugin(secretStorage, {});
	await first.loadSettings();
	first.settings.calendars.push({ id: "abc123", name: "Work", type: "google", url: FEED, invitedAs: "" });
	await first.saveSettings();
	assert.equal(secretStorage.secrets.get("graft-calendar-abc123"), FEED);
	assert.equal(saved(first).includes("private-feed"), false);
	assert.equal(first.settings.calendars[0].url, FEED);
	const second = plugin(secretStorage, first.saved.at(-1));
	await second.loadSettings();
	assert.equal(second.settings.calendars[0].url, FEED);
	assert.equal(second.saved.length, 0);
});

test("a plain-text URL in old data moves into storage and is saved out of data.json right away", async () => {
	const secretStorage = mockSecrets();
	const instance = plugin(secretStorage, { calendars: [{ id: "google", name: "Google", type: "google", url: FEED, invitedAs: "" }] });
	await instance.loadSettings();
	assert.equal(instance.settings.calendars[0].url, FEED);
	assert.equal(secretStorage.secrets.get(`graft-calendar-${instance.settings.calendars[0].id}`), FEED);
	assert.equal(instance.saved.length, 1);
	assert.equal(saved(instance).includes("private-feed"), false);
	assert.equal(instance.saved[0].calendars.length, 1);
});

test("removing a calendar clears its secret", async () => {
	const secretStorage = mockSecrets();
	const instance = plugin(secretStorage, {});
	await instance.loadSettings();
	instance.settings.calendars.push({ id: "abc123", name: "Work", type: "google", url: FEED, invitedAs: "" });
	await instance.saveSettings();
	instance.settings.calendars = [];
	await instance.saveSettings();
	assert.equal(secretStorage.secrets.get("graft-calendar-abc123"), "");
	assert.deepEqual(instance.saved.at(-1).calendars, []);
});

test("without secret storage the URL is saved in data.json as before", async () => {
	const instance = plugin(undefined, {});
	await instance.loadSettings();
	instance.settings.calendars.push({ id: "abc123", name: "Work", type: "google", url: FEED, invitedAs: "" });
	await instance.saveSettings();
	assert.equal(instance.saved.at(-1).calendars[0].url, FEED);
});

test("a storage error keeps the settings and the notice never shows the URL", async () => {
	const instance = plugin(mockSecrets({}, "set"), {});
	await instance.loadSettings();
	instance.settings.calendars.push({ id: "abc123", name: "Work", type: "google", url: FEED, invitedAs: "" });
	notices.length = 0;
	await instance.saveSettings();
	assert.equal(instance.saved.at(-1).calendars[0].url, FEED);
	assert.equal(notices.length, 1);
	assert.equal(notices[0].includes("private-feed"), false);
	const reading = plugin(mockSecrets({}, "get"), { calendars: [{ id: "abc123", name: "Work", type: "google" }] });
	notices.length = 0;
	await reading.loadSettings();
	assert.equal(reading.settings.calendars[0].url, "");
	assert.equal(notices.length, 1);
});

test("the Calendars section says where URLs are stored", () => {
	const helps = (tab: any) => { const found: any[] = []; walk(tab.containerEl, (child: any) => { if (child.cls === "graft-help") found.push(child.text); }); return found; };
	assert.ok(helps(fixture().tab).includes("URLs are stored in the plugin's data file on this version of Obsidian."));
	const withStorage = helps(fixture({ secretStorage: mockSecrets() }).tab);
	assert.ok(withStorage.includes("URLs are kept in Obsidian's secret storage on this device, not in the plugin's data file."));
	assert.equal(withStorage.some((text) => text.includes("on this version of Obsidian")), false);
});

test("a calendar with no URL on this device says so on its row", async () => {
	const { row, control } = fixture({ secretStorage: mockSecrets(), calendars: [
		{ id: "a1", name: "Work", type: "google", url: "", invitedAs: "" },
		{ id: "b2", name: "Home", type: "google", url: FEED, invitedAs: "" },
	] });
	assert.match(row("Work").description, /no feed address on this device/);
	assert.match(row("Home").description, /address saved on this device/);
	await control("Work", "button", "Edit").click();
	await control("Home", "button", "Edit").click();
	assert.equal(row("Calendar 1").description, "No feed address on this device. Enter it again.");
	assert.ok(!row("Calendar 2").description);
	assert.equal(row("Calendar 2").controls.filter((item: any) => item.kind === "text")[1].inputEl.type, "password");
});

function startBlock(tab: any) {
	let heading: any;
	walk(tab.containerEl, (child: any) => { if (child.isHeading && child.name === "Start here") heading = child; });
	return { heading, steps: byClass(tab, "graft-start-steps") };
}

test("the start-here block shows with no calendars, in order, without a URL or link", () => {
	const { tab } = fixture();
	const { heading, steps } = startBlock(tab);
	assert.ok(heading);
	assert.equal(steps.tag, "ol");
	assert.equal(steps.children.length, 3);
	assert.match(steps.children[0].text, /Secret address in iCal format/);
	assert.match(steps.children[1].text, /Meeting, Person and Series/);
	assert.match(steps.children[2].text, /Preview sync.*writes nothing.*Sync now/);
	const kids = tab.containerEl.children;
	assert.ok(kids.indexOf(heading) < kids.indexOf(steps));
	assert.ok(kids.indexOf(steps) < kids.indexOf(group(tab, "calendars")));
	const text = steps.children.map((item: any) => item.text).join(" ");
	assert.doesNotMatch(text, /https?:|www\./i);
	assert.equal(steps.children.some((item: any) => item.children.length), false);
});

test("the start-here block goes once a calendar exists and returns when the last is removed", async () => {
	const { tab, control, row } = fixture();
	row("New calendar").controls.filter((item: any) => item.kind === "text").forEach((item: any, i: any) => item.change(["Work", "https://example.com/work.ics", ""][i]));
	await control("New calendar", "button", "Add calendar").click();
	assert.equal(startBlock(tab).heading, undefined);
	assert.equal(startBlock(tab).steps, undefined);
	await control("Work", "button", "Remove").click();
	assert.ok(startBlock(tab).heading);
	assert.ok(startBlock(tab).steps);
});

test("the start-here block is hidden while searching and returns when the search is cleared", () => {
	const { tab } = fixture();
	const { heading, steps } = startBlock(tab);
	search(tab, "folder");
	assert.equal(heading.settingEl.hidden, true);
	assert.equal(steps.hidden, true);
	search(tab, "");
	assert.equal(heading.settingEl.hidden, false);
	assert.equal(steps.hidden, false);
});

test("group headings summarise their contents and follow saved changes", async () => {
	const { tab, control, plugin } = fixture();
	const meta = (id: any) => { let found: any; walk(group(tab, id), (child: any) => { if (child.cls === "graft-group-meta") found ??= child; }); return found?.text; };
	assert.equal(meta("calendars"), "None yet");
	assert.equal(meta("filters"), "No filters");
	assert.equal(meta("window"), `${plugin.settings.timezone}, ${plugin.settings.daysBack} days back, ${plugin.settings.daysAhead} ahead`);
	await control("Days back", "text").change("3");
	assert.match(meta("window"), /3 days back/);
	await control("Only events I have accepted", "toggle").change(true);
	assert.equal(meta("filters"), "accepted only");
	assert.equal(meta("schema"), undefined);
});
