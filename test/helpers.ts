import type { CalendarEvent } from "../src/types.ts";

/** Builds a minimal synthetic CalendarEvent for tests, overriding only what a test cares about. */
export function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
	return {
		uid: "event-1@example.com",
		summary: "Untitled event",
		attendees: [],
		start: "2026-09-01T14:00:00.000Z",
		end: "2026-09-01T14:30:00.000Z",
		allDay: false,
		isRecurring: false,
		...overrides,
	};
}
