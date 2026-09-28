import { test } from "node:test";
import { strict as assert } from "node:assert";
import { toWallClock, wallClockFromDate } from "../../src/util/timezone.ts";

test("converts a UTC instant to the target zone's wall-clock time", () => {
	const wc = toWallClock("2026-09-16T14:00:00.000Z", "America/New_York");
	assert.equal(wc.date, "2026-09-16");
	assert.equal(wc.time, "10:00");
	assert.equal(wc.weekday, "Wednesday");
});

test("files a late-UTC event under the earlier ET calendar date, per the vault's own convention", () => {
	// 2026-09-17T01:30 UTC is still Tuesday evening in New York.
	const wc = toWallClock("2026-09-17T01:30:00.000Z", "America/New_York");
	assert.equal(wc.date, "2026-09-16");
	assert.equal(wc.time, "21:30");
});

test("a different target zone produces a different wall-clock time from the same instant", () => {
	const et = toWallClock("2026-09-16T14:00:00.000Z", "America/New_York");
	const pt = toWallClock("2026-09-16T14:00:00.000Z", "America/Los_Angeles");
	assert.notEqual(et.time, pt.time);
});

test("an all-day date needs no zone conversion", () => {
	const wc = wallClockFromDate("2026-09-10");
	assert.equal(wc.date, "2026-09-10");
	assert.equal(wc.time, "00:00");
	assert.equal(wc.weekday, "Thursday");
});
