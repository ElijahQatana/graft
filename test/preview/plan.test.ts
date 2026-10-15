import { test } from "node:test";
import { strict as assert } from "node:assert";
import { buildSyncPreview, type PreviewInput } from "../../src/preview/plan.ts";
import { buildMeetingNote } from "../../src/generate/meetingNote.ts";
import { buildMeetingFrontmatterUpdate } from "../../src/generate/meetingUpdate.ts";
import { buildPersonStub } from "../../src/generate/personStub.ts";
import { buildSeriesStub } from "../../src/generate/seriesStub.ts";
import { ORIGINAL_SCHEMA } from "../../src/config/schema.ts";
import { buildWindowLabel } from "../../src/preview/summary.ts";
import { makeEvent } from "../helpers.ts";

export function fixture(): PreviewInput {
	const event = makeEvent({ summary: "Synthetic sync", description: "New agenda", isRecurring: true });
	return {
		plan: { toProcess: [event], skipped: [], errors: [] },
		meetings: [{ input: { event, invited: [], invitedAs: "one@example.com", schema: ORIGINAL_SCHEMA, timezone: "UTC" } }],
		personStubs: [], seriesStubs: [], companies: [], meetingFolder: "Meetings", warnings: [],
		window: { start: new Date("2026-10-08T00:00:00Z"), end: new Date("2026-11-15T00:00:00Z"), daysBack: 7, daysAhead: 30, timezone: "UTC" },
		features: { personStubs: true, seriesStubs: true, skipped: false },
	};
}

test("new notes use the generators, configured filenames, and validated links without changing inputs", () => {
	const source = fixture();
	source.filenamePattern = "{{date}} {{title}}";
	source.meetings[0].input.organizer = { filename: "Alex Example", companyLinks: ["[[Missing]]"] };
	const person = buildPersonStub({ email: "alex@example.com", name: "Alex Example" }, [], [], ORIGINAL_SCHEMA);
	const series = buildSeriesStub(source.plan.toProcess[0], ORIGINAL_SCHEMA);
	source.personStubs.push({ path: "People/Alex Example.md", stub: person });
	source.seriesStubs.push({ path: "Series/Synthetic sync.md", stub: series });
	const before = JSON.stringify(source);
	const preview = buildSyncPreview(source);
	const expected = buildMeetingNote(source.meetings[0].input, source.filenamePattern, { companies: [], strictCompanyLinks: true });
	assert.deepEqual(preview.newMeetings, [{ path: "Meetings/2026-09-01 Synthetic sync.md", note: expected }]);
	assert.deepEqual(preview.personStubs, source.personStubs);
	assert.deepEqual(preview.seriesStubs, source.seriesStubs);
	assert.deepEqual(preview.warnings, [{ kind: "unresolved-company", subject: "Synthetic sync" }]);
	assert.equal(JSON.stringify(source), before);
});

test("no unresolved-Company warning is raised when strict links are off, as when Company linking is off", () => {
	const source = fixture();
	source.strictCompanyLinks = false;
	source.meetings[0].input.organizer = { filename: "Alex Example", companyLinks: ["[[Missing]]"] };
	assert.deepEqual(buildSyncPreview(source).warnings, []);
	source.meetings[0].input.organizer = { filename: "Alex Example", companyLinks: [] };
	source.strictCompanyLinks = true;
	assert.deepEqual(buildSyncPreview(source).warnings, []);
});

test("updates show only changed calendar fields and the Invite Agenda", () => {
	const source = fixture();
	const input = source.meetings[0].input;
	const frontmatter = { ...buildMeetingFrontmatterUpdate(input, []), title: "Old title", invited: [], participants: ["[[Pat Example]]"] };
	source.meetings[0].existing = { path: "Meetings/Original.md", frontmatter, body: "## Invite Agenda\n\nOld agenda\n\n# Human Notes (yay)\n\nKeep this" };
	assert.deepEqual(buildSyncPreview(source).updates, [{ path: "Meetings/Original.md", changes: [
		{ field: "title", before: "Old title", after: "Synthetic sync" },
		{ field: "Invite Agenda", before: "Old agenda", after: "New agenda" },
	] }]);
	assert.deepEqual(frontmatter.participants, ["[[Pat Example]]"]);
});

