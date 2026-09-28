import type { CalendarEvent } from "../types.ts";
import type { FilterResult } from "./titleMatch.ts";

export interface IgnoreListEntry {
	uid: string;
	/** null means "ignore the whole event or series," not just one occurrence. */
	recurrenceId: string | null;
	note?: string;
}

interface IgnoreListFile {
	ignored: IgnoreListEntry[];
}

/** Parses the ignore-list JSON file's contents. A missing or blank file means ignore nothing. */
export function parseIgnoreList(raw: string | null | undefined): IgnoreListEntry[] {
	if (!raw || !raw.trim()) return [];
	const parsed = JSON.parse(raw) as Partial<IgnoreListFile>;
	return parsed.ignored ?? [];
}

/**
 * Filters events against the ignore list: a bare-uid entry
 * (recurrenceId: null) skips every occurrence of that uid, a
 * uid+recurrenceId entry skips only that one occurrence, leaving
 * sibling occurrences of the same series untouched.
 */
export function filterByIgnoreList(
	events: CalendarEvent[],
	entries: IgnoreListEntry[],
): FilterResult {
	const kept: CalendarEvent[] = [];
	const skipped: FilterResult["skipped"] = [];

	for (const event of events) {
		const wholeMatch = entries.find((e) => e.uid === event.uid && e.recurrenceId === null);
		if (wholeMatch) {
			skipped.push({ event, reason: describeSkip(wholeMatch) });
			continue;
		}

		const occurrenceMatch = entries.find(
			(e) => e.uid === event.uid && e.recurrenceId === (event.recurrenceId ?? null),
		);
		if (occurrenceMatch) {
			skipped.push({ event, reason: describeSkip(occurrenceMatch) });
			continue;
		}

		kept.push(event);
	}

	return { kept, skipped };
}

function describeSkip(entry: IgnoreListEntry): string {
	const base =
		entry.recurrenceId === null
			? "ignore-listed (whole event/series)"
			: "ignore-listed (single occurrence)";
	return entry.note ? `${base}: ${entry.note}` : base;
}
