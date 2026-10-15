import type { CalendarEvent } from "../types.ts";
import type { FilterResult } from "./titleMatch.ts";

/** PARTSTAT values that mean the user has not accepted. Anything else, including a missing value, is kept. */
const NOT_ACCEPTED: Record<string, string> = {
	DECLINED: "declined",
	TENTATIVE: "tentative",
	"NEEDS-ACTION": "no response yet",
};

/** Skips events where the user's own attendee entry is declined, tentative or unanswered.
 * The entry is found by comparing each attendee email, ignoring case, with the "invited as"
 * identity of the calendar the event came from. An event with no entry for the user, no
 * identity, or no PARTSTAT on the entry is kept. */
export function filterByRsvp(events: CalendarEvent[], invitedAsBySource: Map<string, string>): FilterResult {
	const kept: CalendarEvent[] = [];
	const skipped: FilterResult["skipped"] = [];

	for (const event of events) {
		const identity = (invitedAsBySource.get(event.source ?? "") ?? "").trim().toLowerCase();
		const own = identity ? event.attendees.find((a) => a.email.toLowerCase() === identity) : undefined;
		const label = own?.partstat ? NOT_ACCEPTED[own.partstat] : undefined;
		if (label) skipped.push({ event, reason: `not accepted (${label})` });
		else kept.push(event);
	}

	return { kept, skipped };
}
