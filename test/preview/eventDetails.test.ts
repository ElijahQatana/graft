import { test } from "node:test";
import { strict as assert } from "node:assert";
import { eventDetails, formatWhen, warningsFor } from "../../src/preview/eventDetails.ts";
import { makeEvent } from "../helpers.ts";

const timed = makeEvent({ summary: "Design review", start: "2026-10-15T09:00:00.000Z", end: "2026-10-15T09:30:00.000Z" });
const rows = (list: ReturnType<typeof eventDetails>) => Object.fromEntries(list.map(({ label, lines }) => [label, lines]));

test("formatWhen shows the local time range and zone", () => {
	assert.equal(formatWhen(timed, "UTC"), "Thu 15 Oct 2026, 09:00 to 09:30 (UTC)");
	assert.equal(formatWhen(timed, "America/New_York"), "Thu 15 Oct 2026, 05:00 to 05:30 (America/New_York)");
});

test("formatWhen names both days for an event that crosses midnight", () => {
	const overnight = makeEvent({ start: "2026-10-15T22:00:00.000Z", end: "2026-10-16T02:00:00.000Z" });
	assert.equal(formatWhen(overnight, "UTC"), "Thu 15 Oct 2026, 22:00 to Fri 16 Oct 2026, 02:00 (UTC)");
});

test("formatWhen treats all-day dates as written, with an exclusive end", () => {
	assert.equal(formatWhen(makeEvent({ allDay: true, start: "2026-10-15", end: "2026-10-16" }), "Pacific/Auckland"), "Thu 15 Oct 2026, all day");
	assert.equal(formatWhen(makeEvent({ allDay: true, start: "2026-10-15", end: "2026-10-17" }), "UTC"), "Thu 15 Oct 2026 to Fri 16 Oct 2026, all day");
});

test("a new event lists its title, time, status and path", () => {
	const planned = { event: timed, path: "Meetings/Design review.md", state: "new" as const, changes: [] };
	const found = rows(eventDetails({ event: timed, kind: "new", planned }, [], "UTC"));
	assert.deepEqual(found.Title, ["Design review"]);
	assert.deepEqual(found.Note, ["Meetings/Design review.md"]);
	assert.match(found.Status[0], /^New note/);
	assert.equal(found.Changes, undefined);
	assert.equal(found.Warnings, undefined);
});

test("a changed event lists each field change and matching warnings only", () => {
	const planned = { event: timed, path: "Meetings/Design review.md", state: "changed" as const, changes: [{ field: "Start", before: "09:00", after: "10:00" }, { field: "Invite Agenda", before: undefined, after: "Notes" }] };
	const warnings = [
		{ kind: "missing-invite-heading" as const, subject: "Meetings/Design review.md" },
		{ kind: "unresolved-company" as const, subject: "Meetings/Other.md" },
	];
	const found = rows(eventDetails({ event: timed, kind: "changed", planned }, warnings, "UTC"));
	assert.deepEqual(found.Changes, ["Start: 09:00 to 10:00", "Invite Agenda: (missing) to Notes"]);
	assert.equal(found.Warnings.length, 1);
	assert.match(found.Warnings[0], /No invite agenda heading/);
});

test("a skipped event shows its reason and no note", () => {
	const found = rows(eventDetails({ event: timed, kind: "skipped", reason: "Ignored by title rule" }, [], "UTC"));
	assert.deepEqual(found.Reason, ["Ignored by title rule"]);
	assert.equal(found.Note, undefined);
	assert.deepEqual(rows(eventDetails({ event: timed, kind: "skipped" }, [], "UTC")).Reason, ["No reason given."]);
});

test("warnings can match an event by title", () => {
	const lines = warningsFor({ event: timed, kind: "skipped" }, [{ kind: "vanished-event", subject: "Design review" }]);
	assert.equal(lines.length, 1);
});
