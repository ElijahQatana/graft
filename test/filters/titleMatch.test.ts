import { test } from "node:test";
import { strict as assert } from "node:assert";
import { filterByTitle, type TitleMatchRule } from "../../src/filters/titleMatch.ts";
import { makeEvent } from "../helpers.ts";

test("an empty rule list keeps everything", () => {
	const events = [makeEvent({ summary: "Anything" })];
	const result = filterByTitle(events, []);
	assert.deepEqual(result.kept, events);
	assert.deepEqual(result.skipped, []);
});

test("prefix mode skips a title starting with the rule, case-insensitively by default", () => {
	const rules: TitleMatchRule[] = [{ mode: "prefix", value: "synthetic block" }];
	const events = [
		makeEvent({ uid: "a", summary: "Synthetic block Focus block" }),
		makeEvent({ uid: "b", summary: "Real meeting" }),
	];

	const result = filterByTitle(events, rules);

	assert.equal(result.kept.length, 1);
	assert.equal(result.kept[0].uid, "b");
	assert.equal(result.skipped.length, 1);
	assert.equal(result.skipped[0].event.uid, "a");
	assert.match(result.skipped[0].reason, /prefix "synthetic block"/);
});

test("exact mode requires the whole title to match", () => {
	const rules: TitleMatchRule[] = [{ mode: "exact", value: "Focus block" }];
	const events = [
		makeEvent({ uid: "a", summary: "Focus block" }),
		makeEvent({ uid: "b", summary: "Focus block extended" }),
	];

	const result = filterByTitle(events, rules);

	assert.deepEqual(
		result.kept.map((e) => e.uid),
		["b"],
	);
});

test("caseSensitive: true stops the rule from matching a different case", () => {
	const rules: TitleMatchRule[] = [
		{ mode: "prefix", value: "Synthetic block", caseSensitive: true },
	];
	const events = [makeEvent({ summary: "synthetic block block" })];

	const result = filterByTitle(events, rules);

	assert.equal(result.kept.length, 1);
	assert.equal(result.skipped.length, 0);
});

test("the first matching rule wins when several rules could apply", () => {
	const rules: TitleMatchRule[] = [
		{ mode: "contains", value: "sync" },
		{ mode: "exact", value: "Weekly sync" },
	];
	const events = [makeEvent({ summary: "Weekly sync" })];

	const result = filterByTitle(events, rules);

	assert.equal(result.skipped.length, 1);
	assert.match(result.skipped[0].reason, /contains "sync"/);
});
