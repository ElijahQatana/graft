import ICAL from "ical.js";
import type { Attendee, CalendarEvent, SyncWindow } from "../types.ts";

/** Limit recurrence expansion so dense or unbounded rules cannot hang a sync. */
const MAX_ITERATIONS_PER_SERIES = 20000;

/** Expands events within the sync window and applies recurrence exceptions. */
export function parseIcs(icsText: string, window: SyncWindow): CalendarEvent[] {
	const component = new ICAL.Component(ICAL.parse(icsText) as unknown[]);
	const vevents = component.getAllSubcomponents("vevent");

	// Group exceptions with their master so they do not become duplicate events.
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

		// Start at DTSTART: INTERVAL phase and COUNT depend on the true first occurrence.
		const iterator = event.iterator();
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
					// Use the same format as start/end for matching.
					toDateOrIso(details.recurrenceId),
					true,
				),
			);
		}
	}

	return results;
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
	const attendee: Attendee = cn ? { email, name: String(cn) } : { email };
	const partstat = prop.getParameter("partstat");
	if (partstat) attendee.partstat = String(partstat).trim().toUpperCase();
	return attendee;
}

/** Keep all-day dates without applying the local timezone. */
function toDateOrIso(time: ICAL.Time): string {
	if (time.isDate) {
		return `${pad(time.year, 4)}-${pad(time.month)}-${pad(time.day)}`;
	}
	return time.toJSDate().toISOString();
}

function pad(n: number, width = 2): string {
	return String(n).padStart(width, "0");
}
