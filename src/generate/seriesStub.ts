import type { CalendarEvent } from "../types.ts";
import { sanitizeFilename } from "../util/filename.ts";

export interface SeriesStub {
	filename: string;
	frontmatter: {
		series_title: string;
		google_recurring_event_id: string;
	};
}

/**
 * Builds a minimal stub for a recurring series with no matching
 * Series note. Only series_title and the join key are filled in;
 * cadence, day_of_week, default_time_start/end, organizer, and
 * companies stay blank. Deriving those reliably from an arbitrary
 * RRULE is a judgment call, not a direct field copy, so it's left
 * for a human, the same line the vault schema already draws for
 * Person stub enrichment.
 */
export function buildSeriesStub(event: CalendarEvent): SeriesStub {
	return {
		filename: sanitizeFilename(event.summary || event.uid),
		frontmatter: {
			series_title: event.summary,
			google_recurring_event_id: event.uid,
		},
	};
}
