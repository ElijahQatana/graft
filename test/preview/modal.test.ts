import { test, before } from "node:test";
import { strict as assert } from "node:assert";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";
import { buildSyncPreview } from "../../src/preview/plan.ts";
import { ORIGINAL_SCHEMA } from "../../src/config/schema.ts";
import { makeEvent } from "../helpers.ts";
import { initialCalendarState, renderCalendar } from "../../src/preview/calendarView.ts";
import { extractSection } from "../../src/util/markdownSections.ts";

class Element {
	[key: string]: any;
	tag = "";
	text = "";
	children: any[] = [];
	listeners: Record<string, any> = {};
	createEl(tag: string, options: any = {}) {
		const child = new Element();
		child.tag = tag;
		child.text = options.text ?? "";
		child.cls = options.cls ?? "";
		child.attr = options.attr;
		this.children.push(child);
		return child;
	}
	addEventListener(name: string, callback: any) { this.listeners[name] = callback; }
	empty() { this.children = []; }
	setText(text: string) { this.text = text; }
}
class Modal {
	[key: string]: any;
	contentEl = new Element();
	constructor(app: any) { this.app = app; }
	setTitle(title: string) { this.title = title; return this; }
	close() { this.closed = true; this.onClose(); }
}
async function load(entry: string): Promise<any> {
	const result = await build({ entryPoints: [entry], bundle: true, write: false, platform: "node", format: "cjs", external: ["obsidian"] });
	const module: { exports: any } = { exports: {} };
	runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require: () => ({ Modal, stringifyYaml: (value: unknown) => JSON.stringify(value) + "\n" }) });
	return module.exports;
}
let SyncPreviewModal: any;
let writeMeetingNote: any;
let updateMeetingNote: any;
before(async () => {
	({ SyncPreviewModal } = await load("src/preview/modal.ts"));
	({ writeMeetingNote } = await load("src/generate/writeMeetingNote.ts"));
	({ updateMeetingNote } = await load("src/generate/updateMeetingNote.ts"));
});
function allElements(root: any): any[] { return [root, ...root.children.flatMap(allElements)]; }
function clean(value: any) { return JSON.parse(JSON.stringify(value)); }

function fixture(): any {
	const event = makeEvent({ summary: "<img src=x onerror=alert(1)>", description: "New agenda" });
	return {
		plan: { toProcess: [event], skipped: [{ event: makeEvent({ summary: "Skipped example" }), reason: "Ignored" }], errors: [{ feed: "Outlook", message: "synthetic private response" }] },
		meetings: [{ input: { event, invited: [], invitedAs: "one@example.com", schema: ORIGINAL_SCHEMA, timezone: "UTC", organizer: { filename: "Alex Example", companyLinks: ["[[Missing]]"] } } }],
		personStubs: [{ path: "People/Alex Example.md", stub: { filename: "Alex Example", frontmatter: { full_name: "Alex Example", email: "alex@example.com", company: [] } } }],
		seriesStubs: [{ path: "Series/Example.md", stub: { filename: "Example", frontmatter: { series_title: "Example", google_recurring_event_id: "series@example.com" } } }],
		companies: [], window: { start: new Date("2026-10-08T00:00:00Z"), end: new Date("2026-11-15T00:00:00Z"), daysBack: 7, daysAhead: 30, timezone: "UTC" }, meetingFolder: "Meetings", features: { personStubs: true, seriesStubs: true, skipped: true }, warnings: [{ kind: "ambiguous-person", subject: "Alex Example" }, { kind: "vanished-event", subject: "Meetings/Missing.md" }, { kind: "possible-duplicate-person", subject: "People/Pat Example 2.md and People/Pat Example.md" }],
	};
}

test("many notes missing from the feed are grouped into one warning", () => {
	const source = fixture();
	source.warnings = Array.from({ length: 6 }, (_, index) => ({ kind: "vanished-event" as const, subject: `Meetings/Gone ${index}.md` }));
	const modal = new SyncPreviewModal({}, buildSyncPreview(source));
	modal.onOpen();
	const text = allElements(modal.contentEl).map((element) => element.text).join("\n");
	assert.ok(text.includes("6 notes are no longer in the calendar feed. They may have been cancelled. The notes are left as they are."));
	assert.ok(text.includes("Gone 5") && text.includes("Meetings/Gone 5.md"));
	assert.equal(text.includes("Gone 0: No longer"), false);
});

