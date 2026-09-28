import { test } from "node:test";
import { strict as assert } from "node:assert";
import { matchMeeting, type MeetingRecord } from "../../src/match/meetingMatch.ts";

const directory: MeetingRecord[] = [
	{ path: "5calendar/2meetings/Kickoff call 2026-09-01.md", icsUid: "oneoff-1@example.com" },
	{
		path: "5calendar/2meetings/Weekly sync 2026-09-01.md",
		icsUid: "series-1@example.com",
		icsRecurrenceId: "2026-09-01T14:00:00.000Z",
	},
	{
		path: "5calendar/2meetings/Weekly sync 2026-09-08.md",
		icsUid: "series-1@example.com",
		icsRecurrenceId: "2026-09-08T14:00:00.000Z",
	},
];

test("matches a one-off event by uid alone", () => {
	const match = matchMeeting("oneoff-1@example.com", undefined, directory);
	assert.equal(match?.path, "5calendar/2meetings/Kickoff call 2026-09-01.md");
});

test("matches a recurring occurrence by uid and recurrenceId together", () => {
	const match = matchMeeting("series-1@example.com", "2026-09-08T14:00:00.000Z", directory);
	assert.equal(match?.path, "5calendar/2meetings/Weekly sync 2026-09-08.md");
});

test("the same uid with a different recurrenceId doesn't cross-match a sibling occurrence", () => {
	const match = matchMeeting("series-1@example.com", "2026-09-15T14:00:00.000Z", directory);
	assert.equal(match, undefined);
});

test("returns undefined for a uid nothing tracks yet", () => {
	assert.equal(matchMeeting("unknown@example.com", undefined, directory), undefined);
});
