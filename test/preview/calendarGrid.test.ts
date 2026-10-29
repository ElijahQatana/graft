import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { parseIcs } from "../../src/ics/parse.ts";
import { assignColumns, bucketByDay, dayRange, layoutDay, minuteOnDate, visibleHours } from "../../src/preview/calendar.ts";
import { titleLines, rangeLabel, stepAnchor, visibleDates, zoneLabel } from "../../src/preview/calendarView.ts";
import { makeEvent } from "../helpers.ts";

const zone = "America/New_York";
const window = { start: new Date("2026-10-01T00:00:00Z"), end: new Date("2026-12-01T00:00:00Z") };
const span = (start: number, end: number) => ({ start, end });

async function feedDays(first: string, count: number) {
	const ics = await readFile(new URL("../fixtures/synthetic/calendar-grid.ics", import.meta.url), "utf8");
	const items = parseIcs(ics, window).map((event) => ({ event }));
	return bucketByDay(items, dayRange(first, count), zone);
}
const names = (day: { entries: Array<{ item: { event: { summary: string } } }> }) => day.entries.map((entry) => entry.item.event.summary);

test("events that do not overlap each use the full width", () => {
	assert.deepEqual(assignColumns([span(540, 600), span(600, 660)]), [{ column: 0, columns: 1 }, { column: 0, columns: 1 }]);
	assert.deepEqual(assignColumns([]), []);
});

test("overlapping events sit side by side and a later one reuses a free slot", () => {
	// A 9:00-10:00, B 9:30-10:30, C 10:00-11:00: C starts as A ends, so it takes A's slot.
	assert.deepEqual(assignColumns([span(540, 600), span(570, 630), span(600, 660)]), [
		{ column: 0, columns: 2 }, { column: 1, columns: 2 }, { column: 0, columns: 2 },
	]);
});

test("a group of overlaps keeps one width, and separate groups do not affect each other", () => {
	const slots = assignColumns([span(480, 720), span(500, 520), span(530, 550), span(540, 560), span(800, 860)]);
	assert.deepEqual(slots.map((slot) => slot.columns), [3, 3, 3, 3, 1]);
	assert.deepEqual(slots.map((slot) => slot.column), [0, 1, 1, 2, 0]);
});

test("results follow the input order, whatever the sort", () => {
	const slots = assignColumns([span(600, 660), span(540, 630)]);
	assert.deepEqual(slots, [{ column: 1, columns: 2 }, { column: 0, columns: 2 }]);
});

test("identical times never hide each other", () => {
	const slots = assignColumns([span(540, 600), span(540, 600), span(540, 600)]);
	assert.deepEqual(slots.map((slot) => slot.column).sort(), [0, 1, 2]);
	assert.ok(slots.every((slot) => slot.columns === 3));
});

test("the default hours widen to hold early and late events", () => {
	assert.deepEqual(visibleHours([]), { start: 7, end: 20 });
	assert.deepEqual(visibleHours([{ startMin: 9 * 60, endMin: 10 * 60 }]), { start: 7, end: 20 });
	assert.deepEqual(visibleHours([{ startMin: 5 * 60 + 30, endMin: 6 * 60 }, { startMin: 19 * 60, endMin: 21 * 60 + 15 }]), { start: 5, end: 22 });
});

test("a block continuing across midnight fills its edge of the day, and short events get a minimum height", () => {
	const items = [
		makeEvent({ summary: "Overnight", start: "2026-10-15T22:00:00.000Z", end: "2026-10-16T02:00:00.000Z" }),
		makeEvent({ summary: "Ping", start: "2026-10-16T09:00:00.000Z", end: "2026-10-16T09:00:00.000Z" }),
	].map((event) => ({ event }));
	const [first, second] = bucketByDay(items, ["2026-10-15", "2026-10-16"], "UTC");
	assert.deepEqual(layoutDay(first.entries).map((block) => [block.startMin, block.endMin]), [[1320, 1440]]);
	assert.deepEqual(layoutDay(second.entries).map((block) => [block.startMin, block.endMin]), [[0, 120], [540, 570]]);
});