test("modal displays each section as literal text and never shows raw feed errors or writes", () => {
	const source = fixture();
	const preview = buildSyncPreview(source);
	preview.warnings.push({ kind: "missing-invite-heading", subject: "Meetings/Existing.md" });
	preview.updates.push({ path: "Meetings/Existing.md", changes: [{ field: "title", before: "Old title", after: "New title" }] });
	const modal = new SyncPreviewModal({}, preview);
	modal.onOpen();
	const elements = allElements(modal.contentEl);
	const text = elements.map((element) => element.text).join("\n");
	for (const expected of ["Dry run", "New Meeting notes", "Existing Meeting notes", "Old title", "New title", "New Person stubs", "New Series stubs", "Skipped example: Ignored", "Unresolved Company link", "Ambiguous Person match", "No longer in the calendar feed. It may have been cancelled", "Pat Example 2 and Pat Example", "People/Pat Example 2.md and People/Pat Example.md", "Existing", "Meetings/Existing.md", "No invite agenda heading", "preview is incomplete", source.plan.toProcess[0].summary]) assert.ok(text.includes(expected), expected);
	assert.equal(text.includes("synthetic private response"), false);
	assert.deepEqual(elements.filter((element) => element.tag === "button").map((element) => element.text), ["List", "Calendar", "Close"]);
	modal.onOpen();
	assert.equal(modal.title, "Graft sync preview");
	assert.equal(allElements(modal.contentEl).filter((element) => element.text === "Graft sync preview").length, 0);
	allElements(modal.contentEl).find((element) => element.text === "Close").listeners.click();
	assert.equal(modal.closed, true);
	assert.deepEqual(modal.contentEl.children, []);
});

test("empty previews and unchanged meetings are explicit", () => {
	const modal = new SyncPreviewModal({}, { window: { start: new Date("2026-10-08T00:00:00Z"), end: new Date("2026-11-15T00:00:00Z"), daysBack: 7, daysAhead: 30, timezone: "UTC" }, newMeetings: [], updates: [], personStubs: [], seriesStubs: [], skipped: [], errors: [], warnings: [], features: { personStubs: true, seriesStubs: true, skipped: true } });
	modal.onOpen();
	assert.ok(allElements(modal.contentEl).some((element) => element.text === "No note changes planned."));
	modal.preview.updates.push({ path: "Meetings/Existing.md", changes: [] });
	modal.onOpen();
	assert.ok(allElements(modal.contentEl).some((element) => element.text === "No field changes."));
});

const emptyPreview = (features: any, counts: any = {}): any => ({
	newMeetings: Array.from({ length: counts.newMeetings ?? 0 }, (_: unknown, i: number) => ({ path: `Meetings/New ${i}.md`, note: { frontmatter: {}, body: "" } })),
	updates: Array.from({ length: counts.updates ?? 0 }, (_: unknown, i: number) => ({ path: `Meetings/Old ${i}.md`, changes: [] })),
	personStubs: Array.from({ length: counts.personStubs ?? 0 }, (_: unknown, i: number) => ({ path: `People/P${i}.md`, stub: { frontmatter: {} } })),
	seriesStubs: Array.from({ length: counts.seriesStubs ?? 0 }, (_: unknown, i: number) => ({ path: `Series/S${i}.md`, stub: { frontmatter: {} } })),
	skipped: Array.from({ length: counts.skipped ?? 0 }, (_: unknown, i: number) => ({ event: makeEvent({ summary: `Skip ${i}` }), reason: "Ignored" })),
	window: { start: new Date(0), end: new Date(86400000), daysBack: 7, daysAhead: 30, timezone: "UTC" },
	errors: [], warnings: [], features,
});
const features = { personStubs: true, seriesStubs: true, skipped: true };
const openWithApply = (preview: any, apply = async () => {}) => {
	const modal = new SyncPreviewModal({}, preview, apply);
	modal.onOpen();
	const elements = allElements(modal.contentEl);
	return {
		buttons: elements.filter((element) => element.tag === "button" && !String(element.cls).includes("graft-segment")).map((element) => element.text),
		texts: elements.map((element) => element.text),
	};
};
const NOTHING = "Nothing to apply. No notes would be created or changed.";
const BLOCKED = "Apply is unavailable for this incomplete or ambiguous plan.";

test("Apply is unavailable when the plan has nothing to write", () => {
	for (const preview of [emptyPreview(features), emptyPreview(features, { skipped: 2 }), emptyPreview(features, { updates: 2 })]) {
		const { buttons, texts } = openWithApply(preview);
		assert.deepEqual(buttons, ["Close"]);
		assert.ok(texts.includes(NOTHING));
		assert.equal(texts.includes(BLOCKED), false);
	}
});

test("Apply stays available when anything would be created or changed", () => {
	const changed = emptyPreview(features, { updates: 1 });
	changed.updates[0].changes = [{ field: "title", before: "Old", after: "New" }];
	const mixed = emptyPreview(features, { newMeetings: 1, updates: 2, personStubs: 1, seriesStubs: 1 });
	for (const preview of [emptyPreview(features, { newMeetings: 1 }), emptyPreview(features, { personStubs: 1 }), emptyPreview(features, { seriesStubs: 1 }), changed, mixed]) {
		const { buttons, texts } = openWithApply(preview);
		assert.deepEqual(buttons, ["Apply", "Close"]);
		assert.equal(texts.includes(NOTHING), false);
	}
});

test("a blocked plan still shows the incomplete or ambiguous message", () => {
	for (const preview of [emptyPreview(features), emptyPreview(features, { newMeetings: 1 })]) {
		const modal = new SyncPreviewModal({}, preview);
		modal.onOpen();
		const texts = allElements(modal.contentEl).map((element) => element.text);
		assert.ok(texts.includes(BLOCKED));
		assert.equal(texts.includes(NOTHING), false);
		assert.equal(allElements(modal.contentEl).filter((element) => element.tag === "button" && !String(element.cls).includes("graft-segment")).length, 1);
	}
});

