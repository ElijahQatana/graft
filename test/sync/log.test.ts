import { test } from "node:test";
import { strict as assert } from "node:assert";
import { appendLogEntry, formatLogEntry, isInsideNoteFolders, isLoggable, logEntryFromPreview, MAX_LOG_ENTRIES, type SyncLogEntry } from "../../src/sync/log.ts";

const entry = (overrides: Partial<SyncLogEntry> = {}): SyncLogEntry => ({
	when: "2026-10-04 09:30", source: "Sync now", created: [], updated: [], personStubs: [], seriesStubs: [], warnings: 0, skipped: 0, ...overrides,
});

test("an entry lists what was created, updated and stubbed as links, with counts", () => {
	const text = formatLogEntry(entry({
		created: ["Meetings/Standup 2026-10-04.md", "Meetings/Review 2026-10-05.md"],
		updated: [{ path: "Meetings/Old 2026-10-03.md", changes: 1 }, { path: "Meetings/Other 2026-10-03.md", changes: 3 }],
		personStubs: ["People/Sam Example.md"], seriesStubs: ["Series/Standup.md"], warnings: 1, skipped: 4,
	}));
	assert.equal(text, [
		"## 2026-10-04 09:30 · Sync now",
		"- Created 2 Meeting notes: [[Meetings/Standup 2026-10-04]], [[Meetings/Review 2026-10-05]]",
		"- Updated 2 Meeting notes: [[Meetings/Old 2026-10-03]] (1 change), [[Meetings/Other 2026-10-03]] (3 changes)",
		"- Created 1 Person stub: [[People/Sam Example]]",
		"- Created 1 Series stub: [[Series/Standup]]",
		"- 1 warning, 4 skipped",
		"",
	].join("\n"));
});

test("an error is recorded, and only runs that wrote something or failed are loggable", () => {
	assert.match(formatLogEntry(entry({ error: "The vault changed. Run Preview sync again." })), /- Stopped: The vault changed/);
	assert.equal(isLoggable(entry()), false);
	assert.equal(isLoggable(entry({ warnings: 3, skipped: 9 })), false);
	assert.equal(isLoggable(entry({ error: "x" })), true);
	assert.equal(isLoggable(entry({ created: ["Meetings/A.md"] })), true);
});

test("an entry built from a preview ignores unchanged notes and carries no feed details", () => {
	const preview: any = {
		newMeetings: [{ path: "Meetings/New.md", note: {} }],
		updates: [{ path: "Meetings/Same.md", changes: [] }, { path: "Meetings/Changed.md", changes: [{ field: "title" }] }],
		personStubs: [], seriesStubs: [{ path: "Series/S.md" }], skipped: [{}, {}], warnings: [{}], errors: [{ feed: "Work", message: "secret-looking text" }],
	};
	const built = logEntryFromPreview(preview, "2026-10-04 09:30", "Apply from preview");
	assert.deepEqual(built.updated, [{ path: "Meetings/Changed.md", changes: 1 }]);
	assert.equal(built.skipped, 2);
	assert.equal(JSON.stringify(built).includes("secret-looking"), false);
});

test("the log is created with a header, appended to, and trimmed from the top", () => {
	const first = appendLogEntry(undefined, entry({ created: ["Meetings/A.md"] }));
	assert.match(first, /^# Graft sync log\n\n## 2026-10-04 09:30 · Sync now\n- Created 1 Meeting note: \[\[Meetings\/A\]\]\n$/);
	const second = appendLogEntry(first, entry({ when: "2026-10-04 10:30", created: ["Meetings/B.md"] }));
	assert.ok(second.indexOf("Meetings/A") < second.indexOf("Meetings/B"));
	let text: string | undefined;
	for (let i = 0; i < MAX_LOG_ENTRIES + 5; i++) text = appendLogEntry(text, entry({ when: `run ${i}`, created: [`Meetings/N${i}.md`] }));
	assert.equal((text!.match(/^## /gm) ?? []).length, MAX_LOG_ENTRIES);
	assert.equal(text!.includes("## run 0 "), false);
	assert.ok(text!.includes(`## run ${MAX_LOG_ENTRIES + 4} `));
	assert.ok(text!.startsWith("# Graft sync log\n"));
});

test("text a user wrote above the entries is kept as the header", () => {
	const text = appendLogEntry("# My log\n\nNotes here.\n\n## old · x\n- Created 1 Meeting note: [[A]]\n", entry({ created: ["Meetings/B.md"] }));
	assert.ok(text.startsWith("# My log\n\nNotes here.\n"));
	assert.ok(text.includes("## old · x"));
	assert.ok(text.includes("[[Meetings/B]]"));
});

test("the log cannot sit inside a note folder", () => {
	const folders = ["Meetings", "People/Work"];
	assert.equal(isInsideNoteFolders("Meetings/log.md", folders), true);
	assert.equal(isInsideNoteFolders("People/Work/a/log.md", folders), true);
	assert.equal(isInsideNoteFolders("People/log.md", folders), false);
	assert.equal(isInsideNoteFolders("MeetingsExtra/log.md", folders), false);
	assert.equal(isInsideNoteFolders("Graft/log.md", folders), false);
});
