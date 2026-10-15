import type { CalendarEvent } from "../types.ts";
import type { ResolvedAttendee } from "./meetingNote.ts";
import { toWallClock, wallClockFromDate } from "../util/timezone.ts";
import { validateCompanyLinks, type CompanyRecord } from "../match/companyMatch.ts";
import { extractSection, replaceSection } from "../util/markdownSections.ts";
import { inviteAgendaText } from "../util/inviteText.ts";
import { evaluateExtras, type NoteSchema } from "../config/schema.ts";

/** Avoid rewriting body spacing when the invite text has not changed. */
export function buildMeetingBodyUpdate(body: string, description: string | undefined, heading: string): string {
	const agenda = inviteAgendaText(description);
	return extractSection(body, heading) === agenda ? body : replaceSection(body, heading, agenda);
}

export interface MeetingUpdateInput {
	event: CalendarEvent;
	organizer?: ResolvedAttendee;
	invited: ResolvedAttendee[];
	series?: { filename: string };
	invitedAs: string;
	schema: NoteSchema;
	timezone: string;
}

/** Fields owned by calendar sync. Date fields and filenames stay unchanged on reschedule.
 * occurrence_status changes only for an explicit cancellation. */
export function buildMeetingFrontmatterUpdate(
	input: MeetingUpdateInput,
	companies: CompanyRecord[],
	strictCompanyLinks = true,
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

	const companyLinks = strictCompanyLinks ? validateCompanyLinks(rawCompanies, companies) : rawCompanies;
	const { schema } = input;
	const names = schema.meeting;
	const update: Record<string, unknown> = {};
	const put = (key: string, value: unknown) => { if (key) update[key] = value; };
	put(names.title, input.event.summary);
	put(names.organizer, input.organizer ? `[[${input.organizer.filename}]]` : "");
	put(names.invited, input.invited.map((person) => `[[${person.filename}]]`));
	put(names.invitedAs, input.invitedAs);
	put(names.series, input.series ? `[[${input.series.filename}]]` : "");
	put(names.scheduledStart, start.time);
	put(names.scheduledEnd, end.time);
	put(names.inviteUpdated, input.event.lastModified ?? "");
	put(names.uid, input.event.uid);
	put(names.recurrenceId, input.event.recurrenceId ?? "");
	Object.assign(update, evaluateExtras(schema.meetingExtras, {
		title: input.event.summary, date: start.date, week: start.week, month: start.month, year: start.year,
		weekday: start.weekday, recurrence: input.series ? schema.recurrenceValues.series : schema.recurrenceValues.oneOff, companies: companyLinks,
	}, true));

	if (input.event.status === "CANCELLED") {
		put(names.occurrenceStatus, schema.statusValues.cancelled);
	}

	return update;
}

function dedupe(items: string[]): string[] {
	return [...new Set(items)];
}