const summaryOf = (preview: any) => {
	const modal = new SyncPreviewModal({}, preview);
	modal.onOpen();
	return allElements(modal.contentEl).find((element) => element.text && /Meetings?[,.]/.test(element.text) && !element.text.includes("/")).text;
};

test("summary lists only the enabled features, in every combination", () => {
	const counts = { newMeetings: 2, updates: 3, personStubs: 4, seriesStubs: 5, skipped: 6 };
	for (const personStubs of [false, true]) for (const seriesStubs of [false, true]) for (const skipped of [false, true]) {
		const expected = ["2 new Meetings", "3 existing Meetings", ...(personStubs ? ["4 Person stubs"] : []), ...(seriesStubs ? ["5 Series stubs"] : []), "6 skipped"].join(", ") + ".";
		assert.equal(summaryOf(emptyPreview({ personStubs, seriesStubs, skipped }, counts)), expected);
	}
});

test("skipped shows only when filters are on or something was skipped", () => {
	const off = { personStubs: false, seriesStubs: false, skipped: false };
	const on = { ...off, skipped: true };
	// Duplicate-event skips with no filters configured.
	const duplicates = emptyPreview(off, { newMeetings: 8, skipped: 8 });
	duplicates.skipped = duplicates.skipped.map((item: any) => ({ ...item, reason: "Same event as one in Work" }));
	assert.equal(summaryOf(duplicates), "8 new Meetings, 0 existing Meetings, 8 skipped.");
	assert.equal(summaryOf(emptyPreview(off, { skipped: 1 })), "0 new Meetings, 0 existing Meetings, 1 skipped.");
	// Nothing skipped: hidden without filters, a zero with them.
	assert.equal(summaryOf(emptyPreview(off, { newMeetings: 2 })), "2 new Meetings, 0 existing Meetings.");
	assert.equal(summaryOf(emptyPreview(on, { newMeetings: 2 })), "2 new Meetings, 0 existing Meetings, 0 skipped.");
	// Filters configured with skips.
	assert.equal(summaryOf(emptyPreview(on, { newMeetings: 2, skipped: 5 })), "2 new Meetings, 0 existing Meetings, 5 skipped.");
});

test("an enabled feature with nothing to report still shows its zero", () => {
	assert.equal(summaryOf(emptyPreview({ personStubs: true, seriesStubs: true, skipped: true })), "0 new Meetings, 0 existing Meetings, 0 Person stubs, 0 Series stubs, 0 skipped.");
	assert.equal(summaryOf(emptyPreview({ personStubs: false, seriesStubs: false, skipped: false })), "0 new Meetings, 0 existing Meetings.");
});

test("summary and note rows use singular for one and plural for zero or many", () => {
	const on = { personStubs: true, seriesStubs: true, skipped: true };
	assert.equal(summaryOf(emptyPreview(on, { newMeetings: 1, updates: 1, personStubs: 1, seriesStubs: 1, skipped: 1 })), "1 new Meeting, 1 existing Meeting, 1 Person stub, 1 Series stub, 1 skipped.");
	assert.equal(summaryOf(emptyPreview(on, { newMeetings: 0, updates: 12, personStubs: 2 })), "0 new Meetings, 12 existing Meetings, 2 Person stubs, 0 Series stubs, 0 skipped.");
	const preview = emptyPreview(on);
	preview.updates = [0, 1, 2].map((n) => ({ path: `Meetings/R${n}.md`, changes: Array.from({ length: n }, (_: unknown, i: number) => ({ field: `f${i}`, before: "a", after: "b" })) }));
	const modal = new SyncPreviewModal({}, preview);
	modal.onOpen();
	const rows = allElements(modal.contentEl).filter((element) => element.tag === "summary" && element.children[0]?.cls?.startsWith("graft-item-title")).map((element) => element.children.map((child: any) => child.text).join(""));
	assert.deepEqual(rows, ["R1 (1 change)", "R2 (2 changes)", "R0 (0 changes)"]);
	const titles = allElements(modal.contentEl).filter((element) => element.cls?.startsWith("graft-item-title")).map((element) => element.attr.title);
	assert.deepEqual(titles, ["Meetings/R1.md", "Meetings/R2.md", "Meetings/R0.md"]);
});

test("preview new-note payload matches writeMeetingNote directly", async () => {
	const source = fixture();
	source.filenamePattern = "{{date}} {{title}}";
	const preview = buildSyncPreview(source);
	const writes: any[] = [];
	const app = { vault: { getAbstractFileByPath: () => null, create(path: string, content: string) { writes.push({ path, content }); return { path }; } } };
	await writeMeetingNote(app, source.meetingFolder, source.meetings[0].input, source.companies, source.filenamePattern);
	const written = writes[0];
	assert.equal(written.path, preview.newMeetings[0].path);
	const [, yaml, body] = written.content.split(/---\n/);
	assert.deepEqual(JSON.parse(yaml), preview.newMeetings[0].note.frontmatter);
	assert.equal(body, "\n" + preview.newMeetings[0].note.body);
});

