import { test } from "node:test";
import { strict as assert } from "node:assert";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";
import { loadGraftSettings } from "../../src/config/settings.ts";

class Element {
	children = [];
	attributes = {};
	text = "";
	scrollTop = 0;
	listeners = {};
	createEl(tag, options = {}) {
		const child = new Element();
		child.text = options.text ?? "";
		child.attributes = options.attr ?? {};
		child.tag = tag;
		this.children.push(child);
		return child;
	}
	empty() { this.children = []; }
	setText(text) { this.text = text; }
	addEventListener(type, listener) { this.listeners[type] = listener; }
	setAttribute(key, value) { this.attributes[key] = value; }
}

class Control {
	inputEl = new Element();
	setValue(value) { this.value = value; return this; }
	setPlaceholder(value) { return this; }
	setTooltip(value) { return this; }
	setDisabled(value) { this.disabled = value; return this; }
	setButtonText(value) { this.label = value; return this; }
	addOptions(value) { this.options = value; return this; }
	onChange(callback) { this.change = callback; return this; }
	onClick(callback) { this.click = callback; return this; }
}

class Setting {
	controls = [];
	descEl = new Element();
	constructor(container) { container.children.push(this); }
	setName(name) { this.name = name; return this; }
	setDesc(description) { this.description = description; return this; }
	add(kind, setup) { const control = new Control(); control.kind = kind; this.controls.push(control); setup(control); return this; }
	addText(setup) { return this.add("text", setup); }
	addTextArea(setup) { return this.add("textarea", setup); }
	addDropdown(setup) { return this.add("dropdown", setup); }
	addToggle(setup) { return this.add("toggle", setup); }
	addButton(setup) { return this.add("button", setup); }
}

class TFile {}
const notices = [];
class Notice { constructor(message) { notices.push(message); } }
class PluginSettingTab {
	containerEl = new Element();
	constructor(app) { this.app = app; }
}
class Plugin {
	addSettingTab(tab) { this.tab = tab; }
	addCommand(command) { (this.commands ??= []).push(command); }
}
class Modal {}
const obsidian = { PluginSettingTab, Setting, TFile, Notice, Plugin, Modal };

async function loadModule(entry) {
	const result = await build({ entryPoints: [entry], bundle: true, write: false, platform: "node", format: "cjs", external: ["obsidian"] });
	const module = { exports: {} };
	runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require: () => obsidian, URL, Intl });
	return module.exports;
}
const { GraftSettingTab } = await loadModule("src/settings.ts");
const { default: GraftPlugin } = await loadModule("src/main.ts");

function fixture() {
	const saves = [];
	const plugin = { settings: loadGraftSettings({}), async saveSettings() { saves.push(JSON.parse(JSON.stringify(this.settings))); } };
	const app = { vault: { getAbstractFileByPath(path) { return path === "Templates/Meeting.md" ? new TFile() : null; } } };
	const tab = new GraftSettingTab(app, plugin);
	tab.display();
	function find(parent, name) { for (const child of parent.children ?? []) { if (child.name === name) return child; const nested = find(child, name); if (nested) return nested; } }
	function row(name) { return find(tab.containerEl, name); }
	function control(name, kind, label) { return row(name).controls.find((item) => item.kind === kind && (label === undefined || item.label === label)); }
	return { plugin, tab, saves, row, control };
}

test("settings controls update every scalar and nested field", async () => {
	const { plugin, control, saves } = fixture();
	const edits = [
		["Meeting folder", "Custom/Meetings"], ["Person folder", "Custom/People"], ["Series folder", "Custom/Series"], ["Company folder", "Custom/Companies"],
		["Meeting template", "Templates/Meeting.md"], ["Person template", "Templates/Meeting.md"], ["Series template", "Templates/Meeting.md"],
		["Meeting filename pattern", "{{date}} {{title}}"], ["Ignore-list file", "Config/ignore.json"],
		["Timezone", "Europe/London"], ["Days back", "0"], ["Days ahead", "60"],
	];
	for (const [name, value] of edits) await control(name, "text").change(value);
	for (const name of ["Create Person stubs", "Create Series stubs", "Strict Company links", "Preview before apply"]) await control(name, "toggle").change(false);
	await control("Sync on startup", "toggle").change(true);
	assert.equal(saves.length, edits.length + 5);
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
	assert.deepEqual(plugin.settings.titleMatchRules.map((rule) => rule.value), ["Skip", "Updated"]);
	assert.equal(plugin.settings.titleMatchRules[1].caseSensitive, true);
	assert.equal(plugin.settings.titleMatchRules[1].mode, "prefix");
	assert.equal(control("Title rule 1", "button", "Up").disabled, true);
	await control("Title rule 1", "button", "Remove").click();
	assert.equal(plugin.settings.titleMatchRules.length, 1);
});

