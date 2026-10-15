import { test } from "node:test";
import { strict as assert } from "node:assert";
import { filterByRsvp } from "../../src/filters/rsvp.ts";
import { makeEvent } from "../helpers.ts";

const identities = new Map([["Work", "alex.tester@example.com"]]);

function eventWith(partstat?: string, email = "alex.tester@example.com") {
	return makeEvent({ source: "Work", attendees: [{ email: "sam@example.com", partstat: "ACCEPTED" }, { email, partstat }] });
}

test("keeps an accepted event", () => {
	const result = filterByRsvp([eventWith("ACCEPTED")], identities);
	assert.equal(result.kept.length, 1);
	assert.equal(result.skipped.length, 0);
});

test("skips declined, tentative and needs-action with a reason", () => {
	const result = filterByRsvp([eventWith("DECLINED"), eventWith("TENTATIVE"), eventWith("NEEDS-ACTION")], identities);
	assert.equal(result.kept.length, 0);
	assert.deepEqual(result.skipped.map((s) => s.reason), [
		"not accepted (declined)", "not accepted (tentative)", "not accepted (no response yet)",
	]);
});

test("keeps an event whose entry has no PARTSTAT", () => {
	assert.equal(filterByRsvp([eventWith(undefined)], identities).kept.length, 1);
});

test("keeps events with no entry for the user", () => {
	const organiser = makeEvent({ source: "Work", organizer: { email: "alex.tester@example.com" }, attendees: [{ email: "sam@example.com", partstat: "NEEDS-ACTION" }] });
	const noGuests = makeEvent({ source: "Work" });
	assert.equal(filterByRsvp([organiser, noGuests], identities).kept.length, 2);
});

test("compares emails without regard to case", () => {
	const result = filterByRsvp([eventWith("DECLINED", "Alex.Tester@Example.COM")], new Map([["Work", " ALEX.tester@example.com "]]));
	assert.equal(result.skipped.length, 1);
});

test("keeps everything when the calendar has no identity", () => {
	const blank = new Map([["Work", ""]]);
	assert.equal(filterByRsvp([eventWith("DECLINED")], blank).kept.length, 1);
	assert.equal(filterByRsvp([eventWith("DECLINED")], new Map()).kept.length, 1);
});

test("uses the identity of the calendar the event came from", () => {
	const other = new Map([["Work", "alex.tester@example.com"], ["Home", "someone.else@example.com"]]);
	const fromHome = { ...eventWith("DECLINED"), source: "Home" };
	assert.equal(filterByRsvp([fromHome], other).kept.length, 1);
});

test("keeps a PARTSTAT it does not know", () => {
	assert.equal(filterByRsvp([eventWith("DELEGATED")], identities).kept.length, 1);
});
