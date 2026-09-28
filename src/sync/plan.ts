import type { CalendarEvent, SyncWindow } from "../types.ts";
import { parseIcs } from "../ics/parse.ts";
import { filterByTitle, type TitleMatchRule } from "../filters/titleMatch.ts";
import { filterByIgnoreList, type IgnoreListEntry } from "../filters/ignoreList.ts";

export interface FeedConfig {
	/** A short label ("Google", "Outlook") used in skip reasons, errors, and later invited_as lookups. */
	name: string;
	url: string;
}

export interface SyncPlan {
	toProcess: CalendarEvent[];
	skipped: Array<{ event: CalendarEvent; reason: string }>;
	errors: Array<{ feed: string; message: string }>;
}

/**
 * Fetches a single feed's raw ICS text. Injected rather than imported
 * directly, so this module never has a hard dependency on Obsidian's
 * requestUrl and stays runnable outside a real Obsidian instance, in
 * plain Node, for testing.
 */
export type FeedFetcher = (url: string) => Promise<string>;

/**
 * Combines fetch, parse, and both filters into one function: settings
 * in, a SyncPlan out. "Pure" here means no vault reads or writes, not
 * that it has zero side effects, it does fetch over the network. This
 * is the exact function both the dry-run preview and the real apply
 * step call, so what you see previewed is what actually happens.
 *
 * A single feed failing to fetch or parse doesn't fail the whole
 * plan, it's recorded in `errors` and the other feed still proceeds.
 */
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
