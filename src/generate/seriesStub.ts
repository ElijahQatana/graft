import type { CalendarEvent } from "../types.ts";
import { sanitizeFilename } from "../util/filename.ts";

export interface SeriesStub {
	filename: string;
	frontmatter: {
		type: "Series";
		series_title: string;
		google_recurring_event_id: string;
	};
}

/** Builds a Series stub with its title and UID. Other fields stay blank. */
export function buildSeriesStub(event: CalendarEvent): SeriesStub {
	return {
		filename: sanitizeFilename(event.summary || event.uid),
		frontmatter: {
			type: "Series",
			series_title: event.summary,
			google_recurring_event_id: event.uid,
		},
	};
}
