import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mergeDuplicates } from "../../src/filters/duplicates.ts";
import type { CalendarEvent } from "../../src/types.ts";

function event(uid: string, source: string, overrides: Partial<CalendarEvent> = {}): CalendarEvent {
	return {
		uid, source, summary: "Budget review", attendees: [], isRecurring: false, allDay: false,
		start: "2026-09-01T14:00:00.000Z", end: "2026-09-01T14:30:00.000Z", ...overrides,
	};
}

const ORDER = ["Work", "Home", "Extra"];

test("keeps the copy from the calendar listed first and names it in the reason", () => {
	const result = mergeDuplicates([event("a", "Home"), event("b", "Work")], ORDER);
	assert.deepEqual(result.kept.map((e) => e.uid), ["b"]);
	assert.deepEqual(result.skipped.map((s) => [s.event.uid, s.reason]), [["a", "Duplicate of Budget review from Work"]]);
});

test("matches titles ignoring case and outer spaces", () => {
	const result = mergeDuplicates([event("a", "Work"), event("b", "Home", { summary: "  BUDGET review " })], ORDER);
	assert.deepEqual(result.kept.map((e) => e.uid), ["a"]);
});

test("does not merge different titles, starts or ends", () => {
	const events = [
		event("a", "Work"),
		event("b", "Home", { summary: "Budget review 2" }),
		event("c", "Home", { start: "2026-09-01T14:15:00.000Z" }),
		event("d", "Home", { end: "2026-09-01T15:00:00.000Z" }),
	];
	assert.equal(mergeDuplicates(events, ORDER).skipped.length, 0);
});

test("never merges events within one calendar", () => {
	const result = mergeDuplicates([event("a", "Work"), event("b", "Work")], ORDER);
	assert.deepEqual(result.kept.map((e) => e.uid), ["a", "b"]);
	assert.equal(result.skipped.length, 0);
});

test("a calendar that wins keeps all its own copies and the other calendar's copies are dropped", () => {
	const result = mergeDuplicates([event("a", "Work"), event("b", "Work"), event("c", "Home")], ORDER);
	assert.deepEqual(result.kept.map((e) => e.uid), ["a", "b"]);
	assert.deepEqual(result.skipped.map((s) => s.event.uid), ["c"]);
});

test("compares timed events as instants, whatever the text form", () => {
	const result = mergeDuplicates([
		event("a", "Work", { start: "2026-09-01T14:00:00Z", end: "2026-09-01T14:30:00Z" }),
		event("b", "Home", { start: "2026-09-01T10:00:00-04:00", end: "2026-09-01T10:30:00-04:00" }),
	], ORDER);
	assert.deepEqual(result.kept.map((e) => e.uid), ["a"]);
});

test("all-day events match on date, and never match a timed event", () => {
	const day = { allDay: true, start: "2026-09-01", end: "2026-09-02" };
	const same = mergeDuplicates([event("a", "Work", day), event("b", "Home", day)], ORDER);
	assert.deepEqual(same.kept.map((e) => e.uid), ["a"]);
	const other = mergeDuplicates([event("a", "Work", day), event("b", "Home", { ...day, start: "2026-09-02", end: "2026-09-03" })], ORDER);
	assert.equal(other.skipped.length, 0);
	assert.equal(mergeDuplicates([event("a", "Work", day), event("b", "Home")], ORDER).skipped.length, 0);
});

test("three calendars: the first listed wins and both others are dropped", () => {
	const result = mergeDuplicates([event("c", "Extra"), event("a", "Home"), event("b", "Work")], ORDER);
	assert.deepEqual(result.kept.map((e) => e.uid), ["b"]);
	assert.deepEqual(result.skipped.map((s) => s.event.uid), ["c", "a"]);
});

test("a meeting in only one calendar is kept", () => {
	const result = mergeDuplicates([event("a", "Work"), event("b", "Home", { summary: "Other" })], ORDER);
	assert.equal(result.kept.length, 2);
});

test("a calendar missing from the order ranks last, and detail breaks a tie", () => {
	const unknown = mergeDuplicates([event("a", "Gone"), event("b", "Home")], ORDER);
	assert.deepEqual(unknown.kept.map((e) => e.uid), ["b"]);
	const tie = mergeDuplicates([
		event("a", "Gone"),
		event("b", "Also gone", { description: "Agenda", attendees: [{ email: "pat@example.com" }] }),
	], ORDER);
	assert.deepEqual(tie.kept.map((e) => e.uid), ["b"]);
});

test("the kept event is returned unchanged", () => {
	const winner = event("a", "Work", { recurrenceId: "2026-09-01T14:00:00.000Z" });
	const result = mergeDuplicates([winner, event("b", "Home")], ORDER);
	assert.equal(result.kept[0], winner);
});
