import type { CalendarEvent } from "../types.ts";
import type { ResolvedAttendee } from "./meetingNote.ts";
import { toWallClock, wallClockFromDate } from "../util/timezone.ts";
import { validateCompanyLinks, type CompanyRecord } from "../match/companyMatch.ts";

export interface MeetingUpdateInput {
	event: CalendarEvent;
	organizer?: ResolvedAttendee;
	invited: ResolvedAttendee[];
	series?: { filename: string };
	invitedAs: string;
	timezone: string;
}

/** Fields owned by calendar sync. Date fields and filenames stay unchanged on reschedule.
 * occurrence_status changes only for an explicit cancellation. */
export function buildMeetingFrontmatterUpdate(
	input: MeetingUpdateInput,
	companies: CompanyRecord[],
): Record<string, unknown> {
	const start = input.event.allDay
		? wallClockFromDate(input.event.start)
		: toWallClock(input.event.start, input.timezone);
	const end = input.event.allDay
		? wallClockFromDate(input.event.end)
		: toWallClock(input.event.end, input.timezone);

	const rawCompanies = dedupe([
		...(input.organizer?.companyLinks ?? []),
		...input.invited.flatMap((person) => person.companyLinks),
	]);

	const update: Record<string, unknown> = {
		title: input.event.summary,
		channel: "",
		organizer: input.organizer ? `[[${input.organizer.filename}]]` : "",
		invited: input.invited.map((person) => `[[${person.filename}]]`),
		invited_as: input.invitedAs,
		series: input.series ? `[[${input.series.filename}]]` : "",
		scheduled_start: start.time,
		scheduled_end: end.time,
		invite_updated: input.event.lastModified ?? "",
		companies: validateCompanyLinks(rawCompanies, companies),
		ics_uid: input.event.uid,
		ics_recurrence_id: input.event.recurrenceId ?? "",
	};

	if (input.event.status === "CANCELLED") {
		update.occurrence_status = "Cancelled";
	}

	return update;
}

function dedupe(items: string[]): string[] {
	return [...new Set(items)];
}
