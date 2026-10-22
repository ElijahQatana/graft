import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { parseIcs } from "../../src/ics/parse.ts";
import { addDays, bucketByDay, dayRange, localDate, weekStart } from "../../src/preview/calendar.ts";
import type { WeekDay } from "../../src/util/weekStart.ts";
import { makeEvent } from "../helpers.ts";

test("the week starts on each of the seven days", () => {
	// Thu 22 Oct 2026. Each start day maps to the most recent such day on or before it.
	const expected = ["2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-16", "2026-10-17"];
	expected.forEach((start, firstDay) => assert.equal(weekStart("2026-10-22", firstDay as WeekDay), start, `start day ${firstDay}`));
});

test("a date that is the first day of its week stays put, and the last day belongs to the same week", () => {
	assert.equal(weekStart("2026-10-18", 0), "2026-10-18");
	assert.equal(weekStart("2026-10-24", 0), "2026-10-18");
	assert.equal(weekStart("2026-10-25", 0), "2026-10-25");
	assert.equal(weekStart("2026-10-12", 1), "2026-10-12");
	assert.equal(weekStart("2026-10-18", 1), "2026-10-12");
	assert.equal(weekStart("2026-10-24", 6), "2026-10-24");
	assert.equal(weekStart("2026-10-23", 6), "2026-10-17");
});

test("week starts cross month and year ends", () => {
	assert.equal(weekStart("2027-01-01", 0), "2026-12-27");
	assert.equal(weekStart("2026-03-01", 1), "2026-02-23");
});

const window = { start: new Date("2026-10-01T00:00:00Z"), end: new Date("2026-11-30T00:00:00Z") };
const wrap = (events: ReturnType<typeof makeEvent>[]) => events.map((event) => ({ event }));
const titles = (bucket: { entries: Array<{ item: { event: { summary: string } } }> }) => bucket.entries.map((entry) => entry.item.event.summary);

test("date helpers work on plain dates", () => {
	assert.equal(addDays("2026-10-31", 1), "2026-11-01");
	assert.deepEqual(dayRange("2026-10-30", 3), ["2026-10-30", "2026-10-31", "2026-11-01"]);
	assert.equal(localDate(new Date("2026-10-15T02:00:00Z"), "America/New_York"), "2026-10-14");
});

test("local day boundaries follow the time zone", () => {
	const items = wrap([makeEvent({ summary: "Late", start: "2026-10-15T03:30:00.000Z", end: "2026-10-15T04:00:00.000Z" })]);
	const dates = dayRange("2026-10-14", 2);
	const utc = bucketByDay(items, dates, "UTC");
	assert.deepEqual(utc.map(titles), [[], ["Late"]]);
	const eastern = bucketByDay(items, dates, "America/New_York");
	assert.deepEqual(eastern.map(titles), [["Late"], []]);
	assert.equal(eastern[0].entries[0].startTime, "23:30");
});

test("an event ending exactly at midnight stays on its own day", () => {
	const items = wrap([makeEvent({ summary: "Evening", start: "2026-10-15T20:00:00.000Z", end: "2026-10-16T00:00:00.000Z" })]);
	const days = bucketByDay(items, dayRange("2026-10-15", 2), "UTC");
	assert.deepEqual(days.map(titles), [["Evening"], []]);
	assert.equal(days[0].entries[0].continuesToNext, false);
});

test("an event spanning midnight appears on both days and says so", () => {
	const items = wrap([makeEvent({ summary: "Overnight", start: "2026-10-15T22:00:00.000Z", end: "2026-10-16T02:00:00.000Z" })]);
	const [first, second] = bucketByDay(items, dayRange("2026-10-15", 2), "UTC");
	assert.deepEqual([first.entries[0].continuesFromPrevious, first.entries[0].continuesToNext], [false, true]);
	assert.deepEqual([second.entries[0].continuesFromPrevious, second.entries[0].continuesToNext], [true, false]);
	assert.equal(second.entries[0].endTime, "02:00");
});

test("an all-day event covers its dates with an exclusive end, in any zone", () => {
	const items = wrap([makeEvent({ summary: "Offsite", allDay: true, start: "2026-10-15", end: "2026-10-17" })]);
	for (const zone of ["UTC", "Pacific/Auckland", "America/Los_Angeles"]) {
		const days = bucketByDay(items, dayRange("2026-10-14", 4), zone);
		assert.deepEqual(days.map(titles), [[], ["Offsite"], ["Offsite"], []], zone);
	}
	const [, first, second] = bucketByDay(items, dayRange("2026-10-14", 4), "UTC");
	assert.deepEqual([first.entries[0].continuesToNext, second.entries[0].continuesFromPrevious, second.entries[0].continuesToNext], [true, true, false]);
});

test("an all-day event without a later end covers one day", () => {
	const items = wrap([makeEvent({ summary: "One day", allDay: true, start: "2026-10-15", end: "2026-10-15" })]);
	assert.deepEqual(bucketByDay(items, dayRange("2026-10-14", 3), "UTC").map(titles), [[], ["One day"], []]);
});

test("all-day events come first, then timed events by start", () => {
	const items = wrap([
		makeEvent({ summary: "Afternoon", start: "2026-10-15T15:00:00.000Z", end: "2026-10-15T16:00:00.000Z" }),
		makeEvent({ summary: "Morning", start: "2026-10-15T09:00:00.000Z", end: "2026-10-15T10:00:00.000Z" }),
		makeEvent({ summary: "Holiday", allDay: true, start: "2026-10-15", end: "2026-10-16" }),
	]);
	assert.deepEqual(titles(bucketByDay(items, ["2026-10-15"], "UTC")[0]), ["Holiday", "Morning", "Afternoon"]);
});

test("a zero length event shows on its start day only", () => {
	const items = wrap([makeEvent({ summary: "Ping", start: "2026-10-15T00:00:00.000Z", end: "2026-10-15T00:00:00.000Z" })]);
	assert.deepEqual(bucketByDay(items, dayRange("2026-10-14", 3), "UTC").map(titles), [[], ["Ping"], []]);
});

test("a day that changes length at a daylight saving change still buckets by local date", () => {
	// New York clocks go back on 2026-11-01, so that local day has 25 hours.
	const items = wrap([
		makeEvent({ summary: "Early", start: "2026-11-01T04:30:00.000Z", end: "2026-11-01T05:00:00.000Z" }),
		makeEvent({ summary: "Last hour", start: "2026-11-02T04:30:00.000Z", end: "2026-11-02T04:45:00.000Z" }),
	]);
	assert.deepEqual(bucketByDay(items, dayRange("2026-11-01", 2), "America/New_York").map(titles), [["Early", "Last hour"], []]);
});

test("synthetic feed events bucket across midnight and all-day dates", async () => {
	const ics = await readFile(new URL("../fixtures/synthetic/calendar-days.ics", import.meta.url), "utf8");
	const items = parseIcs(ics, window).map((event) => ({ event }));
	const days = bucketByDay(items, dayRange("2026-10-14", 3), "UTC");
	assert.deepEqual(days.map(titles), [
		["Synthetic late call"],
		["Synthetic two day offsite", "Synthetic late call", "Synthetic evening block", "Synthetic overnight run"],
		["Synthetic two day offsite", "Synthetic overnight run"],
	]);
});
