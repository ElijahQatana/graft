import { test, before } from "node:test";
import { strict as assert } from "node:assert";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";
import { buildSyncPreview } from "../../src/preview/plan.ts";
import { ORIGINAL_SCHEMA } from "../../src/config/schema.ts";
import { makeEvent } from "../helpers.ts";
import { extractSection } from "../../src/util/markdownSections.ts";

class Element {
	tag = "";
	text = "";
	children: any[] = [];
	listeners: Record<string, any> = {};
	createEl(tag: string, options: any = {}) {
		const child = new Element();
		child.tag = tag;
		child.text = options.text ?? "";
		this.children.push(child);
		return child;
	}
	addEventListener(name: string, callback: any) { this.listeners[name] = callback; }
	empty() { this.children = []; }
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
		companies: [], meetingFolder: "Meetings", features: { personStubs: true, seriesStubs: true, skipped: true }, warnings: [{ kind: "ambiguous-person", subject: "Alex Example" }, { kind: "vanished-event", subject: "Meetings/Missing.md" }],
	};
}

test("modal displays each section as literal text and never shows raw feed errors or writes", () => {
	const source = fixture();
	const preview = buildSyncPreview(source);
	preview.warnings.push({ kind: "missing-invite-heading", subject: "Meetings/Existing.md" });
	preview.updates.push({ path: "Meetings/Existing.md", changes: [{ field: "title", before: "Old title", after: "New title" }] });
	const modal = new SyncPreviewModal({}, preview);
	modal.onOpen();
	const elements = allElements(modal.contentEl);
	const text = elements.map((element) => element.text).join("\n");
	for (const expected of ["Dry run", "New Meeting notes", "Existing Meeting notes", "Old title", "New title", "New Person stubs", "New Series stubs", "Skipped example: Ignored", "Unresolved Company link", "Ambiguous Person match", "Event missing from the feed", "Meetings/Existing.md: No invite agenda heading", "preview is incomplete", source.plan.toProcess[0].summary]) assert.ok(text.includes(expected), expected);
	assert.equal(text.includes("synthetic private response"), false);
	assert.equal(elements.filter((element) => element.tag === "button").length, 1);
	modal.onOpen();
	assert.equal(modal.title, "Graft sync preview");
	assert.equal(allElements(modal.contentEl).filter((element) => element.text === "Graft sync preview").length, 0);
	allElements(modal.contentEl).find((element) => element.tag === "button").listeners.click();
	assert.equal(modal.closed, true);
	assert.deepEqual(modal.contentEl.children, []);
});

test("empty previews and unchanged meetings are explicit", () => {
	const modal = new SyncPreviewModal({}, { newMeetings: [], updates: [], personStubs: [], seriesStubs: [], skipped: [], errors: [], warnings: [], features: { personStubs: true, seriesStubs: true, skipped: true } });
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
	errors: [], warnings: [], features,
});
const features = { personStubs: true, seriesStubs: true, skipped: true };
const openWithApply = (preview: any, apply = async () => {}) => {
	const modal = new SyncPreviewModal({}, preview, apply);
	modal.onOpen();
	const elements = allElements(modal.contentEl);
	return {
		buttons: elements.filter((element) => element.tag === "button").map((element) => element.text),
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
		assert.equal(allElements(modal.contentEl).filter((element) => element.tag === "button").length, 1);
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
	const rows = allElements(modal.contentEl).filter((element) => element.tag === "summary").map((element) => element.text);
	assert.deepEqual(rows, ["Meetings/R0.md (0 changes)", "Meetings/R1.md (1 change)", "Meetings/R2.md (2 changes)"]);
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
		assert.deepEqual(changedFields, preview.updates[0].changes.filter((item) => item.field !== "Invite Agenda").map((item) => item.field));
		assert.equal(actualBody.includes("Keep this"), true);
		assert.equal(actualFields.date, "2026-08-01");
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
		"./sync/flow.ts": `export const prepareSync = async () => ({ canApply: ${canApply}, preview: { newMeetings: [{ path: 'Meetings/New.md', note: { frontmatter: {}, body: '' } }], updates: [], personStubs: [], seriesStubs: [], skipped: [], errors: [], warnings: [], features: { personStubs: true, seriesStubs: true, skipped: true } } });
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
	class Plugin { app: any; constructor() { this.app = { workspace: { onLayoutReady() {} } }; } addCommand() {} addSettingTab() {} async loadData() { return { previewBeforeApply: true }; } }
	class Notice { constructor(message: string) { state.notices.push(message); } }
	const module: { exports: any } = { exports: {} };
	runInNewContext(result.outputFiles[0].text, {
		module, exports: module.exports, Promise, JSON, structuredClone, globalThis: { __applySync: () => state.applySync() },
		require: () => ({ Modal: TrackedModal, Plugin, Notice, PluginSettingTab: class {}, Setting: class {}, stringifyYaml: (v: unknown) => JSON.stringify(v) }),
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