test("unchanged arrays and missing agenda headings do not produce changes", () => {
	const source = fixture();
	source.meetings[0].existing = { path: "Meetings/Original.md", frontmatter: buildMeetingFrontmatterUpdate(source.meetings[0].input, []), body: "# Human Notes (yay)\nKeep this" };
	assert.deepEqual(buildSyncPreview(source).updates[0].changes, []);
});

test("an existing note without the invite heading warns, and a note with it does not", () => {
	const source = fixture();
	const frontmatter = buildMeetingFrontmatterUpdate(source.meetings[0].input, []);
	source.meetings[0].existing = { path: "Meetings/Original.md", frontmatter, body: "# Human Notes (yay)\nKeep this" };
	const missing = buildSyncPreview(source);
	assert.deepEqual(missing.warnings, [{ kind: "missing-invite-heading", subject: "Meetings/Original.md" }]);
	assert.deepEqual(missing.updates[0].changes, []);
	source.meetings[0].existing.body = "## Invite Agenda\n\nOld agenda";
	assert.deepEqual(buildSyncPreview(source).warnings, []);
	source.meetings[0].existing.body = "## Invite Agenda\n\nNew agenda";
	assert.deepEqual(buildSyncPreview(source).warnings, []);
});

test("the invite heading check follows the configured heading and ignores new notes", () => {
	const source = fixture();
	source.meetings[0].input.schema = { ...ORIGINAL_SCHEMA, headings: { ...ORIGINAL_SCHEMA.headings, inviteAgenda: "## From the invite" } };
	assert.deepEqual(buildSyncPreview(source).warnings, []);
	source.meetings[0].existing = { path: "Meetings/Original.md", frontmatter: {}, body: "## Invite Agenda\n\nOld agenda" };
	assert.deepEqual(buildSyncPreview(source).warnings, [{ kind: "missing-invite-heading", subject: "Meetings/Original.md" }]);
	source.meetings[0].existing.body = "## From the invite\n\nOld agenda";
	assert.deepEqual(buildSyncPreview(source).warnings, []);
});

test("unchanged agenda text preserves existing body spacing", () => {
	const source = fixture();
	const body = "## Invite Agenda\nNew agenda\n# Human Notes (yay)\nKeep this";
	source.meetings[0].existing = { path: "Meetings/Original.md", frontmatter: buildMeetingFrontmatterUpdate(source.meetings[0].input, []), body };
	const changes = buildSyncPreview(source).updates[0].changes;
	assert.equal(changes.length, 0);
});

test("explicit cancellation is shown but vanished events are warnings only", () => {
	const source = fixture();
	source.plan.toProcess[0].status = "CANCELLED";
	source.meetings[0].existing = { path: "Meetings/Original.md", frontmatter: { ...buildMeetingFrontmatterUpdate(source.meetings[0].input, []), occurrence_status: "Scheduled" }, body: "## Invite Agenda\n\nNew agenda" };
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

test("the preview carries a copy of the enabled-feature flags", () => {
	const source = fixture();
	source.features = { personStubs: false, seriesStubs: true, skipped: true };
	const preview = buildSyncPreview(source);
	assert.deepEqual(preview.features, source.features);
	source.features.personStubs = true;
	assert.equal(preview.features.personStubs, false);
});

test("a reschedule to another day shows the Date change in the preview", () => {
	const source = fixture();
	source.meetings[0].existing = {
		path: "Meetings/Old.md",
		frontmatter: { date: "2026-08-31", scheduled_start: "14:00", scheduled_end: "14:30" },
		body: "",
	};
	const changes = buildSyncPreview(source).updates[0].changes;
	assert.deepEqual(changes.find((change) => change.field === "date"), { field: "date", before: "2026-08-31", after: "2026-09-01" });
});

test("the preview carries a copy of the sync window", () => {
	const source = fixture();
	const preview = buildSyncPreview(source);
	assert.deepEqual(preview.window, source.window);
	source.window.daysBack = 1;
	assert.equal(preview.window.daysBack, 7);
});

test("the window label covers the default settings", () => {
	assert.equal(buildWindowLabel(fixture().window), "Covers 8 Oct to 14 Nov 2026 (7 days back, 30 ahead).");
});

test("the window label follows custom settings, the time zone and a year change", () => {
	const window = { start: new Date("2026-12-29T08:00:00Z"), end: new Date("2027-01-06T08:00:00Z"), daysBack: 1, daysAhead: 6, timezone: "America/Los_Angeles" };
	assert.equal(buildWindowLabel(window), "Covers 29 Dec 2026 to 5 Jan 2027 (1 day back, 6 ahead).");
});
