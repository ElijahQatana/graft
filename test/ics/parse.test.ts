import { test } from "node:test";
import { strict as assert } from "node:assert";
import { parseIcs } from "../../src/ics/parse.ts";

const WINDOW = {
	start: new Date("2026-08-25T00:00:00Z"),
	end: new Date("2026-09-30T00:00:00Z"),
};

test("parses a one-off event inside the window", () => {
	const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:oneoff-1@example.com
DTSTAMP:20260101T000000Z
DTSTART:20260901T140000Z
DTEND:20260901T143000Z
SUMMARY:Kickoff call
ORGANIZER;CN=Alex Example:mailto:alex@example.com
ATTENDEE;CN=Sam Example:mailto:sam@example.com
STATUS:CONFIRMED
LAST-MODIFIED:20260115T000000Z
END:VEVENT
END:VCALENDAR
`;

	const events = parseIcs(ics, WINDOW);

	assert.equal(events.length, 1);
	const event = events[0];
	assert.equal(event.uid, "oneoff-1@example.com");
	assert.equal(event.recurrenceId, undefined);
	assert.equal(event.summary, "Kickoff call");
	assert.equal(event.start, "2026-09-01T14:00:00.000Z");
	assert.equal(event.end, "2026-09-01T14:30:00.000Z");
	assert.equal(event.allDay, false);
	assert.equal(event.isRecurring, false);
	assert.equal(event.status, "CONFIRMED");
	assert.deepEqual(event.organizer, { email: "alex@example.com", name: "Alex Example" });
	assert.deepEqual(event.attendees, [{ email: "sam@example.com", name: "Sam Example" }]);
});

test("drops a one-off event outside the window", () => {
	const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:oneoff-2@example.com
DTSTAMP:20260101T000000Z
DTSTART:20260101T140000Z
DTEND:20260101T143000Z
SUMMARY:Long past
END:VEVENT
END:VCALENDAR
`;

	assert.deepEqual(parseIcs(ics, WINDOW), []);
});

test("expands a weekly recurring series with the correct time-of-day", () => {
	// Regression check: seeding the RRULE iterator at the window boundary
	// must not shift occurrences to the seed's own clock time.
	const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:series-1@example.com
DTSTAMP:20260101T000000Z
DTSTART:20260901T140000Z
DTEND:20260901T143000Z
RRULE:FREQ=WEEKLY;COUNT=4
SUMMARY:Weekly sync
ORGANIZER;CN=Alex Example:mailto:alex@example.com
END:VEVENT
END:VCALENDAR
`;

	const events = parseIcs(ics, WINDOW);

	assert.equal(events.length, 4);
	for (const event of events) {
		assert.equal(event.uid, "series-1@example.com");
		assert.equal(event.isRecurring, true);
		assert.match(event.start, /T14:00:00\.000Z$/);
	}
	assert.deepEqual(
		events.map((e) => e.recurrenceId),
		[
			"2026-09-01T14:00:00.000Z",
			"2026-09-08T14:00:00.000Z",
			"2026-09-15T14:00:00.000Z",
			"2026-09-22T14:00:00.000Z",
		],
	);
});

test("keeps recurring occurrence times correct when the series predates the window by years", () => {
	// Same regression, exercised against a series whose DTSTART is well
	// before the window, so the iterator has to actually skip forward.
	const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:old-series@example.com
DTSTAMP:20260101T000000Z
DTSTART:20200902T160000Z
DTEND:20200902T163000Z
RRULE:FREQ=WEEKLY
SUMMARY:Long-running weekly
END:VEVENT
END:VCALENDAR
`;

	const events = parseIcs(ics, WINDOW);

	assert.ok(events.length > 0);
	for (const event of events) {
		assert.match(event.start, /T16:00:00\.000Z$/);
	}
});

test("applies a moved, retitled, and cancelled exception to its one occurrence only", () => {
	const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:series-2@example.com
DTSTAMP:20260101T000000Z
DTSTART:20260901T140000Z
DTEND:20260901T143000Z
RRULE:FREQ=WEEKLY;COUNT=3
SUMMARY:Weekly sync
STATUS:CONFIRMED
DESCRIPTION:Master agenda
LAST-MODIFIED:20260101T000000Z
END:VEVENT
BEGIN:VEVENT
UID:series-2@example.com
RECURRENCE-ID:20260908T140000Z
DTSTAMP:20260101T000000Z
DTSTART:20260908T160000Z
DTEND:20260908T163000Z
SUMMARY:Weekly sync (moved, cancelled)
STATUS:CANCELLED
DESCRIPTION:This one is cancelled
LAST-MODIFIED:20260905T000000Z
END:VEVENT
END:VCALENDAR
`;

	const events = parseIcs(ics, WINDOW);

	assert.equal(events.length, 3);
	const [first, moved, third] = events;

	assert.equal(first.summary, "Weekly sync");
	assert.equal(first.status, "CONFIRMED");
	assert.equal(first.recurrenceId, "2026-09-01T14:00:00.000Z");

	// The RECURRENCE-ID always names the ORIGINAL slot being overridden,
	// even though this occurrence itself now starts two hours later.
	assert.equal(moved.recurrenceId, "2026-09-08T14:00:00.000Z");
	assert.equal(moved.start, "2026-09-08T16:00:00.000Z");
	assert.equal(moved.summary, "Weekly sync (moved, cancelled)");
	assert.equal(moved.status, "CANCELLED");
	assert.equal(moved.description, "This one is cancelled");
	assert.equal(moved.lastModified, "2026-09-05T00:00:00Z");

	assert.equal(third.summary, "Weekly sync");
	assert.equal(third.status, "CONFIRMED");
});

test("resolves a TZID-qualified event to the correct UTC instant", () => {
	const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTIMEZONE
TZID:America/New_York
BEGIN:DAYLIGHT
DTSTART:19700308T020000
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
TZNAME:EDT
END:DAYLIGHT
BEGIN:STANDARD
DTSTART:19701101T020000
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
TZNAME:EST
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:tz-1@example.com
DTSTAMP:20260101T000000Z
DTSTART;TZID=America/New_York:20260901T100000
DTEND;TZID=America/New_York:20260901T110000
SUMMARY:Outlook-style invite
END:VEVENT
END:VCALENDAR
`;

	const events = parseIcs(ics, WINDOW);

	assert.equal(events.length, 1);
	// 10:00 EDT (UTC-4) is 14:00 UTC.
	assert.equal(events[0].start, "2026-09-01T14:00:00.000Z");
});

test("keeps an all-day event as a plain calendar date, not a local-timezone instant", () => {
	const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:allday-1@example.com
DTSTAMP:20260101T000000Z
DTSTART;VALUE=DATE:20260910
DTEND;VALUE=DATE:20260911
SUMMARY:Company holiday
END:VEVENT
END:VCALENDAR
`;

	const events = parseIcs(ics, WINDOW);

	assert.equal(events.length, 1);
	assert.equal(events[0].allDay, true);
	assert.equal(events[0].start, "2026-09-10");
	assert.equal(events[0].end, "2026-09-11");
});
