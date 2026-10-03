/** Calendar attendee or organizer. */
export interface Attendee {
	email: string;
	name?: string;
}

/** One dated event occurrence, expanded from its recurrence rule when present. */
export interface CalendarEvent {
	uid: string;
	/** Present on a recurrence exception. */
	recurrenceId?: string;
	summary: string;
	organizer?: Attendee;
	attendees: Attendee[];
	/** UTC ISO string for timed events, or YYYY-MM-DD for all-day events. */
	start: string;
	end: string;
	allDay: boolean;
	/** The invite's last-modified time. */
	lastModified?: string;
	description?: string;
	status?: "CONFIRMED" | "TENTATIVE" | "CANCELLED";
	/** True when expanded from a recurring master. */
	isRecurring: boolean;
	/** Configured feed name, assigned by the plan builder. */
	source?: string;
}

/** Date range used to include events and expand recurring series. */
export interface SyncWindow {
	start: Date;
	end: Date;
}
