import { test } from "node:test";
import { strict as assert } from "node:assert";
import { sanitizeFilename } from "../../src/util/filename.ts";

const unsafe: Array<[string, string]> = [
	["backslash", "\\"], ["slash", "/"], ["colon", ":"], ["asterisk", "*"], ["question mark", "?"],
	["double quote", "\""], ["less than", "<"], ["greater than", ">"], ["pipe", "|"],
	["hash", "#"], ["caret", "^"], ["open bracket", "["], ["close bracket", "]"],
];

for (const [label, char] of unsafe) {
	test(`replaces ${label} with a hyphen`, () => {
		assert.equal(sanitizeFilename(`Team${char} Planning`), "Team- Planning");
		assert.equal(sanitizeFilename(`Team${char}Planning`), "Team-Planning");
	});
}

test("replaces a run of unsafe characters with one hyphen", () => {
	assert.equal(sanitizeFilename("What?! [Q3]: *plan*"), "What-! -Q3- -plan-");
});

test("replaces control characters", () => {
	assert.equal(sanitizeFilename("Line\none\ttwo\u0000"), "Line-one-two-");
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
