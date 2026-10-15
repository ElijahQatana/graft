import { test } from "node:test";
import { strict as assert } from "node:assert";
import { pathChoices } from "../../src/util/pathChoices.ts";

const paths = ["Work/Meetings", "Meetings", "Archive/Old meetings", "People", "Work/People"];

test("matches anywhere in the path, ignoring case, and puts prefix matches first", () => {
	assert.deepEqual(pathChoices(paths, "meet"), ["Meetings", "Work/Meetings", "Archive/Old meetings"]);
	assert.deepEqual(pathChoices(paths, "PEOPLE"), ["People", "Work/People"]);
});

test("an empty query lists everything, shortest first, up to the limit", () => {
	assert.deepEqual(pathChoices(paths, "", 2), ["People", "Meetings"]);
	assert.equal(pathChoices(paths, "").length, paths.length);
});

test("no match gives an empty list", () => {
	assert.deepEqual(pathChoices(paths, "zzz"), []);
});
