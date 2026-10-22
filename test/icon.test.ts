import { test } from "node:test";
import { strict as assert } from "node:assert";
import { GRAFT_ICON_ID, GRAFT_ICON_SVG } from "../src/icon.ts";

test("the icon is a plain fragment that follows the theme colour", () => {
	assert.match(GRAFT_ICON_SVG, /currentColor/);
	assert.doesNotMatch(GRAFT_ICON_SVG, /<script|<svg|on\w+=|href|#[0-9a-f]{3,8}\b/i);
});

test("every coordinate sits inside the 100 x 100 box", () => {
	const numbers = [...GRAFT_ICON_SVG.matchAll(/d="([^"]+)"/g)].flatMap((match) => match[1].match(/[\d.]+/g) ?? []).map(Number);
	assert.ok(numbers.length > 0);
	for (const value of numbers) assert.ok(value >= 0 && value <= 100, String(value));
});