test("the current time marker only lands on its own date, in the zone", () => {
	const now = new Date("2026-10-27T13:45:00Z");
	assert.equal(minuteOnDate(now, "2026-10-27", zone), 9 * 60 + 45);
	assert.equal(minuteOnDate(now, "2026-10-28", zone), undefined);
	assert.equal(minuteOnDate(new Date("2026-10-28T02:00:00Z"), "2026-10-27", zone), 22 * 60);
});

test("synthetic overlap fixture lays out three events in two slots", async () => {
	const [day] = await feedDays("2026-10-27", 1);
	const blocks = layoutDay(day.entries);
	assert.deepEqual(blocks.map((block) => [block.entry.item.event.summary, block.startMin, block.endMin, block.column, block.columns]), [
		["Synthetic overlap A", 540, 600, 0, 2],
		["Synthetic overlap B", 570, 630, 1, 2],
		["Synthetic overlap C", 600, 660, 0, 2],
	]);
});

test("all-day and multi-day events go in the row above the grid", async () => {
	const days = await feedDays("2026-10-28", 5);
	const allDay = days.map((day) => day.entries.filter((entry) => entry.allDay).map((entry) => entry.item.event.summary));
	assert.deepEqual(allDay, [["Synthetic all day"], ["Synthetic three day trip"], ["Synthetic three day trip"], ["Synthetic three day trip"], []]);
	assert.ok(days.every((day) => layoutDay(day.entries).every((block) => !block.entry.allDay)));
});

test("times stay on the wall clock across a daylight saving change", async () => {
	// New York clocks go back at 02:00 on 2026-11-01. The event is 01:30 to 03:30 on the clock.
	const [day] = await feedDays("2026-11-01", 1);
	const dst = day.entries.find((entry) => entry.item.event.summary === "Synthetic across the clock change");
	assert.deepEqual([dst?.startTime, dst?.endTime], ["01:30", "03:30"]);
	const [block] = layoutDay(day.entries);
	assert.deepEqual([block.startMin, block.endMin], [90, 210]);
});

test("a recurring event and its moved occurrence each show once on the right day", async () => {
	const days = await feedDays("2026-10-29", 8);
	const weekly = days.map((day) => day.entries.filter((entry) => entry.item.event.summary.startsWith("Synthetic weekly")).map((entry) => [entry.item.event.summary, entry.startTime]));
	assert.deepEqual(weekly, [[["Synthetic weekly", "09:00"]], [], [], [], [], [], [], [["Synthetic weekly moved", "11:00"]]]);
	// The occurrence after the exception is back at 09:00 on the wall clock, though the UTC offset changed.
	const [later] = await feedDays("2026-11-12", 1);
	assert.deepEqual(later.entries.map((entry) => [entry.item.event.summary, entry.startTime, entry.item.event.start]), [["Synthetic weekly", "09:00", "2026-11-12T14:00:00.000Z"]]);
});

test("a one day view shows one date and steps by a day", () => {
	const state = { span: 1 as const, anchor: "2026-10-15", weekStart: 1 as const };
	assert.deepEqual(visibleDates(state), ["2026-10-15"]);
	assert.equal(rangeLabel(visibleDates(state)), "Thu 15 Oct 2026");
	assert.equal(stepAnchor(state, 1), "2026-10-16");
	assert.equal(stepAnchor(state, -1), "2026-10-14");
	assert.equal(stepAnchor({ span: 3, anchor: "2026-10-15", weekStart: 1 }, 1), "2026-10-18");
	assert.equal(stepAnchor({ span: 7, anchor: "2026-10-15", weekStart: 1 }, -1), "2026-10-05");
});

