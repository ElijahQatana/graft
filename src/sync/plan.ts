import type { CalendarEvent, SyncWindow } from "../types.ts";
import { parseIcs } from "../ics/parse.ts";
import { filterByTitle, type TitleMatchRule } from "../filters/titleMatch.ts";
import { filterByIgnoreList, type IgnoreListEntry } from "../filters/ignoreList.ts";

export interface FeedConfig {
	/** Feed name used to associate events and errors with their source. */
	name: string;
	url: string;
}

export interface SyncPlan {
	toProcess: CalendarEvent[];
	skipped: Array<{ event: CalendarEvent; reason: string }>;
	errors: Array<{ feed: string; message: string }>;
}

/** Injected fetcher keeps the plan builder independent of Obsidian. */
export type FeedFetcher = (url: string) => Promise<string>;

/** Fetches, parses, and filters events without reading or writing the vault.
 * Failed feeds are reported separately; other feeds can still produce events. */
export async function buildSyncPlan(
	feeds: FeedConfig[],
	window: SyncWindow,
	titleMatchRules: TitleMatchRule[],
	ignoreListEntries: IgnoreListEntry[],
	fetchFeed: FeedFetcher,
): Promise<SyncPlan> {
	const allEvents: CalendarEvent[] = [];
	const errors: SyncPlan["errors"] = [];

	for (const feed of feeds) {
		try {
			const icsText = await fetchFeed(feed.url);
			const events = parseIcs(icsText, window).map((event) => ({
				...event,
				source: feed.name,
			}));
			allEvents.push(...events);
		} catch (cause) {
			errors.push({ feed: feed.name, message: describeError(cause) });
		}
	}

	const titleFiltered = filterByTitle(allEvents, titleMatchRules);
	const ignoreFiltered = filterByIgnoreList(titleFiltered.kept, ignoreListEntries);

	return {
		toProcess: ignoreFiltered.kept,
		skipped: [...titleFiltered.skipped, ...ignoreFiltered.skipped],
		errors,
	};
}

function describeError(cause: unknown): string {
	return cause instanceof Error ? cause.message : String(cause);
}
