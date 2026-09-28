import { test } from "node:test";
import { strict as assert } from "node:assert";
import { matchSeries, type SeriesRecord } from "../../src/match/seriesMatch.ts";

const directory: SeriesRecord[] = [
	{ path: "5calendar/1series/Weekly Sync.md", icsUid: "series-1@example.com" },
];

test("matches an event's uid against an existing Series note's join key", () => {
	const match = matchSeries("series-1@example.com", directory);
	assert.equal(match?.path, "5calendar/1series/Weekly Sync.md");
});

test("returns undefined for a uid nothing tracks yet", () => {
	assert.equal(matchSeries("unknown@example.com", directory), undefined);
});
