import { test } from "node:test";
import { strict as assert } from "node:assert";
import { UserFacingError } from "../../src/sync/userFacingError.ts";

test("a user-facing error is an Error that keeps its message and is told apart by type", () => {
	const error = new UserFacingError("Add a calendar in Graft settings.");
	assert.ok(error instanceof Error);
	assert.ok(error instanceof UserFacingError);
	assert.equal(error.message, "Add a calendar in Graft settings.");
	assert.equal(error.name, "UserFacingError");
	assert.equal(new Error("Add a calendar in Graft settings.") instanceof UserFacingError, false);
});
