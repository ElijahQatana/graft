import { test } from "node:test";
import { strict as assert } from "node:assert";
import { countPlannedChanges, planFingerprint } from "../../src/sync/scheduled.ts";

const preview = (overrides: any = {}): any => ({
	newMeetings: [], updates: [], personStubs: [], seriesStubs: [], skipped: [], errors: [], warnings: [], ...overrides,
});

test("only notes that would be created or changed are counted", () => {
	assert.equal(countPlannedChanges(preview()), 0);
	assert.equal(countPlannedChanges(preview({ updates: [{ path: "Meetings/Same.md", changes: [] }] })), 0);
	assert.equal(countPlannedChanges(preview({
		newMeetings: [{ path: "Meetings/A.md" }], personStubs: [{ path: "People/P.md" }], seriesStubs: [{ path: "Series/S.md" }],
		updates: [{ path: "Meetings/B.md", changes: [{ field: "title", after: "x" }] }, { path: "Meetings/C.md", changes: [] }],
	})), 4);
});

test("the fingerprint is stable for the same plan and changes when the plan does", () => {
	const base = preview({ newMeetings: [{ path: "Meetings/A.md" }], updates: [{ path: "Meetings/B.md", changes: [{ field: "title", after: "x" }] }] });
	assert.equal(planFingerprint(base), planFingerprint(structuredClone(base)));
	assert.notEqual(planFingerprint(base), planFingerprint(preview({ newMeetings: [{ path: "Meetings/A.md" }, { path: "Meetings/Z.md" }], updates: base.updates })));
	assert.notEqual(planFingerprint(base), planFingerprint(preview({ newMeetings: base.newMeetings, updates: [{ path: "Meetings/B.md", changes: [{ field: "title", after: "y" }] }] })));
	assert.equal(planFingerprint(preview({ updates: [{ path: "Meetings/Same.md", changes: [] }] })), planFingerprint(preview()));
});
