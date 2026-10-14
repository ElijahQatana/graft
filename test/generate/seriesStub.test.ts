import { test } from "node:test";
import { strict as assert } from "node:assert";
import { buildSeriesStub } from "../../src/generate/seriesStub.ts";
import { ORIGINAL_SCHEMA } from "../../src/config/schema.ts";
import { makeEvent } from "../helpers.ts";

test("uses the event's summary and uid, sanitizing the filename", () => {
	const event = makeEvent({ uid: "series-1@example.com", summary: "Weekly Sync / Planning" });

	const stub = buildSeriesStub(event, ORIGINAL_SCHEMA);

	assert.equal(stub.filename, "Weekly Sync - Planning");
	assert.equal(stub.frontmatter.series_title, "Weekly Sync / Planning");
	assert.equal(stub.frontmatter.google_recurring_event_id, "series-1@example.com");
});

test("falls back to the uid for the filename when the event has no summary", () => {
	const event = makeEvent({ uid: "series-2@example.com", summary: "" });

	const stub = buildSeriesStub(event, ORIGINAL_SCHEMA);

	assert.equal(stub.filename, "series-2@example.com");
});
