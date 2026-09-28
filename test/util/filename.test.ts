import { test } from "node:test";
import { strict as assert } from "node:assert";
import { sanitizeFilename } from "../../src/util/filename.ts";

test("replaces a slash with a hyphen", () => {
	assert.equal(sanitizeFilename("Marketing/Sales sync"), "Marketing-Sales sync");
});

test("replaces a pipe with a hyphen", () => {
	assert.equal(sanitizeFilename("Weekly | Planning"), "Weekly - Planning");
});

test("leaves an ordinary title untouched", () => {
	assert.equal(sanitizeFilename("Weekly Sync"), "Weekly Sync");
});
