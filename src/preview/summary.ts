import type { SyncPreview } from "./plan.ts";

/** Picks the singular form for exactly one, the plural otherwise (zero included). */
export function count(n: number, singular: string, plural = `${singular}s`): string {
	return `${n} ${n === 1 ? singular : plural}`;
}

/** One line for the top of the preview, naming only the features that are turned on. */
export function buildSummary({ newMeetings, updates, personStubs, seriesStubs, skipped, features }: SyncPreview): string {
	const parts = [count(newMeetings.length, "new Meeting"), count(updates.length, "existing Meeting")];
	if (features.personStubs) parts.push(count(personStubs.length, "Person stub"));
	if (features.seriesStubs) parts.push(count(seriesStubs.length, "Series stub"));
	// Company links are not a toggleable feature yet. Once they are, add a
	// features flag and a part here, in the same on-means-shown way.
	if (features.skipped) parts.push(`${skipped.length} skipped`);
	return `${parts.join(", ")}.`;
}
