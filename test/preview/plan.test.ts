import { test } from "node:test";
import { strict as assert } from "node:assert";
import { buildSyncPreview, type PreviewInput } from "../../src/preview/plan.ts";
import { buildMeetingNote } from "../../src/generate/meetingNote.ts";
import { buildMeetingFrontmatterUpdate } from "../../src/generate/meetingUpdate.ts";
import { buildPersonStub } from "../../src/generate/personStub.ts";
import { buildSeriesStub } from "../../src/generate/seriesStub.ts";
import { makeEvent } from "../helpers.ts";

export function fixture(): PreviewInput {
	const event = makeEvent({ summary: "Synthetic sync", description: "New agenda", isRecurring: true });
	return {
		plan: { toProcess: [event], skipped: [], errors: [] },
		meetings: [{ input: { event, invited: [], invitedAs: "one@example.com", timezone: "UTC" } }],
		personStubs: [], seriesStubs: [], companies: [], meetingFolder: "Meetings", warnings: [],
	};
}

test("new notes use the generators, configured filenames, and validated links without changing inputs", () => {
	const source = fixture();
	source.filenamePattern = "{{date}} {{title}}";
	source.meetings[0].input.organizer = { filename: "Alex Example", companyLinks: ["[[Missing]]"] };
	const person = buildPersonStub({ email: "alex@example.com", name: "Alex Example" }, [], []);
	const series = buildSeriesStub(source.plan.toProcess[0]);
	source.personStubs.push({ path: "People/Alex Example.md", stub: person });
	source.seriesStubs.push({ path: "Series/Synthetic sync.md", stub: series });
	const before = JSON.stringify(source);
	const preview = buildSyncPreview(source);
	const expected = buildMeetingNote(source.meetings[0].input, source.filenamePattern);
	expected.frontmatter.companies = [];
	assert.deepEqual(preview.newMeetings, [{ path: "Meetings/2026-09-01 Synthetic sync.md", note: expected }]);
	assert.deepEqual(preview.personStubs, source.personStubs);
	assert.deepEqual(preview.seriesStubs, source.seriesStubs);
	assert.deepEqual(preview.warnings, [{ kind: "unresolved-company", subject: "Synthetic sync" }]);
	assert.equal(JSON.stringify(source), before);
});

test("updates show only changed calendar fields and the Invite Agenda", () => {
	const source = fixture();
	const input = source.meetings[0].input;
	const frontmatter = { ...buildMeetingFrontmatterUpdate(input, []), title: "Old title", invited: [], date: "2026-08-01", participants: ["[[Pat Example]]"] };
	source.meetings[0].existing = { path: "Meetings/Original.md", frontmatter, body: "## Invite Agenda\n\nOld agenda\n\n# Human Notes (yay)\n\nKeep this" };
	assert.deepEqual(buildSyncPreview(source).updates, [{ path: "Meetings/Original.md", changes: [
		{ field: "title", before: "Old title", after: "Synthetic sync" },
		{ field: "Invite Agenda", before: "Old agenda", after: "New agenda" },
	] }]);
	assert.equal(frontmatter.date, "2026-08-01");
	assert.deepEqual(frontmatter.participants, ["[[Pat Example]]"]);
});

test("unchanged arrays and missing agenda headings do not produce changes", () => {
	const source = fixture();
	source.meetings[0].existing = { path: "Meetings/Original.md", frontmatter: buildMeetingFrontmatterUpdate(source.meetings[0].input, []), body: "# Human Notes (yay)\nKeep this" };
	assert.deepEqual(buildSyncPreview(source).updates[0].changes, []);
});

test("body spacing changes are shown even when the agenda text stays the same", () => {
	const source = fixture();
	const body = "## Invite Agenda\nNew agenda\n# Human Notes (yay)\nKeep this";
	source.meetings[0].existing = { path: "Meetings/Original.md", frontmatter: buildMeetingFrontmatterUpdate(source.meetings[0].input, []), body };
	const changes = buildSyncPreview(source).updates[0].changes;
	assert.equal(changes.length, 1);
	assert.equal(changes[0].field, "Body formatting");
	assert.equal(changes[0].before, body);
	assert.match(changes[0].after as string, /Keep this/);
});

test("explicit cancellation is shown but vanished events are warnings only", () => {
	const source = fixture();
	source.plan.toProcess[0].status = "CANCELLED";
	source.meetings[0].existing = { path: "Meetings/Original.md", frontmatter: { ...buildMeetingFrontmatterUpdate(source.meetings[0].input, []), occurrence_status: "Scheduled" }, body: "" };
	source.warnings.push({ kind: "vanished-event", subject: "Meetings/Missing.md" }, { kind: "ambiguous-person", subject: "Alex Example" });
	source.plan.skipped.push({ event: makeEvent({ summary: "Skip example" }), reason: "Ignored" });
	source.plan.errors.push({ feed: "Outlook", message: "Calendar feed could not be fetched or parsed." });
	const preview = buildSyncPreview(source);
	assert.deepEqual(preview.updates[0].changes, [{ field: "occurrence_status", before: "Scheduled", after: "Cancelled" }]);
	assert.deepEqual(preview.warnings, source.warnings);
	assert.deepEqual(preview.skipped, source.plan.skipped);
	assert.deepEqual(preview.errors, source.plan.errors);
});

test("unresolved or out-of-order events cannot silently disappear from the preview", () => {
	const source = fixture();
	source.meetings = [];
	assert.throws(() => buildSyncPreview(source), /resolved input/);
	const other = fixture();
	other.meetings[0].input.event = makeEvent();
	assert.throws(() => buildSyncPreview(other), /resolved input/);
});
