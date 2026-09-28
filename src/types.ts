/** A single calendar attendee or organizer, normalized from ATTENDEE/ORGANIZER. */
export interface Attendee {
	email: string;
	name?: string;
}

/**
 * One dated occurrence of a calendar event, already expanded from any
 * RRULE on its master. Keyed on uid (+ recurrenceId for a single
 * modified instance of a recurring series), the same compound key
 * iCalendar itself uses to represent "this one Tuesday was moved."
 */
export interface CalendarEvent {
	uid: string;
	/** Present only on a modified/exception instance of a recurring series. */
	recurrenceId?: string;
	summary: string;
	organizer?: Attendee;
	attendees: Attendee[];
	/** ISO 8601 UTC for a timed event, or YYYY-MM-DD for an all-day one. */
	start: string;
	end: string;
	allDay: boolean;
	/** ISO 8601 UTC. The invite's own last-modified time, not Graft's. */
	lastModified?: string;
	description?: string;
	status?: "CONFIRMED" | "TENTATIVE" | "CANCELLED";
	/** True if this occurrence came from an RRULE-bearing master. */
	isRecurring: boolean;
	/** Which configured feed this came from ("Google", "Outlook"). Set by the plan builder, not the parser. */
	source?: string;
}

/** How far back and forward from now to expand recurring events and include one-off ones. */
export interface SyncWindow {
	start: Date;
	end: Date;
}
