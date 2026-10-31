import type { CalendarEvent, SyncWindow } from "../types.ts";
import { parseIcs } from "../ics/parse.ts";
import { filterByTitle, type TitleMatchRule } from "../filters/titleMatch.ts";
import { filterByRsvp } from "../filters/rsvp.ts";
import { stripTitlePrefixes } from "../util/titlePrefixes.ts";
import { mergeDuplicates } from "../filters/duplicates.ts";
import { filterByIgnoreList, type IgnoreListEntry } from "../filters/ignoreList.ts";

export interface FeedConfig {
	/** Calendar name used to associate events and errors with their source. */
	name: string;
	url: string;
	/** The calendar's "invited as" identity, used to find the user's own attendee entry. */
	invitedAs?: string;
}

export interface SyncPlan {
	toProcess: CalendarEvent[];
	skipped: Array<{ event: CalendarEvent; reason: string }>;
	errors: Array<{ feed: string; message: string }>;
	/** Titles of recurring series that hit the expansion limit, so their events may be missing. Left out when there are none. */
	truncatedSeries?: string[];
}

/** Injected fetcher keeps the plan builder independent of Obsidian. */
export type FeedFetcher = (url: string) => Promise<string>;

/** Fetches, parses, and filters events without reading or writing the vault.
 * Prefixes in `stripPrefixes` are removed from titles before any rule runs, so title rules,
 * filenames, Series names and the title property all see the cleaned title. Events are still
 * identified by UID, so the title change never creates or renames a note by itself.
 * Failed feeds are reported separately; other feeds can still produce events. */
export async function buildSyncPlan(
	feeds: FeedConfig[],
	window: SyncWindow,
	titleMatchRules: TitleMatchRule[],
	ignoreListEntries: IgnoreListEntry[],
	fetchFeed: FeedFetcher,
	acceptedOnly = false,
	stripPrefixes: string[] = [],
	mergeAcrossCalendars = false,
): Promise<SyncPlan> {
	const allEvents: CalendarEvent[] = [];
	const errors: SyncPlan["errors"] = [];
	const truncatedSeries = new Set<string>();

	// Requests start together. Results are handled in feed order, so events, duplicates and
	// errors come out the same as when the feeds were fetched one by one.
	const fetched = await Promise.allSettled(feeds.map(async (feed) => fetchFeed(feed.url)));
	for (const [index, feed] of feeds.entries()) {
		const result = fetched[index];
		try {
			if (result.status === "rejected") throw result.reason;
			const events = parseIcs(result.value, window, (title) => truncatedSeries.add(stripTitlePrefixes(title, stripPrefixes))).map((event) => ({
				...event,
				summary: stripTitlePrefixes(event.summary, stripPrefixes),
				source: feed.name,
			}));
			allEvents.push(...events);
		} catch {
			errors.push({ feed: feed.name, message: "Calendar feed could not be fetched or parsed." });
		}
	}

	// The same event can sit in more than one calendar. The earlier calendar in the list is
	// used and the other copies are reported as skipped, so each Meeting note has one source.
	const firstSource = new Map<string, string>();
	const events: CalendarEvent[] = [];
	const duplicates: SyncPlan["skipped"] = [];
	for (const event of allEvents) {
		const key = JSON.stringify([event.uid, event.recurrenceId ?? ""]);
		const first = firstSource.get(key);
		if (first === undefined) {
			firstSource.set(key, event.source ?? "");
			events.push(event);
		} else duplicates.push({ event, reason: `Same event as one in ${first}` });
	}

	const titleFiltered = filterByTitle(events, titleMatchRules);
	const ignoreFiltered = filterByIgnoreList(titleFiltered.kept, ignoreListEntries);

	const rsvpFiltered = acceptedOnly
		? filterByRsvp(ignoreFiltered.kept, new Map(feeds.map((feed) => [feed.name, feed.invitedAs ?? ""])))
		: { kept: ignoreFiltered.kept, skipped: [] };

	// Runs last, so Busy blocks, ignored events and declined copies never win over a real one.
	const merged = mergeAcrossCalendars
		? mergeDuplicates(rsvpFiltered.kept, feeds.map((feed) => feed.name))
		: { kept: rsvpFiltered.kept, skipped: [] };

	return {
		toProcess: merged.kept,
		skipped: [...duplicates, ...titleFiltered.skipped, ...ignoreFiltered.skipped, ...rsvpFiltered.skipped, ...merged.skipped],
		errors,
		...(truncatedSeries.size ? { truncatedSeries: [...truncatedSeries] } : {}),
	};
}
