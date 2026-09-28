import ICAL from "ical.js";
import type { Attendee, CalendarEvent, SyncWindow } from "../types";

/** Defends against a pathological RRULE (e.g. unbounded MINUTELY) hanging the sync. */
const MAX_ITERATIONS_PER_SERIES = 20000;

/**
 * Parses raw ICS text into normalized CalendarEvents, one per dated
 * occurrence within the sync window. Recurring series are expanded
 * from their RRULE; a VEVENT carrying RECURRENCE-ID overrides the
 * matching occurrence instead of appearing as its own event.
 */
export function parseIcs(icsText: string, window: SyncWindow): CalendarEvent[] {
	const component = new ICAL.Component(ICAL.parse(icsText));
	const vevents = component.getAllSubcomponents("vevent");

	// Exceptions (a single moved/retitled occurrence) must be grouped
	// with their series' master before ical.js can apply them; passed
	// loose, they'd otherwise show up as their own duplicate events.
	const exceptionsByUid = new Map<string, ICAL.Component[]>();
	const primaries: ICAL.Component[] = [];
	for (const vevent of vevents) {
		const event = new ICAL.Event(vevent);
		if (event.isRecurrenceException()) {
			const existing = exceptionsByUid.get(event.uid) ?? [];
			existing.push(vevent);
			exceptionsByUid.set(event.uid, existing);
		} else {
			primaries.push(vevent);
		}
	}

	const windowStart = ICAL.Time.fromJSDate(window.start, true);
	const windowEnd = ICAL.Time.fromJSDate(window.end, true);

	const results: CalendarEvent[] = [];
	for (const vevent of primaries) {
		const exceptions = exceptionsByUid.get(new ICAL.Event(vevent).uid) ?? [];
		const event = new ICAL.Event(vevent, { exceptions });

		if (!event.isRecurring()) {
			if (isWithinWindow(event.startDate, windowStart, windowEnd)) {
				results.push(toCalendarEvent(event, event.startDate, event.endDate, undefined, false));
			}
			continue;
		}

		const iterator = event.iterator(seedForWindow(event, windowStart));
		let next: ICAL.Time | null;
		let iterations = 0;
		while ((next = iterator.next())) {
			iterations++;
			if (iterations > MAX_ITERATIONS_PER_SERIES) break;
			if (next.compare(windowEnd) >= 0) break;
			if (next.compare(windowStart) < 0) continue;

			const details = event.getOccurrenceDetails(next);
			results.push(
				toCalendarEvent(
					details.item,
					details.startDate,
					details.endDate,
					// Same conversion as start/end below, not .toString(),
					// so a recurrenceId is directly comparable to a start
					// value elsewhere (ignore-list matching, update keying).
					toDateOrIso(details.recurrenceId),
					true,
				),
			);
		}
	}

	return results;
}

/**
 * ical.js's iterator(seed) doesn't "fast-forward within" the RRULE,
 * it re-derives occurrences using the seed's own time-of-day as if
 * it were a new DTSTART. Passed windowStart directly, a series whose
 * real meeting time is 14:00 would silently come back scheduled at
 * whatever hour windowStart happens to be (00:00, if constructed
 * from a plain Date). Seeding with the event's own hour/minute/second
 * keeps occurrence times correct while still skipping the iterator
 * forward past years of history for an old series. Never seed with
 * a time before the real DTSTART either, ical.js will happily
 * "recur" backwards past it, which iCalendar's semantics forbid.
 */
function seedForWindow(event: ICAL.Event, windowStart: ICAL.Time): ICAL.Time {
	if (event.startDate.compare(windowStart) >= 0) {
		return event.startDate.clone();
	}
	const seed = windowStart.clone();
	seed.hour = event.startDate.hour;
	seed.minute = event.startDate.minute;
	seed.second = event.startDate.second;
	return seed;
}

function isWithinWindow(time: ICAL.Time, windowStart: ICAL.Time, windowEnd: ICAL.Time): boolean {
	return time.compare(windowStart) >= 0 && time.compare(windowEnd) < 0;
}

function toCalendarEvent(
	event: ICAL.Event,
	start: ICAL.Time,
	end: ICAL.Time,
	recurrenceId: string | undefined,
	isRecurring: boolean,
): CalendarEvent {
	const component = event.component;
	const status = component.getFirstPropertyValue("status") as CalendarEvent["status"] | null;
	const lastModifiedProp = component.getFirstPropertyValue("last-modified") as ICAL.Time | null;

	return {
		uid: event.uid,
		recurrenceId,
		summary: event.summary ?? "",
		organizer: toAttendee(component.getFirstProperty("organizer")),
		attendees: component
			.getAllProperties("attendee")
			.map(toAttendee)
			.filter((a): a is Attendee => a !== undefined),
		start: toDateOrIso(start),
		end: toDateOrIso(end),
		allDay: start.isDate,
		lastModified: lastModifiedProp ? lastModifiedProp.toString() : undefined,
		description: event.description ?? undefined,
		status: status ?? undefined,
		isRecurring,
	};
}

function toAttendee(prop: ICAL.Property | null): Attendee | undefined {
	if (!prop) return undefined;
	const raw = String(prop.getFirstValue());
	const email = raw.replace(/^mailto:/i, "").trim();
	if (!email) return undefined;
	const cn = prop.getParameter("cn");
	return cn ? { email, name: String(cn) } : { email };
}

/** All-day dates stay a plain calendar date; toJSDate() would apply this machine's local timezone. */
function toDateOrIso(time: ICAL.Time): string {
	if (time.isDate) {
		return `${pad(time.year, 4)}-${pad(time.month)}-${pad(time.day)}`;
	}
	return time.toJSDate().toISOString();
}

function pad(n: number, width = 2): string {
	return String(n).padStart(width, "0");
}
