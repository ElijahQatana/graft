/** Meeting fields used for matching. */
export interface MeetingRecord {
	path: string;
	icsUid?: string;
	icsRecurrenceId?: string;
}

/** Matches UID and recurrenceId, treating a missing recurrenceId as an empty string. */
export function matchMeeting(
	uid: string,
	recurrenceId: string | undefined,
	directory: MeetingRecord[],
): MeetingRecord | undefined {
	const target = recurrenceId ?? "";
	return directory.find((meeting) => meeting.icsUid === uid && (meeting.icsRecurrenceId ?? "") === target);
}