test("preview diffs match updateMeetingNote writes and preserve handwritten content", async () => {
	for (const body of ["## Invite Agenda\n\nOld agenda\n\n# Human Notes (yay)\nKeep this", "# Human Notes (yay)\nKeep this"]) {
		const source = fixture();
		source.meetings[0].existing = { path: "Meetings/Existing.md", frontmatter: { title: "Old title", date: "2026-08-01", participants: ["[[Pat Example]]"] }, body };
		const preview = buildSyncPreview(source);
		const existing = source.meetings[0].existing;
		const actualFields = clean(existing.frontmatter);
		let actualBody = body;
		const app = {
			fileManager: { async processFrontMatter(file: any, update: any) { update(actualFields); } },
			vault: { async process(file: any, update: any) { actualBody = update(actualBody); } },
		};
		await updateMeetingNote(app, { path: existing.path }, source.meetings[0].input, source.companies);
		for (const change of preview.updates[0].changes.filter((item) => item.field !== "Invite Agenda")) {
			assert.deepEqual(clean(actualFields[change.field]), change.after);
			assert.deepEqual(existing.frontmatter[change.field], change.before);
		}
		const changedFields = Object.keys(actualFields).filter((field) => JSON.stringify(actualFields[field]) !== JSON.stringify(existing.frontmatter[field]));
		assert.deepEqual([...changedFields].sort(), preview.updates[0].changes.filter((item) => item.field !== "Invite Agenda").map((item) => item.field).sort());
		assert.equal(actualBody.includes("Keep this"), true);
		assert.equal(actualFields.date, "2026-09-01");
		assert.deepEqual(actualFields.participants, ["[[Pat Example]]"]);
		assert.equal(preview.updates[0].changes.some((item) => item.field === "Invite Agenda"), body.includes("## Invite Agenda"));
		const agenda = preview.updates[0].changes.find((item) => item.field === "Invite Agenda");
		if (agenda) {
			assert.equal(agenda.before, extractSection(body, "## Invite Agenda"));
			assert.equal(agenda.after, extractSection(actualBody, "## Invite Agenda"));
		} else assert.equal(actualBody, body);
	}
});

