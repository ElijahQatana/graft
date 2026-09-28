/** The minimal shape read from a Meeting note's frontmatter to find its match. */
export interface MeetingRecord {
	path: string;
	icsUid?: string;
	icsRecurrenceId?: string;
}

/**
 * Finds the existing Meeting note for a CalendarEvent by its
 * compound UID + RECURRENCE-ID key. A one-off event and the
 * unmodified occurrences of a series both have no recurrenceId,
 * normalized to "" here so undefined and "" match each other.
 */
export function matchMeeting(
	uid: string,
	recurrenceId: string | undefined,
	directory: MeetingRecord[],
): MeetingRecord | undefined {
	const target = recurrenceId ?? "";
	return directory.find((meeting) => meeting.icsUid === uid && (meeting.icsRecurrenceId ?? "") === target);
}
