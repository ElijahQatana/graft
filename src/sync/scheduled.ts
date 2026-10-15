import type { SyncPreview } from "../preview/plan.ts";

/** How many notes a preview would create or change. Unchanged notes do not count. */
export function countPlannedChanges(preview: SyncPreview): number {
	return preview.newMeetings.length + preview.updates.filter((update) => update.changes.length > 0).length
		+ preview.personStubs.length + preview.seriesStubs.length;
}

/** A short stable string for what a preview would do, so a repeat check can tell nothing new has come up.
 * Only paths and changed fields are used, never feed details. */
export function planFingerprint(preview: SyncPreview): string {
	const plan = JSON.stringify([
		preview.newMeetings.map((note) => note.path),
		preview.updates.filter((update) => update.changes.length > 0).map((update) => [update.path, update.changes.map((change) => [change.field, change.after])]),
		preview.personStubs.map((stub) => stub.path),
		preview.seriesStubs.map((stub) => stub.path),
	]);
	let hash = 5381;
	for (let i = 0; i < plan.length; i++) hash = ((hash << 5) + hash + plan.charCodeAt(i)) | 0;
	return `${plan.length}:${(hash >>> 0).toString(36)}`;
}

/** Consecutive failed checks after which Graft stops notifying and shows that the last check failed. */
export const FAILURES_BEFORE_WARNING = 3;
