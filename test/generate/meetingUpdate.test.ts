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

test("never includes date, week, month, year, or weekday", () => {
	const update = buildMeetingFrontmatterUpdate(baseInput(), companies);
	for (const forbidden of ["date", "week", "month", "year", "weekday"]) {
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

test("body update cleans the invite text and leaves a cleaned section untouched", () => {
	const joinText = "Join with Google Meet\nMeeting link: https://meet.google.com/abc-defg-hij";
	const body = "# Notes\n\n## Invite Agenda\n\nDiscuss Q3 numbers\n\n## Notes\n\nMine";
	assert.equal(buildMeetingBodyUpdate(body, `Discuss Q3 numbers\n\n${joinText}`, "## Invite Agenda"), body);
	assert.match(buildMeetingBodyUpdate(body, joinText, "## Invite Agenda"), /## Invite Agenda\n\nNo agenda provided/);
});
