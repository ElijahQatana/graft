import type { CalendarEvent } from "../types.ts";
import type { FilterResult } from "./titleMatch.ts";

/** Keeps one copy of a meeting that arrives from several calendars under different UIDs.
 * Copies match when they have the same start, the same end (or all-day dates) and the same
 * title, ignoring case and outer spaces. Timed events are compared as instants.
 * The calendar earliest in `priority` wins; if that does not decide it, the copy with more detail
 * (a description or guests) does. Events from one calendar are never merged with each other,
 * and a meeting seen in only one calendar is left alone. The kept event is returned unchanged. */
export function mergeDuplicates(events: CalendarEvent[], priority: string[]): FilterResult {
	const groups = new Map<string, CalendarEvent[]>();
	for (const event of events) {
		const key = matchKey(event);
		const group = groups.get(key);
		if (group) group.push(event);
		else groups.set(key, [event]);
	}

	const dropped = new Map<CalendarEvent, CalendarEvent>();
	for (const group of groups.values()) {
		if (new Set(group.map((event) => event.source)).size < 2) continue;
		const best = group.reduce((a, b) => (outranks(b, a, priority) ? b : a));
		for (const event of group) {
			if (event.source !== best.source) dropped.set(event, best);
		}
	}

	const kept: CalendarEvent[] = [];
	const skipped: FilterResult["skipped"] = [];
	for (const event of events) {
		const winner = dropped.get(event);
		if (winner) skipped.push({ event, reason: `Duplicate of ${winner.summary} from ${winner.source ?? "another calendar"}` });
		else kept.push(event);
	}
	return { kept, skipped };
}

function matchKey(event: CalendarEvent): string {
	const when = event.allDay
		? ["day", event.start, event.end]
		: ["time", Date.parse(event.start), Date.parse(event.end)];
	return JSON.stringify([...when, event.summary.trim().toLowerCase()]);
}

function rank(event: CalendarEvent, priority: string[]): number {
	const index = priority.indexOf(event.source ?? "");
	return index === -1 ? priority.length : index;
}

function detail(event: CalendarEvent): number {
	return (event.description?.trim() ? 1 : 0) + (event.attendees.length > 0 ? 1 : 0);
}

/** True when `a` should be kept in preference to `b`. Ties go to the earlier event. */
function outranks(a: CalendarEvent, b: CalendarEvent, priority: string[]): boolean {
	const byPriority = rank(b, priority) - rank(a, priority);
	if (byPriority !== 0) return byPriority > 0;
	return detail(a) > detail(b);
}
