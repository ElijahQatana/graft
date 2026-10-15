import { test } from "node:test";
import { strict as assert } from "node:assert";
import { MAX_RANGE_DAYS, rangeDays, rangeProblem } from "../../src/sync/range.ts";

test("a range counts the days back, today and the days ahead", () => {
	assert.equal(rangeDays({ daysBack: 0, daysAhead: 0 }), 1);
	assert.equal(rangeDays({ daysBack: 7, daysAhead: 30 }), 38);
});

test("a one-off range is capped at 30 days in total", () => {
	assert.equal(MAX_RANGE_DAYS, 30);
	assert.equal(rangeProblem({ daysBack: 0, daysAhead: 29 }), undefined);
	assert.equal(rangeProblem({ daysBack: 14, daysAhead: 15 }), undefined);
	assert.match(rangeProblem({ daysBack: 0, daysAhead: 30 })!, /at most 30 days/);
	assert.match(rangeProblem({ daysBack: 7, daysAhead: 30 })!, /at most 30 days/);
});

test("a range needs whole numbers of days, 0 or more", () => {
	for (const range of [{ daysBack: -1, daysAhead: 5 }, { daysBack: 1.5, daysAhead: 5 }, { daysBack: NaN, daysAhead: 5 }, { daysBack: 0, daysAhead: Infinity }]) {
		assert.match(rangeProblem(range)!, /whole numbers/);
	}
});
