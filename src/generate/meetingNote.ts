import type { CalendarEvent } from "../types.ts";
import { toWallClock, wallClockFromDate } from "../util/timezone.ts";
import { sanitizeFilename } from "../util/filename.ts";
import { renderTemplate } from "../templates/engine.ts";

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
	/** Absent means subtype: OneOff. */
	series?: { filename: string };
	invitedAs: string;
	/** Timezone used for Meeting dates and times. */
	timezone: string;
	/** Content from the Series note's Standing Agenda, if present. */
	seriesStandingAgenda?: string;
}

export interface MeetingNote {
	filename: string;
	frontmatter: Record<string, unknown>;
	body: string;
}

/** Builds frontmatter and body content. The caller serializes the frontmatter. */
export function buildMeetingNote(
	input: MeetingNoteInput,
	filenamePattern: string = DEFAULT_FILENAME_PATTERN,
): MeetingNote {
	const start = wallClockFor(input.event.start, input.event.allDay, input.timezone);
	const end = wallClockFor(input.event.end, input.event.allDay, input.timezone);

	const companies = dedupe([
		...(input.organizer?.companyLinks ?? []),
		...input.invited.flatMap((person) => person.companyLinks),
	]);

	const frontmatter = {
		type: "Meeting",
		subtype: input.series ? "RegularSync" : "OneOff",
		status: "Open",
		occurrence_status: input.event.status === "CANCELLED" ? "Cancelled" : "Scheduled",
		date: start.date,
		week: start.week,
		month: start.month,
		year: start.year,
		weekday: start.weekday,
		title: input.event.summary,
		channel: "",
		organizer: input.organizer ? `[[${input.organizer.filename}]]` : "",
		invited: input.invited.map((person) => `[[${person.filename}]]`),
		participants: [],
		invited_as: input.invitedAs,
		series: input.series ? `[[${input.series.filename}]]` : "",
		scheduled_start: start.time,
		scheduled_end: end.time,
		actual_start: "",
		actual_end: "",
		invite_updated: input.event.lastModified ?? "",
		output_notes: "",
		companies,
		projects: "",
		transcript: "",
		ai_notes: "",
		ics_uid: input.event.uid,
		ics_recurrence_id: input.event.recurrenceId ?? "",
		Tags: ["Meeting"],
	};

	const body = buildBody(input.event.description, input.seriesStandingAgenda);

	const filename = sanitizeFilename(
		renderTemplate(filenamePattern, { title: input.event.summary, date: start.date }),
	);

	return { filename, frontmatter, body };
}

function wallClockFor(value: string, allDay: boolean, timezone: string) {
	return allDay ? wallClockFromDate(value) : toWallClock(value, timezone);
}

/** Keep blank lines between the default body sections. */
function buildBody(description: string | undefined, seriesStandingAgenda: string | undefined): string {
	const inviteAgenda = description && description.trim() ? description.trim() : "No agenda provided";

	const lines = ["# Agenda"];
	if (seriesStandingAgenda && seriesStandingAgenda.trim()) {
		lines.push("## Series Agenda", "", seriesStandingAgenda.trim(), "", "");
	}
	lines.push(
		"## Invite Agenda",
		"",
		inviteAgenda,
		"",
		"",
		"# Context",
		"## Pre Reads",
		"",
		"",
		"## Pre Notes",
		"",
		"",
		"## Attachments",
		"",
		"",
		"# Human Notes (yay)",
		"",
	);
	return lines.join("\n");
}

function dedupe(items: string[]): string[] {
	return [...new Set(items)];
}