test("calendars start empty and can be added, edited, reordered, and removed", async () => {
	const { plugin, control, saves, row } = fixture();
	assert.deepEqual(plugin.settings.calendars, []);
	const fill = (rowName, name, type, url, invitedAs) => {
		const [nameInput, urlInput, invitedInput] = row(rowName).controls.filter((item) => item.kind === "text");
		nameInput.change(name); urlInput.change(url); invitedInput.change(invitedAs);
		if (type) control(rowName, "dropdown").change(type);
	};
	fill("New calendar", "Work", "outlook", " https://example.com/work.ics ", "one@example.com");
	await control("New calendar", "button", "Add calendar").click();
	fill("New calendar", "Personal", undefined, "https://example.com/personal.ics", "");
	await control("New calendar", "button", "Add calendar").click();
	assert.equal(saves.length, 2);
	assert.deepEqual(JSON.parse(JSON.stringify(plugin.settings.calendars)), [
		{ name: "Work", type: "outlook", url: "https://example.com/work.ics", invitedAs: "one@example.com" },
		{ name: "Personal", type: "google", url: "https://example.com/personal.ics", invitedAs: "" },
	]);
	for (const calendar of [row("Calendar 1"), row("Calendar 2")]) {
		assert.equal(calendar.controls.filter((item) => item.kind === "text")[1].inputEl.type, "password");
	}
	fill("Calendar 2", "Home", "outlook", "https://example.com/home.ics", "two@example.com");
	await control("Calendar 2", "button", "Save").click();
	assert.deepEqual(JSON.parse(JSON.stringify(plugin.settings.calendars[1])), { name: "Home", type: "outlook", url: "https://example.com/home.ics", invitedAs: "two@example.com" });
	assert.equal(control("Calendar 1", "button", "Up").disabled, true);
	await control("Calendar 2", "button", "Up").click();
	assert.deepEqual(plugin.settings.calendars.map((calendar) => calendar.name), ["Home", "Work"]);
	await control("Calendar 1", "button", "Remove").click();
	assert.deepEqual(plugin.settings.calendars.map((calendar) => calendar.name), ["Work"]);
	await control("Calendar 1", "button", "Remove").click();
	assert.deepEqual(plugin.settings.calendars, []);
	assert.deepEqual(loadGraftSettings(saves.at(-1)).calendars, []);
});

test("calendar rows reject missing names, duplicate names, and bad URLs without echoing them", async () => {
	const { plugin, control, saves, row } = fixture();
	const fill = (rowName, name, url) => {
		const [nameInput, urlInput] = row(rowName).controls.filter((item) => item.kind === "text");
		nameInput.change(name); urlInput.change(url);
	};
	const message = (rowName) => row(rowName).descEl.children[0].text;
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
	fill("Calendar 2", "work", "https://example.com/home.ics");
	await control("Calendar 2", "button", "Save").click();
	assert.match(message("Calendar 2"), /Another calendar already uses that name/);
	fill("Calendar 2", "Home", "");
	await control("Calendar 2", "button", "Save").click();
	assert.match(message("Calendar 2"), /Change not saved/);
	// Saving a row under its own name is not a duplicate.
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
	assert.deepEqual(plugin.settings.personFilenameRules.map((rule) => rule.domain), ["example.org", "example.com"]);
	assert.equal(plugin.settings.personFilenameRules[1].style, "initialLast");
	await control("Filename rule 1", "button", "Remove").click();
	assert.equal(plugin.settings.personFilenameRules.length, 1);
});

test("plugin settings writes remain ordered, use snapshots, and recover after failure", async () => {
	const plugin = new GraftPlugin();
	plugin.loadData = async () => ({ daysBack: 0 });
	await plugin.loadSettings();
	assert.equal(plugin.settings.daysBack, 0);
	const writes = [];
	let release;
	plugin.saveData = async (snapshot) => {
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
	plugin.saveData = async (snapshot) => { writes.push(snapshot.daysBack); };
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
	const { row } = fixture();
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
	const add = async (key, value, update = false) => {
		control("New extra property", "text").change(key);
		const values = row("New extra property").controls.filter((item) => item.kind === "text");
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
	row("Extra property 1").controls.filter((item) => item.kind === "text")[1].change("plain");
	await control("Extra property 1", "button", "Save").click();
	await control("Extra property 2", "button", "Up").click();
	assert.deepEqual([...plugin.settings.schema.meetingExtras.map((field) => field.key)], ["orgs", "tags"]);
	assert.equal(plugin.settings.schema.meetingExtras[1].value, "plain");
	await control("Extra property 1", "button", "Remove").click();
	assert.deepEqual([...plugin.settings.schema.meetingExtras.map((field) => field.key)], ["tags"]);
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
	const details = () => tab.containerEl.children.find((child) => child.tag === "details");
	assert.equal(details().open, false);
	details().open = true;
	details().listeners.toggle();
	tab.containerEl.scrollTop = 240;
	await control("Schema preset", "button", "Use original").click();
	assert.equal(details().open, true);
	assert.equal(tab.containerEl.scrollTop, 240);
	control("New extra property", "text").change("tags");
	row("New extra property").controls.filter((item) => item.kind === "text")[1].change('["Meeting"]');
	await control("New extra property", "button", "Add").click();
	assert.equal(details().open, true);
	assert.equal(tab.containerEl.scrollTop, 240);
	details().open = false;
	details().listeners.toggle();
	tab.display();
	assert.equal(details().open, false);
	assert.ok(row("Schema preset"));
});
