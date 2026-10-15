import { test } from "node:test";
import { strict as assert } from "node:assert";
import { buildMeetingBodyUpdate, buildMeetingFrontmatterUpdate, type MeetingUpdateInput } from "../../src/generate/meetingUpdate.ts";
import type { CompanyRecord } from "../../src/match/companyMatch.ts";
import { ORIGINAL_SCHEMA, cloneSchema } from "../../src/config/schema.ts";
import { makeEvent } from "../helpers.ts";

const companies: CompanyRecord[] = [{ path: "companies/Acme.md", name: "Acme", domain: "acme.example" }];

function baseInput(overrides: Partial<MeetingUpdateInput> = {}): MeetingUpdateInput {
	return {
		event: makeEvent(),
		invited: [],
		invitedAs: "me@example.com",
		schema: ORIGINAL_SCHEMA,
		timezone: "America/New_York",
		...overrides,
	};
}

test("never includes week, month, year, or weekday", () => {
	const update = buildMeetingFrontmatterUpdate(baseInput(), companies);
	for (const forbidden of ["week", "month", "year", "weekday"]) {
		assert.equal(forbidden in update, false, `${forbidden} must not be in the update`);
	}
});

test("updates the time fields for a reschedule", () => {
	const update = buildMeetingFrontmatterUpdate(
		baseInput({
			event: makeEvent({ start: "2026-09-01T16:00:00.000Z", end: "2026-09-01T16:30:00.000Z" }),
		}),
		companies,
	);
	assert.equal(update.scheduled_start, "12:00");
	assert.equal(update.scheduled_end, "12:30");
});

test("a reschedule to another day updates the date in the configured timezone", () => {
	const update = buildMeetingFrontmatterUpdate(
		baseInput({ event: makeEvent({ start: "2026-09-09T02:00:00.000Z", end: "2026-09-09T02:30:00.000Z" }) }),
		companies,
	);
	assert.equal(update.date, "2026-09-08");
	assert.equal(update.scheduled_start, "22:00");
});

test("occurrence_status is only set when the invite is explicitly cancelled", () => {
	const notCancelled = buildMeetingFrontmatterUpdate(baseInput(), companies);
	assert.equal("occurrence_status" in notCancelled, false);

	const cancelled = buildMeetingFrontmatterUpdate(
		baseInput({ event: makeEvent({ status: "CANCELLED" }) }),
		companies,
	);
	assert.equal(cancelled.occurrence_status, "Cancelled");
});

test("configured values are used, and the cancelled value only on an explicit cancellation", () => {
	const schema = cloneSchema(ORIGINAL_SCHEMA);
	schema.statusValues = { scheduled: "Planned", cancelled: "Called off" };
	schema.recurrenceValues = { series: "Recurring", oneOff: "Single" };
	const live = buildMeetingFrontmatterUpdate(baseInput({ schema, series: { filename: "S" } }), companies);
	assert.equal("occurrence_status" in live, false);
	const cancelled = buildMeetingFrontmatterUpdate(baseInput({ schema, event: makeEvent({ status: "CANCELLED" }) }), companies);
	assert.equal(cancelled.occurrence_status, "Called off");
	const extras = { ...schema, meetingExtras: [{ key: "subtype", value: "{{recurrence}}", updateOnSync: true }] };
	assert.equal(buildMeetingFrontmatterUpdate(baseInput({ schema: extras, series: { filename: "S" } }), companies).subtype, "Recurring");
	assert.equal(buildMeetingFrontmatterUpdate(baseInput({ schema: extras }), companies).subtype, "Single");
});

test("companies are validated against the real directory, not trusted", () => {
	const update = buildMeetingFrontmatterUpdate(
		baseInput({
			organizer: { filename: "Alex Example", companyLinks: ["[[Acme]]", "[[Ghost Co]]"] },
		}),
		companies,
	);
	assert.deepEqual(update.companies, ["[[Acme]]"]);
});

test("ics_recurrence_id updates to the event's own value", () => {
	const update = buildMeetingFrontmatterUpdate(
		baseInput({ event: makeEvent({ uid: "series-1", recurrenceId: "2026-09-08T14:00:00.000Z" }) }),
		companies,
	);
	assert.equal(update.ics_uid, "series-1");
	assert.equal(update.ics_recurrence_id, "2026-09-08T14:00:00.000Z");
});

const HEADING = "## Invite Agenda";

test("an update changes only the invite agenda section and leaves the Series Agenda and notes alone", () => {
	const body = "# Agenda\n\n## Series Agenda\n\n- Review actions\n\n\n## Invite Agenda\n\nOld text\n\n# Notes\nMy own notes\n";
	const updated = buildMeetingBodyUpdate(body, "New text", HEADING);
	assert.equal(updated, body.replace("Old text", "New text"));
});

test("an empty invite keeps a section that holds the old default or the configured placeholder", () => {
	const old = "## Invite Agenda\nNo agenda provided\n# Notes\n";
	assert.equal(buildMeetingBodyUpdate(old, undefined, HEADING, "- "), old);
	assert.equal(buildMeetingBodyUpdate(old, "  ", HEADING), old);
	const bullet = "## Invite Agenda\n\n- \n\n# Notes\n";
	assert.equal(buildMeetingBodyUpdate(bullet, undefined, HEADING, "- "), bullet);
});

test("an empty invite replaces other section text with the configured placeholder", () => {
	const body = "## Invite Agenda\n\nStale text\n\n# Notes\n";
	assert.equal(buildMeetingBodyUpdate(body, undefined, HEADING, "- "), "## Invite Agenda\n\n- \n\n# Notes\n");
});

test("an update never writes the participants property, so an edited list is left alone", () => {
	const schema = cloneSchema(ORIGINAL_SCHEMA);
	schema.meetingExtras = schema.meetingExtras.filter((field) => field.key !== "participants");
	schema.meeting.participants = "attendees";
	const update = buildMeetingFrontmatterUpdate(baseInput({ schema, invited: [{ filename: "Sam Example", companyLinks: [] }] }), companies);
	assert.equal("attendees" in update, false);
	assert.deepEqual(update.invited, ["[[Sam Example]]"]);
});
