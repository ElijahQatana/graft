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

/**
 * The exact set of fields the plugin ever touches on an existing
 * Meeting note, and nothing else. Deliberately does NOT include
 * date/week/month/year/weekday: refiling a note across a calendar
 * day would mean renaming or moving it, which is a bigger, riskier
 * change than a plain field update and isn't done here. A reschedule
 * that crosses a day updates scheduled_start/scheduled_end correctly
 * but leaves the note under its original date; flagged as a known
 * limitation, not a silent gap.
 *
 * occurrence_status only ever flips to Cancelled on an explicit
 * STATUS:CANCELLED. It's never set to Occurred (ICS has no
 * attendance data) or Rescheduled (that status doesn't exist in the
 * schema, a reschedule just updates the time fields directly).
 */
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
