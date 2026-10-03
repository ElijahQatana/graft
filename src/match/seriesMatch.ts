/** Series fields used for matching. google_recurring_event_id currently stores the ICS UID. */
export interface SeriesRecord {
	path: string;
	icsUid?: string;
}

/** Matches a recurring event UID to an existing Series note. */
export function matchSeries(uid: string, directory: SeriesRecord[]): SeriesRecord | undefined {
	return directory.find((series) => series.icsUid === uid);
}