// Drives GraftPlugin.runSync with a Modal that tracks how many are open.
async function loadPlugin(canApply = true) {
	const stubs = {
		"./sync/flow.ts": `export const prepareSync = async () => ({ canApply: ${canApply}, preview: { window: { start: new Date(0), end: new Date(86400000), daysBack: 7, daysAhead: 30, timezone: 'UTC' }, newMeetings: [{ path: 'Meetings/New.md', note: { frontmatter: {}, body: '' } }], updates: [], personStubs: [], seriesStubs: [], skipped: [], errors: [], warnings: [], features: { personStubs: true, seriesStubs: true, skipped: true } } });
			export const applySync = async () => globalThis.__applySync();`,
		"./ics/fetch.ts": "export const fetchIcs = async () => '';",
	};
	const result = await build({
		entryPoints: ["src/main.ts"], bundle: true, write: false, platform: "node", format: "cjs", external: ["obsidian"],
		plugins: [{ name: "stubs", setup(b) {
			b.onResolve({ filter: /^\.\/(sync\/flow|ics\/fetch)\.ts$/ }, (args) => ({ path: args.path, namespace: "stub" }));
			b.onLoad({ filter: /.*/, namespace: "stub" }, (args: any) => ({ contents: (stubs as any)[args.path], loader: "ts" }));
		} }],
	});
	const state: any = { open: new Set(), maxOpen: 0, notices: [], applySync: async () => {} };
	class TrackedModal extends Modal {
		open() { state.open.add(this); state.maxOpen = Math.max(state.maxOpen, state.open.size); this.onOpen(); }
		close() { state.open.delete(this); super.close(); }
	}
	class Plugin { app: any; constructor() { this.app = { workspace: { onLayoutReady() {} } }; } addCommand() {} registerView() {} addRibbonIcon() {} addSettingTab() {} addStatusBarItem() { return { addClass() {}, setAttribute() {}, createSpan() { return {}; }, remove() {} }; } async loadData() { return { previewBeforeApply: true }; } }
	class Notice { constructor(message: string) { state.notices.push(message); } }
	const module: { exports: any } = { exports: {} };
	runInNewContext(result.outputFiles[0].text, {
		module, exports: module.exports, Promise, JSON, structuredClone, globalThis: { __applySync: () => state.applySync() },
		require: () => ({ ItemView: class {}, Modal: TrackedModal, Platform: { isMobile: false }, Plugin, Notice, PluginSettingTab: class {}, Setting: class {}, stringifyYaml: (v: unknown) => JSON.stringify(v) }),
	});
	const plugin = new module.exports.default();
	await plugin.loadSettings();
	return { plugin, state };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const buttons = (modal: any) => allElements(modal.contentEl).filter((element) => element.tag === "button");
const button = (modal: any, label: string) => buttons(modal).find((element) => element.text === label);
const only = (state: any) => { assert.equal(state.open.size, 1); return [...state.open][0]; };

test("a second preview cannot open while one is open, however the first is dismissed", async () => {
	for (const dismiss of ["Close button", "Escape or X", "Apply"]) {
		const { plugin, state } = await loadPlugin();
		void plugin.runSync(true);
		await tick();
		const first = only(state);
		void plugin.runSync(true);
		void plugin.runSync(false);
		await tick();
		assert.equal(state.open.size, 1, `${dismiss}: still one modal`);
		assert.equal(state.notices.length, 2);
		if (dismiss === "Close button") button(first, "Close").listeners.click();
		else if (dismiss === "Escape or X") first.close();
		else await button(first, "Apply").listeners.click();
		await tick();
		assert.equal(state.open.size, 0, `${dismiss}: closed`);
		void plugin.runSync(true);
		await tick();
		assert.notEqual(only(state), first, `${dismiss}: a fresh preview opens afterwards`);
		assert.equal(state.maxOpen, 1, `${dismiss}: never stacked`);
	}
});

test("dismissing a preview mid-apply does not let another open until apply finishes", async () => {
	const { plugin, state } = await loadPlugin();
	let finish: any;
	state.applySync = () => new Promise((resolve) => { finish = resolve; });
	void plugin.runSync(true);
	await tick();
	const first = only(state);
	void button(first, "Apply").listeners.click();
	await tick();
	button(first, "Close").listeners.click(); // ignored while applying
	assert.equal(state.open.size, 1);
	first.close(); // Escape or X during apply
	void plugin.runSync(true);
	await tick();
	assert.equal(state.open.size, 0);
	assert.equal(state.maxOpen, 1);
	finish();
	await tick();
	void plugin.runSync(true);
	await tick();
	assert.equal(state.open.size, 1);
	assert.equal(state.maxOpen, 1);
});

test("each kind of item is its own collapsible section with a count, and only the long quiet ones start closed", () => {
	const preview = emptyPreview(features, { newMeetings: 2, personStubs: 1, seriesStubs: 3, skipped: 4 });
	preview.updates = [
		{ path: "Meetings/Changed.md", changes: [{ field: "title", before: "a", after: "b" }] },
		{ path: "Meetings/Same 1.md", changes: [] },
		{ path: "Meetings/Same 2.md", changes: [] },
	];
	preview.warnings = [{ kind: "ambiguous-person", subject: "Alex" }];
	preview.errors = [{ feed: "Work", message: "x" }];
	const modal = new SyncPreviewModal({}, preview);
	modal.onOpen();
	const sections = allElements(modal.contentEl).filter((element) => element.cls === "graft-section");
	const state = Object.fromEntries(sections.map((section) => [section.children[0].text, section.open]));
	assert.deepEqual(state, {
		"New Meeting notes (2)": true,
		"Existing Meeting notes with changes (1)": true,
		"Unchanged Meeting notes (2)": false,
		"New Person stubs (1)": true,
		"New Series stubs (3)": true,
		"Skipped events (4)": false,
		"Warnings (1)": true,
		"Calendar errors (1)": true,
	});
	assert.ok(sections.every((section) => section.tag === "details" && section.children[0].tag === "summary"));
});

test("a section with nothing in it is not shown", () => {
	const preview = emptyPreview(features, { newMeetings: 1 });
	const modal = new SyncPreviewModal({}, preview);
	modal.onOpen();
	const titles = allElements(modal.contentEl).filter((element) => element.cls === "graft-section").map((section) => section.children[0].text);
	assert.deepEqual(titles, ["New Meeting notes (1)"]);
});

test("the head shows the sync window above the summary", () => {
	const modal = new SyncPreviewModal({}, emptyPreview(features));
	modal.preview.window = { start: new Date("2026-10-08T00:00:00Z"), end: new Date("2026-11-15T00:00:00Z"), daysBack: 7, daysAhead: 30, timezone: "UTC" };
	modal.onOpen();
	const head = allElements(modal.contentEl).find((element) => element.cls === "graft-preview-head");
	assert.deepEqual(head.children.map((child: any) => child.text), ["Dry run. No notes have been written.", "Covers 8 Oct to 14 Nov 2026 (7 days back, 30 ahead)."]);
});

function calendarSource(): any {
	// A window long past, so the view opens at its first day whatever today is.
	const source = fixture();
	source.window = { start: new Date("2020-03-02T00:00:00Z"), end: new Date("2020-04-01T00:00:00Z"), daysBack: 7, daysAhead: 22, timezone: "UTC" };
	source.plan.toProcess = [makeEvent({ summary: "Kept sync", start: "2020-03-04T14:00:00.000Z", end: "2020-03-04T14:30:00.000Z" })];
	source.meetings[0].input.event = source.plan.toProcess[0];
	source.plan.skipped = [{ event: makeEvent({ summary: "Dropped sync", start: "2020-03-04T16:00:00.000Z", end: "2020-03-04T17:00:00.000Z" }), reason: "Ignored by title rule" }];
	return source;
}
const click = (modal: any, text: string) => allElements(modal.contentEl).find((element) => element.text === text).listeners.click();
const texts = (modal: any) => allElements(modal.contentEl).map((element) => element.text);
const label = (modal: any) => allElements(modal.contentEl).find((element) => element.cls === "graft-cal-range").text;

test("list stays the default view and calendar adds nothing to it", () => {
	const modal = new SyncPreviewModal({}, buildSyncPreview(calendarSource()));
	modal.onOpen();
	const elements = allElements(modal.contentEl);
	assert.ok(elements.some((element) => element.text.startsWith("New Meeting notes")));
	assert.equal(elements.some((element) => String(element.cls).includes("graft-cal")), false);
});

test("calendar view shows kept and skipped events, ranges, and detail lines", () => {
	const modal = new SyncPreviewModal({}, buildSyncPreview(calendarSource()));
	modal.onOpen();
	click(modal, "Calendar");
	assert.equal(texts(modal).some((text) => text.startsWith("New Meeting notes")), false);
	assert.ok(texts(modal).some((text) => text.startsWith("Covers ")), "window label stays");
	assert.ok(texts(modal).some((text) => text.startsWith("1 new Meeting")), "summary stays");
	assert.equal(label(modal), "Mon 2 to Wed 4 Mar 2020");
	click(modal, "Week");
	assert.equal(label(modal), "Mon 2 to Sun 8 Mar 2020");
	const elements = allElements(modal.contentEl);
	const kept = elements.find((element) => String(element.cls).includes("graft-cal-event graft-cal-new"));
	const skipped = elements.find((element) => String(element.cls).includes("graft-cal-event graft-cal-skipped"));
	assert.deepEqual(kept.children.map((child: any) => child.text), ["14:00", "Kept sync"]);
	assert.deepEqual(skipped.children.map((child: any) => child.text), ["16:00", "Dropped sync"]);
	assert.ok(texts(modal).includes("Select an event to see its note and what will change."));
	kept.listeners.click();
	assert.ok(texts(modal).some((text) => text.startsWith("Kept sync: new note ")));
	allElements(modal.contentEl).find((element) => String(element.cls).includes("graft-cal-event graft-cal-skipped")).listeners.click();
	assert.ok(texts(modal).includes("Dropped sync: skipped. Ignored by title rule"));
	click(modal, "Next");
	assert.equal(label(modal), "Mon 9 to Sun 15 Mar 2020");
	click(modal, "List");
	assert.ok(texts(modal).some((text) => text.startsWith("New Meeting notes")));
});

test("calendar paging stops at the edges of the window", () => {
	const modal = new SyncPreviewModal({}, buildSyncPreview(calendarSource()));
	modal.onOpen();
	click(modal, "Calendar");
	const step = (name: string) => allElements(modal.contentEl).find((element) => element.text === name);
	assert.equal(step("Previous").disabled, true);
	assert.equal(step("Next").disabled, undefined);
	click(modal, "Week");
	for (let page = 0; page < 4; page++) click(modal, "Next");
	assert.equal(label(modal), "Mon 30 Mar to Sun 5 Apr 2020");
	assert.equal(step("Next").disabled, true);
});

test("the calendar opens on today when today is in the window, and outlines it", () => {
	const preview = buildSyncPreview(calendarSource());
	const now = new Date("2020-03-10T12:00:00Z");
	const state = initialCalendarState(preview, now);
	assert.deepEqual([state.span, state.anchor], [3, "2020-03-10"]);
	assert.equal(initialCalendarState(preview, new Date("2021-01-01T00:00:00Z")).anchor, "2020-03-02");
	const root = new Element();
	renderCalendar(root, preview, state, () => {}, now);
	const days = allElements(root).filter((element) => String(element.cls).startsWith("graft-cal-day"));
	assert.equal(days.filter((element) => element.cls === "graft-cal-day is-today").length, 1);
});

function rangePreview(daysBack: number, daysAhead: number): any {
	const source = calendarSource();
	const day = (offset: number) => new Date(Date.UTC(2020, 2, 9 + offset));
	source.window = { start: day(-daysBack), end: day(daysAhead + 1), daysBack, daysAhead, timezone: "UTC" };
	source.plan.errors = [];
	source.warnings = [];
	return buildSyncPreview(source);
}
const field = (modal: any, label: string) => allElements(modal.contentEl).find((element) => element.tag === "label" && element.children[0].text === label).children[1];
const type = (modal: any, label: string, value: string) => { const input = field(modal, label); input.value = value; input.listeners.input(); };
const settle = () => new Promise((resolve) => setImmediate(resolve));
const buttonOf = (modal: any, text: string) => allElements(modal.contentEl).find((element) => element.tag === "button" && element.text === text);
const rangeNote = (modal: any) => allElements(modal.contentEl).find((element) => element.cls === "graft-muted graft-range-note").text;

test("the range control appears in the calendar only when a range can be loaded", () => {
	const plain = new SyncPreviewModal({}, rangePreview(1, 1));
	plain.onOpen();
	click(plain, "Calendar");
	assert.equal(allElements(plain.contentEl).some((element) => element.cls === "graft-range"), false);
	const modal = new SyncPreviewModal({}, rangePreview(1, 1), undefined, undefined, async () => ({ preview: rangePreview(1, 1) }));
	modal.onOpen();
	assert.equal(allElements(modal.contentEl).some((element) => element.cls === "graft-range"), false, "list view stays as it was");
	click(modal, "Calendar");
	assert.equal(field(modal, "Days back").value, "1");
	assert.equal(field(modal, "Days ahead").value, "1");
});

test("Load range is disabled for a range over 30 days or a bad number, and says why", () => {
	const modal = new SyncPreviewModal({}, rangePreview(7, 12), undefined, undefined, async () => ({ preview: rangePreview(1, 1) }));
	modal.onOpen();
	click(modal, "Calendar");
	assert.equal(buttonOf(modal, "Load range").disabled, false);
	assert.match(rangeNote(modal), /^20 of 30 days\./);
	type(modal, "Days ahead", "23");
	assert.equal(buttonOf(modal, "Load range").disabled, true);
	assert.match(rangeNote(modal), /at most 30 days/);
	type(modal, "Days ahead", "22");
	assert.equal(buttonOf(modal, "Load range").disabled, false);
	type(modal, "Days ahead", "");
	assert.equal(buttonOf(modal, "Load range").disabled, true);
	assert.match(rangeNote(modal), /whole numbers/);
});

test("loading a range drops the old plan, then shows the new range and states it before Apply", async () => {
	let finish!: (value: any) => void;
	const requests: any[] = [];
	const applied: string[] = [];
	const reload = (range: any) => { requests.push(range); return new Promise<any>((resolve) => { finish = resolve; }); };
	const modal = new SyncPreviewModal({}, rangePreview(1, 1), async () => { applied.push("old"); }, undefined, reload);
	modal.onOpen();
	click(modal, "Calendar");
	assert.ok(texts(modal).includes("Apply writes the notes for 8 Mar to 10 Mar 2020."));
	type(modal, "Days back", "5");
	type(modal, "Days ahead", "9");
	click(modal, "Load range");
	assert.deepEqual(clean(requests), [{ daysBack: 5, daysAhead: 9 }]);
	assert.equal(texts(modal).includes("Apply"), false, "no Apply while the range loads");
	assert.equal(texts(modal).some((text) => text.startsWith("Covers ")), false, "the old range is not shown as current");
	assert.ok(texts(modal).includes("Reading calendars for the new range."));
	const status = allElements(modal.contentEl).find((element) => element.attr?.role === "status");
	assert.ok(status.children.some((child: any) => child.cls === "graft-spinner"), "a spinner shows while the range loads");
	finish({ preview: rangePreview(5, 9), apply: async () => { applied.push("new"); } });
	await settle();
	assert.ok(texts(modal).includes("Covers 4 Mar to 18 Mar 2020 (5 days back, 9 ahead)."));
	assert.ok(texts(modal).includes("Apply writes the notes for 4 Mar to 18 Mar 2020, a one-off range that is not saved to settings."));
	await click(modal, "Apply");
	await settle();
	assert.deepEqual(applied, ["new"]);
});

test("a plan for a blocked range offers no Apply, and the settings range can be restored", async () => {
	const requests: any[] = [];
	const reload = async (range: any) => { requests.push(range); return range ? { preview: rangePreview(0, 3) } : { preview: rangePreview(1, 1), apply: async () => {} }; };
	const modal = new SyncPreviewModal({}, rangePreview(1, 1), async () => {}, undefined, reload);
	modal.onOpen();
	click(modal, "Calendar");
	assert.equal(buttonOf(modal, "Use settings range"), undefined);
	click(modal, "Load range");
	await settle();
	assert.equal(texts(modal).includes("Apply"), false);
	assert.ok(texts(modal).includes("Apply is unavailable for this incomplete or ambiguous plan."));
	click(modal, "Use settings range");
	await settle();
	assert.deepEqual(clean(requests), [{ daysBack: 1, daysAhead: 1 }, null]);
	assert.ok(texts(modal).includes("Apply writes the notes for 8 Mar to 10 Mar 2020."));
	assert.equal(buttonOf(modal, "Use settings range"), undefined);
});

test("a range that fails to load brings back the previous plan and its range", async () => {
	const applied: string[] = [];
	const modal = new SyncPreviewModal({}, rangePreview(1, 1), async () => { applied.push("old"); }, undefined, async () => { throw new Error("synthetic"); });
	modal.onOpen();
	click(modal, "Calendar");
	click(modal, "Load range");
	await settle();
	assert.ok(texts(modal).includes("That range could not be loaded. The previous preview is shown again."));
	assert.ok(texts(modal).includes("Covers 8 Mar to 10 Mar 2020 (1 day back, 1 ahead)."));
	await click(modal, "Apply");
	await settle();
	assert.deepEqual(applied, ["old"]);
});

test("fields start trimmed to the cap for a longer window, with a note, and Load range is enabled", () => {
	const modal = new SyncPreviewModal({}, rangePreview(7, 30), undefined, undefined, async () => ({ preview: rangePreview(0, 29) }));
	modal.onOpen();
	click(modal, "Calendar");
	assert.equal(field(modal, "Days back").value, "0");
	assert.equal(field(modal, "Days ahead").value, "29");
	assert.equal(buttonOf(modal, "Load range").disabled, false);
	assert.match(rangeNote(modal), /^30 of 30 days\./);
	assert.ok(allElements(modal.contentEl).some((element) => String(element.cls).includes("graft-range-clamped")));
	assert.ok(texts(modal).some((text) => text.includes("(7 days back, 30 ahead)")), "the preview still shows the full range");
});

test("a window that fits starts as it is, with no note", () => {
	const modal = new SyncPreviewModal({}, rangePreview(7, 12), undefined, undefined, async () => ({ preview: rangePreview(1, 1) }));
	modal.onOpen();
	click(modal, "Calendar");
	assert.equal(field(modal, "Days back").value, "7");
	assert.equal(field(modal, "Days ahead").value, "12");
	assert.equal(allElements(modal.contentEl).some((element) => String(element.cls).includes("graft-range-clamped")), false);
});

test("the calendar draws a time grid with side by side events and a current time marker", () => {
	const source = calendarSource();
	source.plan.toProcess = [
		makeEvent({ summary: "First", start: "2020-03-10T09:00:00.000Z", end: "2020-03-10T10:00:00.000Z" }),
		makeEvent({ summary: "Second", start: "2020-03-10T09:30:00.000Z", end: "2020-03-10T10:30:00.000Z" }),
		makeEvent({ summary: "Holiday", allDay: true, start: "2020-03-10", end: "2020-03-11" }),
	];
	source.meetings = source.plan.toProcess.map((event: any) => ({ ...source.meetings[0], input: { ...source.meetings[0].input, event } }));
	const preview = buildSyncPreview(source);
	const now = new Date("2020-03-10T09:45:00Z");
	const root = new Element();
	renderCalendar(root, preview, initialCalendarState(preview, now), () => {}, now);
	const elements = allElements(root);
	const timed = elements.filter((element) => String(element.cls).includes("is-timed"));
	assert.deepEqual(timed.map((element) => element.attr?.style.match(/left:[\d.]+%;width:[\d.]+%/)[0]), ["left:0.000%;width:50.000%", "left:50.000%;width:50.000%"]);
	const row = elements.filter((element) => element.cls === "graft-cal-allday")[1];
	assert.deepEqual(row.children.map((child: any) => child.children.map((part: any) => part.text)), [["Holiday"]]);
	assert.equal(elements.filter((element) => element.cls === "graft-cal-now").length, 1);
});

test("selecting a calendar event lists its details", () => {
	const modal = new SyncPreviewModal({}, buildSyncPreview(calendarSource()));
	modal.onOpen();
	click(modal, "Calendar");
	const kept = allElements(modal.contentEl).find((element) => String(element.cls).includes("graft-cal-event graft-cal-new"));
	kept.listeners.click();
	const shown = texts(modal);
	for (const text of ["Title", "When", "Status", "Note", "Kept sync"]) assert.ok(shown.includes(text), text);
	assert.ok(shown.some((text) => text.startsWith("New note")));
	assert.equal(allElements(modal.contentEl).some((element) => element.text === "Open note"), false, "the modal stays read-only");
});

test("a preview opened before its plan shows a spinner, then the plan; closing it first drops the plan", () => {
	const modal = new SyncPreviewModal({}, undefined, undefined, undefined, undefined);
	modal.onOpen();
	assert.ok(texts(modal).includes("Reading calendars and building the plan."));
	const status = allElements(modal.contentEl).find((element) => element.attr?.role === "status");
	assert.ok(status.children.some((child: any) => child.cls === "graft-spinner"));
	assert.equal(texts(modal).includes("Apply"), false);
	assert.deepEqual(allElements(modal.contentEl).filter((e) => e.tag === "button").map((e) => e.text), ["List", "Calendar", "Close"]);
	modal.ready(rangePreview(1, 1), async () => {});
	assert.equal(allElements(modal.contentEl).some((element) => element.cls?.includes("graft-spinner")), false);
	assert.ok(texts(modal).includes("Apply"));
	const early = new SyncPreviewModal({}, undefined);
	early.onOpen();
	early.close();
	early.ready(rangePreview(1, 1));
	assert.equal(early.isClosed, true);
	assert.equal(texts(early).includes("Apply"), false);
});

test("warning subjects show note titles, and leave event titles and names alone", async () => {
	const { warningSubjectTitle } = await import("../../src/preview/summary.ts");
	const { noteTitle } = await import("../../src/util/vaultPath.ts");
	assert.equal(noteTitle("Meetings/Sub/Dev Sync 2026-10-21 2.md"), "Dev Sync 2026-10-21 2");
	assert.equal(noteTitle("Plain.md"), "Plain");
	assert.equal(warningSubjectTitle("Meetings/Dev Sync 2026-10-21.md"), "Dev Sync 2026-10-21");
	assert.equal(warningSubjectTitle("People/A.md and Other/B.md"), "A and B");
	assert.equal(warningSubjectTitle("Design review"), "Design review");
	assert.equal(warningSubjectTitle("Q3/Q4 planning"), "Q3/Q4 planning");
});

test("a vanished note the setting would cancel says how to turn it on", () => {
	const source = fixture();
	source.warnings = [{ kind: "vanished-event", subject: "Meetings/Dropped.md", wouldCancel: true }, { kind: "vanished-event", subject: "Meetings/Plain.md" }];
	const modal = new SyncPreviewModal({}, buildSyncPreview(source));
	modal.onOpen();
	const text = allElements(modal.contentEl).map((element) => element.text).join("\n");
	assert.ok(text.includes("Turn on Cancel vanished events to mark it."));
	assert.ok(text.includes("The note is left as it is."));
});
