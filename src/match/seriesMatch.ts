/**
 * The minimal shape read from a Series note's frontmatter via
 * Obsidian's metadataCache. The vault schema doesn't have a
 * dedicated ICS UID field on Series yet, it reuses the existing
 * google_recurring_event_id field for the same purpose (same idea:
 * a stable id for "this recurring pattern"), see design-decisions.md.
 */
export interface SeriesRecord {
	path: string;
	icsUid?: string;
}

/** Resolves a recurring event's UID to its existing Series note, if one is already tracking it. */
export function matchSeries(uid: string, directory: SeriesRecord[]): SeriesRecord | undefined {
	return directory.find((series) => series.icsUid === uid);
}
