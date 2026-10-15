import type { CalendarEvent } from "../types.ts";
import { toWallClock, wallClockFromDate } from "../util/timezone.ts";
import { sanitizeFilename } from "../util/filename.ts";
import { renderTemplate } from "../templates/engine.ts";
import { validateCompanyLinks, type CompanyRecord } from "../match/companyMatch.ts";
import { evaluateExtras, type NoteSchema } from "../config/schema.ts";

/** Default filename pattern; callers can supply their own. */
export const DEFAULT_FILENAME_PATTERN = "{{title}} {{date}}";

export interface ResolvedAttendee {
	/** Person filename used for the wikilink. */
	filename: string;
	/** Company links included in the Meeting note. */
	companyLinks: string[];
}

export interface MeetingNoteInput {
	event: CalendarEvent;
	organizer?: ResolvedAttendee;
	invited: ResolvedAttendee[];
	/** Absent means the schema's one-off recurrence value. */
	series?: { filename: string };
	invitedAs: string;
	schema: NoteSchema;
	/** Timezone used for Meeting dates and times. */
	timezone: string;
	/** Content from the Series note's Standing Agenda, if present. */
	seriesStandingAgenda?: string;
	bodyTemplate?: string;
}

export interface MeetingNote {
	filename: string;
	frontmatter: Record<string, unknown>;
	body: string;
}

export interface MeetingNoteOptions {
	companies?: CompanyRecord[];
	/** Drops Company links that do not match a Company note. Needs the companies list. */
	strictCompanyLinks?: boolean;
}

/** Builds frontmatter and body content. The caller serializes the frontmatter. */
export function buildMeetingNote(
	input: MeetingNoteInput,
	filenamePattern: string = DEFAULT_FILENAME_PATTERN,
	options: MeetingNoteOptions = {},
): MeetingNote {
	const { schema } = input;
	const names = schema.meeting;
	const start = wallClockFor(input.event.start, input.event.allDay, input.timezone);
	const end = wallClockFor(input.event.end, input.event.allDay, input.timezone);

	const rawCompanies = dedupe([
		...(input.organizer?.companyLinks ?? []),
		...input.invited.flatMap((person) => person.companyLinks),
	]);
	const companies = options.strictCompanyLinks && options.companies
		? validateCompanyLinks(rawCompanies, options.companies) : rawCompanies;

	const frontmatter: Record<string, unknown> = { [schema.typeField]: schema.types.meeting };
	const put = (key: string, value: unknown) => { if (key) frontmatter[key] = value; };
	put(names.occurrenceStatus, input.event.status === "CANCELLED" ? schema.statusValues.cancelled : schema.statusValues.scheduled);
	put(names.date, start.date);
	put(names.title, input.event.summary);
	put(names.organizer, input.organizer ? `[[${input.organizer.filename}]]` : "");
	put(names.invited, input.invited.map((person) => `[[${person.filename}]]`));
	// A copy for new notes only; meetingUpdate never writes it, so later edits to the list stay.
	put(names.participants, input.invited.map((person) => `[[${person.filename}]]`));
	put(names.invitedAs, input.invitedAs);
	put(names.series, input.series ? `[[${input.series.filename}]]` : "");
	put(names.scheduledStart, start.time);
	put(names.scheduledEnd, end.time);
	put(names.inviteUpdated, input.event.lastModified ?? "");
	put(names.uid, input.event.uid);
	put(names.recurrenceId, input.event.recurrenceId ?? "");
	Object.assign(frontmatter, evaluateExtras(schema.meetingExtras, {
		title: input.event.summary, date: start.date, week: start.week, month: start.month, year: start.year,
		weekday: start.weekday, recurrence: input.series ? schema.recurrenceValues.series : schema.recurrenceValues.oneOff, companies,
	}));

	const inviteAgenda = input.event.description?.trim() || schema.agendaPlaceholder;
	const seriesAgenda = input.seriesStandingAgenda?.trim() || "";
	const body = input.bodyTemplate === undefined ? buildBody(schema, inviteAgenda, seriesAgenda)
		: renderTemplate(input.bodyTemplate, {
			...Object.fromEntries(Object.entries(frontmatter).map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : String(value)])),
			invite_agenda: inviteAgenda,
			series_agenda: seriesAgenda,
		});

	const filename = sanitizeFilename(
		renderTemplate(filenamePattern, { title: input.event.summary, date: start.date }),
	);

	return { filename, frontmatter, body };
}

function wallClockFor(value: string, allDay: boolean, timezone: string) {
	return allDay ? wallClockFromDate(value) : toWallClock(value, timezone);
}

/** Fills the schema's built-in body. The sections keep blank lines around them. */
function buildBody(schema: NoteSchema, inviteAgenda: string, seriesAgenda: string): string {
	const seriesSection = seriesAgenda ? `${schema.headings.seriesAgenda}\n\n${seriesAgenda}\n\n\n` : "";
	const inviteSection = `${schema.headings.inviteAgenda}\n\n${inviteAgenda}`;
	return renderTemplate(schema.meetingBody, { series_section: seriesSection, invite_section: inviteSection });
}

function dedupe(items: string[]): string[] {
	return [...new Set(items)];
}
