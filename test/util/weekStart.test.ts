import { test } from "node:test";
import { strict as assert } from "node:assert";
import { intlFirstDay, isWeekStartSetting, resolveWeekStart } from "../../src/util/weekStart.ts";

test("a chosen day is used as it is", () => {
	for (const day of [0, 1, 2, 3, 4, 5, 6] as const) assert.equal(resolveWeekStart(day, 1), day);
});

test("automatic uses the first day the app reports", () => {
	assert.equal(resolveWeekStart("auto", 0), 0);
	assert.equal(resolveWeekStart("auto", 1), 1);
	assert.equal(resolveWeekStart("auto", 6), 6);
});

test("automatic falls back to the system locale, then Sunday, when the app gives no usable day", () => {
	const fallback = intlFirstDay() ?? 0;
	for (const reported of [undefined, 7, -1, 1.5]) assert.equal(resolveWeekStart("auto", reported), fallback);
});

test("Intl reports the first day of a locale as 0 for Sunday through 6 for Saturday", () => {
	const us = intlFirstDay("en-US");
	const gb = intlFirstDay("en-GB");
	// Older runtimes have no week data, and then there is nothing to compare.
	if (us === undefined || gb === undefined) return;
	assert.equal(us, 0);
	assert.equal(gb, 1);
	assert.equal(intlFirstDay("ar-EG"), 6);
});

test("only auto and the days 0 to 6 are valid settings", () => {
	assert.equal(isWeekStartSetting("auto"), true);
	assert.equal(isWeekStartSetting(0), true);
	assert.equal(isWeekStartSetting(6), true);
	assert.equal(isWeekStartSetting(7), false);
	assert.equal(isWeekStartSetting("2"), false);
});
