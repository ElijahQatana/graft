import { test } from "node:test";
import { strict as assert } from "node:assert";
import { sanitizeFilename } from "../../src/util/filename.ts";

const unsafe: Array<[string, string]> = [
	["backslash", "\\"], ["slash", "/"], ["colon", ":"], ["asterisk", "*"], ["question mark", "?"],
	["double quote", "\""], ["less than", "<"], ["greater than", ">"], ["pipe", "|"],
	["hash", "#"], ["caret", "^"], ["open bracket", "["], ["close bracket", "]"],
];

for (const [label, char] of unsafe) {
	test(`replaces ${label} with a hyphen, or a spaced hyphen next to whitespace`, () => {
		assert.equal(sanitizeFilename(`Team${char}Planning`), "Team-Planning");
		assert.equal(sanitizeFilename(`Team${char} Planning`), "Team - Planning");
		assert.equal(sanitizeFilename(`Team ${char}Planning`), "Team - Planning");
		assert.equal(sanitizeFilename(`Team ${char} Planning`), "Team - Planning");
	});
}

test("reads naturally for common titles", () => {
	assert.equal(sanitizeFilename("Roadmap sync: milestones"), "Roadmap sync - milestones");
	assert.equal(sanitizeFilename("Q3 plan | review"), "Q3 plan - review");
	assert.equal(sanitizeFilename("Casey [QA] Tester"), "Casey - QA - Tester");
	assert.equal(sanitizeFilename("A*B"), "A-B");
});

test("treats unsafe characters separated by spaces as one run", () => {
	assert.equal(sanitizeFilename("What?! [Q3]: *plan* now"), "What-! - Q3 - plan - now");
	assert.equal(sanitizeFilename("Private: dentist? [2026] #1"), "Private - dentist - 2026 - 1");
	assert.equal(sanitizeFilename("a::b"), "a-b");
	assert.equal(sanitizeFilename("a : : b"), "a - b");
});

test("drops unsafe runs at the start or end instead of leaving a hyphen", () => {
	assert.equal(sanitizeFilename("Weekly sync?"), "Weekly sync");
	assert.equal(sanitizeFilename("Weekly sync ?"), "Weekly sync");
	assert.equal(sanitizeFilename("[Q3] plan"), "Q3 - plan");
	assert.equal(sanitizeFilename("#1 priorities"), "1 priorities");
	assert.equal(sanitizeFilename("Sync?.."), "Sync");
	assert.equal(sanitizeFilename("***"), "Untitled");
});

test("replaces control characters", () => {
	assert.equal(sanitizeFilename("Line\none\ttwo\u0000"), "Line-one-two");
});

test("keeps a spaced pipe readable", () => {
	assert.equal(sanitizeFilename("Weekly | Planning"), "Weekly - Planning");
});

test("collapses whitespace and trims leading and trailing dots and spaces", () => {
	assert.equal(sanitizeFilename("  ..Weekly   Sync.. "), "Weekly Sync");
	assert.equal(sanitizeFilename(".."), "Untitled");
});

test("falls back to Untitled for an empty name", () => {
	assert.equal(sanitizeFilename(""), "Untitled");
	assert.equal(sanitizeFilename("   "), "Untitled");
});

test("leaves an ordinary title untouched", () => {
	assert.equal(sanitizeFilename("Weekly Sync"), "Weekly Sync");
	assert.equal(sanitizeFilename("Q3 review (draft) - v2.1"), "Q3 review (draft) - v2.1");
});
