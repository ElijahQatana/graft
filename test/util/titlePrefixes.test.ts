import { test } from "node:test";
import { strict as assert } from "node:assert";
import { stripTitlePrefixes } from "../../src/util/titlePrefixes.ts";

const PREFIXES = ["FW:", "Fwd:", "RE:"];

test("removes a forward marker regardless of case", () => {
	assert.equal(stripTitlePrefixes("FW: Weekly sync", PREFIXES), "Weekly sync");
	assert.equal(stripTitlePrefixes("fwd:Weekly sync", PREFIXES), "Weekly sync");
});

test("removes stacked prefixes", () => {
	assert.equal(stripTitlePrefixes("Fwd: RE: FW: Planning", PREFIXES), "Planning");
});

test("leaves markers that are not at the start", () => {
	assert.equal(stripTitlePrefixes("Planning FW: notes", PREFIXES), "Planning FW: notes");
});

test("keeps the title when stripping would empty it", () => {
	assert.equal(stripTitlePrefixes("FW:", PREFIXES), "FW:");
});

test("an empty prefix list changes nothing", () => {
	assert.equal(stripTitlePrefixes("FW: Weekly sync", []), "FW: Weekly sync");
	assert.equal(stripTitlePrefixes("FW: Weekly sync", ["  "]), "FW: Weekly sync");
});
