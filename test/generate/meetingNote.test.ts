import { test } from "node:test";
import { strict as assert } from "node:assert";
import { buildMeetingNote, type MeetingNoteInput } from "../../src/generate/meetingNote.ts";
import { ORIGINAL_SCHEMA, cloneSchema } from "../../src/config/schema.ts";
import { makeEvent } from "../helpers.ts";

function baseInput(overrides: Partial<MeetingNoteInput> = {}): MeetingNoteInput {
	return {
		event: makeEvent(),
		invited: [],
		invitedAs: "me@example.com",
		schema: ORIGINAL_SCHEMA,
		timezone: "America/New_York",
		...overrides,
	};
}

test("builds core frontmatter fields from the event and resolved entities", () => {
	const note = buildMeetingNote(
		baseInput({
			event: makeEvent({
				uid: "series-1@example.com",
				recurrenceId: "2026-09-01T14:00:00.000Z",
				summary: "Weekly Sync",
				start: "2026-09-01T14:00:00.000Z",
				end: "2026-09-01T14:30:00.000Z",
				isRecurring: true,
			}),
			organizer: { filename: "Alex Example", companyLinks: ["[[Acme]]"] },
			invited: [{ filename: "Sam Example", companyLinks: ["[[Beta]]"] }],
			series: { filename: "Weekly Sync" },
		}),
	);

	assert.equal(note.frontmatter.type, "Meeting");
	assert.equal(note.frontmatter.subtype, "RegularSync");
	assert.equal(note.frontmatter.title, "Weekly Sync");
	assert.equal(note.frontmatter.date, "2026-09-01");
	assert.equal(note.frontmatter.weekday, "Tuesday");
	assert.equal(note.frontmatter.scheduled_start, "10:00");
	assert.equal(note.frontmatter.scheduled_end, "10:30");
	assert.equal(note.frontmatter.organizer, "[[Alex Example]]");
	assert.deepEqual(note.frontmatter.invited, ["[[Sam Example]]"]);
	assert.equal(note.frontmatter.series, "[[Weekly Sync]]");
	assert.deepEqual(note.frontmatter.companies, ["[[Acme]]", "[[Beta]]"]);
	assert.equal(note.frontmatter.ics_uid, "series-1@example.com");
	assert.equal(note.frontmatter.ics_recurrence_id, "2026-09-01T14:00:00.000Z");
});

test("subtype is OneOff and series/ics_recurrence_id are blank when there's no series", () => {
	const note = buildMeetingNote(baseInput());
	assert.equal(note.frontmatter.subtype, "OneOff");
	assert.equal(note.frontmatter.series, "");
	assert.equal(note.frontmatter.ics_recurrence_id, "");
});

test("occurrence_status reflects an explicitly cancelled invite", () => {
	const note = buildMeetingNote(baseInput({ event: makeEvent({ status: "CANCELLED" }) }));
	assert.equal(note.frontmatter.occurrence_status, "Cancelled");
});

test("occurrence_status defaults to Scheduled otherwise", () => {
	const note = buildMeetingNote(baseInput());
	assert.equal(note.frontmatter.occurrence_status, "Scheduled");
});

test("configured status and recurrence values are written", () => {
	const schema = cloneSchema(ORIGINAL_SCHEMA);
	schema.statusValues = { scheduled: "Planned", cancelled: "Called off" };
	schema.recurrenceValues = { series: "Recurring", oneOff: "Single" };
	const live = buildMeetingNote(baseInput({ schema }));
	assert.equal(live.frontmatter.occurrence_status, "Planned");
	assert.equal(live.frontmatter.subtype, "Single");
	const cancelled = buildMeetingNote(baseInput({ schema, event: makeEvent({ status: "CANCELLED" }), series: { filename: "S" } }));
	assert.equal(cancelled.frontmatter.occurrence_status, "Called off");
	assert.equal(cancelled.frontmatter.subtype, "Recurring");
});

test("company links are deduplicated across organizer and invited", () => {
	const note = buildMeetingNote(
		baseInput({
			organizer: { filename: "Alex Example", companyLinks: ["[[Acme]]"] },
			invited: [{ filename: "Sam Example", companyLinks: ["[[Acme]]"] }],
		}),
	);
	assert.deepEqual(note.frontmatter.companies, ["[[Acme]]"]);
});

test("filename uses the default pattern and sanitizes a slash in the title", () => {
	const note = buildMeetingNote(
		baseInput({
			event: makeEvent({
				summary: "Marketing/Sales sync",
				start: "2026-09-01T14:00:00.000Z",
			}),
		}),
	);
	assert.equal(note.filename, "Marketing-Sales sync 2026-09-01");
	// The literal title in frontmatter keeps the slash, only the filename is sanitized.
	assert.equal(note.frontmatter.title, "Marketing/Sales sync");
});

test("a custom filename pattern is honored", () => {
	const note = buildMeetingNote(baseInput({ event: makeEvent({ summary: "Sync" }) }), "{{date}} {{title}}");
	assert.equal(note.filename, "2026-09-01 Sync");
});

test("body puts the Series Agenda before the Invite Agenda, omitted entirely when there's no series content", () => {
	const withSeries = buildMeetingNote(
		baseInput({ seriesStandingAgenda: "- Task one\n- Task two" }),
	);
	assert.match(withSeries.body, /## Series Agenda\n\n- Task one\n- Task two\n\n\n## Invite Agenda/);

	const withoutSeries = buildMeetingNote(baseInput());
	assert.doesNotMatch(withoutSeries.body, /Series Agenda/);
});

test("Invite Agenda falls back to a placeholder when the invite has no description", () => {
	const note = buildMeetingNote(baseInput({ event: makeEvent({ description: undefined }) }));
	assert.match(note.body, /## Invite Agenda\n\nNo agenda provided/);
});

test("Invite Agenda uses the invite's own description when present", () => {
	const note = buildMeetingNote(baseInput({ event: makeEvent({ description: "Discuss Q3 numbers" }) }));
	assert.match(note.body, /## Invite Agenda\n\nDiscuss Q3 numbers/);
});

test("an all-day event's date comes from the plain calendar date, not a timezone conversion", () => {
	const note = buildMeetingNote(
		baseInput({
			event: makeEvent({ allDay: true, start: "2026-09-10", end: "2026-09-11" }),
		}),
	);
	assert.equal(note.frontmatter.date, "2026-09-10");
});

test("Invite Agenda drops join text and falls back to the placeholder when nothing else is left", () => {
	const joinOnly = "Join Zoom Meeting\nhttps://example.zoom.us/j/12345678901\n\nMeeting ID: 123 4567 8901";
	const empty = buildMeetingNote(baseInput({ event: makeEvent({ description: joinOnly }) }));
	assert.match(empty.body, /## Invite Agenda\n\nNo agenda provided/);

	const mixed = buildMeetingNote(baseInput({ event: makeEvent({ description: `Discuss Q3 numbers\n\n${joinOnly}` }) }));
	assert.match(mixed.body, /## Invite Agenda\n\nDiscuss Q3 numbers\n/);
	assert.doesNotMatch(mixed.body, /zoom\.us|Meeting ID/);
});