test("the week view runs from the chosen first day and the label shows its true ends", () => {
	const week = (anchor: string, weekStart: 0 | 1 | 6) => visibleDates({ span: 7, anchor, weekStart });
	assert.deepEqual(week("2026-10-22", 0), ["2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"]);
	assert.equal(rangeLabel(week("2026-10-22", 0)), "Sun 18 to Sat 24 Oct 2026");
	assert.equal(rangeLabel(week("2026-10-22", 1)), "Mon 19 to Sun 25 Oct 2026");
	assert.equal(rangeLabel(week("2026-10-22", 6)), "Sat 17 to Fri 23 Oct 2026");
	// Every day of a week gives the same week, so the focused day can sit anywhere in it.
	for (const day of week("2026-10-22", 0)) assert.deepEqual(week(day, 0), week("2026-10-22", 0));
	assert.deepEqual(week("2026-10-25", 0).slice(0, 1), ["2026-10-25"]);
});

test("the day and three day views do not depend on the first day of the week", () => {
	for (const weekStart of [0, 1, 6] as const) {
		assert.deepEqual(visibleDates({ span: 3, anchor: "2026-10-22", weekStart }), ["2026-10-22", "2026-10-23", "2026-10-24"]);
		assert.deepEqual(visibleDates({ span: 1, anchor: "2026-10-22", weekStart }), ["2026-10-22"]);
	}
});

test("the week steps back and forward by exactly seven days from its first day", () => {
	const state = { span: 7 as const, anchor: "2026-10-22", weekStart: 0 as const };
	assert.equal(stepAnchor(state, 1), "2026-10-25");
	assert.equal(stepAnchor(state, -1), "2026-10-11");
	let anchor = "2026-10-22";
	const firsts: string[] = [];
	for (let page = 0; page < 3; page++) { anchor = stepAnchor({ ...state, anchor }, 1); firsts.push(visibleDates({ ...state, anchor })[0]); }
	assert.deepEqual(firsts, ["2026-10-25", "2026-11-01", "2026-11-08"]);
});

test("a week that holds a clock change still has seven days, with the short or long day in place", () => {
	const fall = visibleDates({ span: 7, anchor: "2026-11-03", weekStart: 0 });
	assert.deepEqual([fall[0], fall[6]], ["2026-11-01", "2026-11-07"]);
	assert.equal(new Set(fall).size, 7);
	const spring = visibleDates({ span: 7, anchor: "2026-03-08", weekStart: 0 });
	assert.deepEqual([spring[0], spring[6]], ["2026-03-08", "2026-03-14"]);
	// 04:00Z is midnight on Sunday 1 Nov, and the clock goes back at 06:00Z, so that Sunday has 25 hours.
	const at = (summary: string, start: string, end: string) => ({ event: makeEvent({ summary, start, end }) });
	const items = [
		at("Saturday night", "2026-11-01T03:30:00.000Z", "2026-11-01T03:45:00.000Z"),
		at("Sunday first hour", "2026-11-01T04:30:00.000Z", "2026-11-01T04:45:00.000Z"),
		at("Sunday repeated hour", "2026-11-01T06:30:00.000Z", "2026-11-01T06:45:00.000Z"),
		at("Monday", "2026-11-02T05:30:00.000Z", "2026-11-02T05:45:00.000Z"),
	];
	const days = bucketByDay(items, fall, zone);
	assert.deepEqual(days.map((day) => day.entries.map((entry) => entry.item.event.summary)), [["Sunday first hour", "Sunday repeated hour"], ["Monday"], [], [], [], [], []]);
	assert.deepEqual(days.slice(0, 2).map((day) => day.entries.map((entry) => entry.startTime)), [["00:30", "01:30"], ["00:30"]]);
	assert.deepEqual(bucketByDay(items, ["2026-10-31"], zone)[0].entries.map((entry) => entry.item.event.summary), ["Saturday night"]);
});

test("a block gets as many title lines as its height allows, and at least one", () => {
	assert.equal(titleLines(15), 1);
	assert.equal(titleLines(30), 1);
	assert.equal(titleLines(60), 2);
	assert.equal(titleLines(120), 6);
});

test("the gutter label is a compact UTC offset", () => {
	assert.equal(zoneLabel("America/New_York", new Date("2026-10-22T12:00:00Z")), "UTC-4");
	assert.equal(zoneLabel("Asia/Kolkata", new Date("2026-10-22T12:00:00Z")), "UTC+5:30");
	assert.equal(zoneLabel("Not/AZone"), "Not/AZone");
});
