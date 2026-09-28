import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
	filterByIgnoreList,
	parseIgnoreList,
	type IgnoreListEntry,
} from "../../src/filters/ignoreList.ts";
import { makeEvent } from "../helpers.ts";

test("parseIgnoreList treats a missing, null, or blank file as ignore nothing", () => {
	assert.deepEqual(parseIgnoreList(undefined), []);
	assert.deepEqual(parseIgnoreList(null), []);
	assert.deepEqual(parseIgnoreList(""), []);
	assert.deepEqual(parseIgnoreList("   \n"), []);
});

test("parseIgnoreList reads entries from the documented JSON shape", () => {
	const raw = JSON.stringify({
		ignored: [
			{ uid: "abc123", recurrenceId: null, note: "social, declined" },
			{ uid: "def456", recurrenceId: "2026-09-15T19:30:00.000Z" },
		],
	});

	assert.deepEqual(parseIgnoreList(raw), [
		{ uid: "abc123", recurrenceId: null, note: "social, declined" },
		{ uid: "def456", recurrenceId: "2026-09-15T19:30:00.000Z" },
	]);
});

test("a whole-series entry skips every occurrence of that uid", () => {
	const entries: IgnoreListEntry[] = [{ uid: "series-1", recurrenceId: null }];
	const events = [
		makeEvent({ uid: "series-1", recurrenceId: "2026-09-01T14:00:00.000Z", isRecurring: true }),
		makeEvent({ uid: "series-1", recurrenceId: "2026-09-08T14:00:00.000Z", isRecurring: true }),
		makeEvent({ uid: "series-2" }),
	];

	const result = filterByIgnoreList(events, entries);

	assert.deepEqual(
		result.kept.map((e) => e.uid),
		["series-2"],
	);
	assert.equal(result.skipped.length, 2);
});

test("a single-occurrence entry only skips that occurrence, not its siblings", () => {
	const entries: IgnoreListEntry[] = [
		{ uid: "series-1", recurrenceId: "2026-09-08T14:00:00.000Z", note: "traveling that day" },
	];
	const events = [
		makeEvent({ uid: "series-1", recurrenceId: "2026-09-01T14:00:00.000Z", isRecurring: true }),
		makeEvent({ uid: "series-1", recurrenceId: "2026-09-08T14:00:00.000Z", isRecurring: true }),
	];

	const result = filterByIgnoreList(events, entries);

	assert.deepEqual(
		result.kept.map((e) => e.recurrenceId),
		["2026-09-01T14:00:00.000Z"],
	);
	assert.equal(result.skipped.length, 1);
	assert.match(result.skipped[0].reason, /traveling that day/);
});

test("a whole-event entry (recurrenceId: null) also covers a plain one-off event", () => {
	const entries: IgnoreListEntry[] = [{ uid: "oneoff-1", recurrenceId: null }];
	const events = [makeEvent({ uid: "oneoff-1" })];

	const result = filterByIgnoreList(events, entries);

	assert.deepEqual(result.kept, []);
	assert.equal(result.skipped.length, 1);
});

test("an empty ignore list keeps everything", () => {
	const events = [makeEvent()];
	const result = filterByIgnoreList(events, []);
	assert.deepEqual(result.kept, events);
});
