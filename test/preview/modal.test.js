import { test } from "node:test";
import { strict as assert } from "node:assert";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";
import { buildSyncPreview } from "../../src/preview/plan.ts";
import { makeEvent } from "../helpers.ts";
import { extractSection } from "../../src/util/markdownSections.ts";

class Element {
	children = [];
	listeners = {};
	createEl(tag, options = {}) {
		const child = new Element();
		child.tag = tag;
		child.text = options.text ?? "";
		this.children.push(child);
		return child;
	}
	addEventListener(name, callback) { this.listeners[name] = callback; }
	empty() { this.children = []; }
}
class Modal {
	contentEl = new Element();
	constructor(app) { this.app = app; }
	close() { this.closed = true; this.onClose(); }
}
async function load(entry) {
	const result = await build({ entryPoints: [entry], bundle: true, write: false, platform: "node", format: "cjs", external: ["obsidian"] });
	const module = { exports: {} };
	runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require: () => ({ Modal, stringifyYaml: (value) => JSON.stringify(value) + "\n" }) });
	return module.exports;
}
const { SyncPreviewModal } = await load("src/preview/modal.ts");
const { writeMeetingNote } = await load("src/generate/writeMeetingNote.ts");
const { updateMeetingNote } = await load("src/generate/updateMeetingNote.ts");
function allElements(root) { return [root, ...root.children.flatMap(allElements)]; }
function clean(value) { return JSON.parse(JSON.stringify(value)); }

function fixture() {
	const event = makeEvent({ summary: "<img src=x onerror=alert(1)>", description: "New agenda" });
	return {
		plan: { toProcess: [event], skipped: [{ event: makeEvent({ summary: "Skipped example" }), reason: "Ignored" }], errors: [{ feed: "Outlook", message: "synthetic private response" }] },
		meetings: [{ input: { event, invited: [], invitedAs: "one@example.com", timezone: "UTC", organizer: { filename: "Alex Example", companyLinks: ["[[Missing]]"] } } }],
		personStubs: [{ path: "People/Alex Example.md", stub: { filename: "Alex Example", frontmatter: { full_name: "Alex Example", email: "alex@example.com", company: [] } } }],
		seriesStubs: [{ path: "Series/Example.md", stub: { filename: "Example", frontmatter: { series_title: "Example", google_recurring_event_id: "series@example.com" } } }],
		companies: [], meetingFolder: "Meetings", warnings: [{ kind: "ambiguous-person", subject: "Alex Example" }, { kind: "vanished-event", subject: "Meetings/Missing.md" }],
	};
}

test("modal displays each section as literal text and never shows raw feed errors or writes", () => {
	const source = fixture();
	const preview = buildSyncPreview(source);
	preview.updates.push({ path: "Meetings/Existing.md", changes: [{ field: "title", before: "Old title", after: "New title" }] });
	const modal = new SyncPreviewModal({}, preview);
	modal.onOpen();
	const elements = allElements(modal.contentEl);
	const text = elements.map((element) => element.text).join("\n");
	for (const expected of ["Dry run", "New Meeting notes", "Existing Meeting notes", "Old title", "New title", "New Person stubs", "New Series stubs", "Skipped example: Ignored", "Unresolved Company link", "Ambiguous Person match", "Event missing from the feed", "preview is incomplete", source.plan.toProcess[0].summary]) assert.ok(text.includes(expected), expected);
	assert.equal(text.includes("synthetic private response"), false);
	assert.equal(elements.filter((element) => element.tag === "button").length, 1);
	modal.onOpen();
	assert.equal(allElements(modal.contentEl).filter((element) => element.text === "Graft sync preview").length, 1);
	allElements(modal.contentEl).find((element) => element.tag === "button").listeners.click();
	assert.equal(modal.closed, true);
	assert.deepEqual(modal.contentEl.children, []);
});

test("empty previews and unchanged meetings are explicit", () => {
	const modal = new SyncPreviewModal({}, { newMeetings: [], updates: [], personStubs: [], seriesStubs: [], skipped: [], errors: [], warnings: [] });
	modal.onOpen();
	assert.ok(allElements(modal.contentEl).some((element) => element.text === "No note changes planned."));
	modal.preview.updates.push({ path: "Meetings/Existing.md", changes: [] });
	modal.onOpen();
	assert.ok(allElements(modal.contentEl).some((element) => element.text === "No field changes."));
});

test("preview new-note payload matches writeMeetingNote directly", async () => {
	const source = fixture();
	source.filenamePattern = "{{date}} {{title}}";
	const preview = buildSyncPreview(source);
	const writes = [];
	const app = { vault: { getAbstractFileByPath: () => null, create(path, content) { writes.push({ path, content }); return { path }; } } };
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
			fileManager: { async processFrontMatter(file, update) { update(actualFields); } },
			vault: { async process(file, update) { actualBody = update(actualBody); } },
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
