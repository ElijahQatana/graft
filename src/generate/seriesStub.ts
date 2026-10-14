import type { CalendarEvent } from "../types.ts";
import { sanitizeFilename } from "../util/filename.ts";
import type { NoteSchema } from "../config/schema.ts";

export interface SeriesStub {
	filename: string;
	frontmatter: Record<string, unknown>;
}

/** Builds a Series stub with its title and UID. Other fields stay blank. */
export function buildSeriesStub(event: CalendarEvent, schema: NoteSchema): SeriesStub {
	return {
		filename: sanitizeFilename(event.summary || event.uid),
		frontmatter: {
			[schema.typeField]: schema.types.series,
			[schema.series.title]: event.summary,
			[schema.series.uid]: event.uid,
		},
	};
}
