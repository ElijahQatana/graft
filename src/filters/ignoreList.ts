import type { CalendarEvent } from "../types.ts";
import type { FilterResult } from "./titleMatch.ts";

export interface IgnoreListEntry {
	uid: string;
	/** null skips the whole event or series. */
	recurrenceId: string | null;
	note?: string;
}

interface IgnoreListFile {
	ignored: IgnoreListEntry[];
}

/** Parses an ignore list. Missing or blank content ignores nothing. */
export function parseIgnoreList(raw: string | null | undefined): IgnoreListEntry[] {
	if (!raw || !raw.trim()) return [];
	const parsed = JSON.parse(raw) as Partial<IgnoreListFile>;
	return parsed.ignored ?? [];
}

/** A UID skips the whole series; UID plus recurrenceId skips one occurrence. */
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
