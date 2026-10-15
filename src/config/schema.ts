import { renderTemplate } from "../templates/engine.ts";

/** Extra Meeting frontmatter written on create, and on every sync when updateOnSync is set. */
export interface ExtraField {
	key: string;
	/** Text or a list. Placeholders such as {{week}} and {{companies}} are filled in. */
	value: string | string[];
	updateOnSync: boolean;
}

export type MeetingFieldKey =
	| "title" | "date" | "scheduledStart" | "scheduledEnd" | "organizer" | "invited" | "series"
	| "invitedAs" | "inviteUpdated" | "uid" | "recurrenceId" | "occurrenceStatus";
export type PersonFieldKey = "email" | "emailAliases" | "company" | "fullName" | "firstName" | "lastName";
export type SeriesFieldKey = "uid" | "title";

/** Frontmatter names, note types and headings that Graft reads and writes. */
export interface NoteSchema {
	/** Frontmatter property that holds the note type. */
	typeField: string;
	types: { meeting: string; person: string; series: string; company: string };
	meeting: Record<MeetingFieldKey, string>;
	person: Record<PersonFieldKey, string>;
	series: Record<SeriesFieldKey, string>;
	company: { domain: string };
	headings: { inviteAgenda: string; seriesAgenda: string; standingAgenda: string };
	/** Values written to the occurrence status property. Updates write `cancelled` only for an explicit cancellation. */
	statusValues: { scheduled: string; cancelled: string };
	/** Values for {{recurrence}}: `series` when the Meeting belongs to a Series note, `oneOff` otherwise. */
	recurrenceValues: { series: string; oneOff: string };
	/** Built-in Meeting body. Placeholders: {{series_section}} and {{invite_section}}. */
	meetingBody: string;
	meetingExtras: ExtraField[];
}

/** Meeting fields that may be left blank to skip writing them. */
export const OPTIONAL_MEETING_FIELDS: MeetingFieldKey[] = ["inviteUpdated", "occurrenceStatus"];

export const MINIMAL_SCHEMA: NoteSchema = {
	typeField: "type",
	types: { meeting: "Meeting", person: "Person", series: "Series", company: "Company" },
	meeting: {
		title: "title", date: "date", scheduledStart: "scheduled_start", scheduledEnd: "scheduled_end",
		organizer: "organizer", invited: "invited", series: "series", invitedAs: "invited_as",
		inviteUpdated: "invite_updated", uid: "ics_uid", recurrenceId: "ics_recurrence_id",
		occurrenceStatus: "occurrence_status",
	},
	person: {
		email: "email", emailAliases: "email_aliases", company: "company",
		fullName: "full_name", firstName: "first_name", lastName: "last_name",
	},
	series: { uid: "ics_uid", title: "series_title" },
	company: { domain: "domain" },
	headings: { inviteAgenda: "## Invite Agenda", seriesAgenda: "## Series Agenda", standingAgenda: "## Standing Agenda" },
	statusValues: { scheduled: "Scheduled", cancelled: "Cancelled" },
	recurrenceValues: { series: "RegularSync", oneOff: "OneOff" },
	meetingBody: "# Agenda\n{{series_section}}{{invite_section}}\n\n\n# Notes\n",
	meetingExtras: [],
};

/** The schema used before the schema settings existed. Saved settings without a schema load as this. */
export const ORIGINAL_SCHEMA: NoteSchema = {
	...MINIMAL_SCHEMA,
	series: { uid: "google_recurring_event_id", title: "series_title" },
	meetingBody: "# Agenda\n{{series_section}}{{invite_section}}\n\n\n# Context\n## Pre Reads\n\n\n## Pre Notes\n\n\n## Attachments\n\n\n# Human Notes (yay)\n",
	meetingExtras: [
		{ key: "subtype", value: "{{recurrence}}", updateOnSync: false },
		{ key: "status", value: "Open", updateOnSync: false },
		{ key: "week", value: "{{week}}", updateOnSync: false },
		{ key: "month", value: "{{month}}", updateOnSync: false },
		{ key: "year", value: "{{year}}", updateOnSync: false },
		{ key: "weekday", value: "{{weekday}}", updateOnSync: false },
		{ key: "channel", value: "", updateOnSync: false },
		{ key: "participants", value: [], updateOnSync: false },
		{ key: "actual_start", value: "", updateOnSync: false },
		{ key: "actual_end", value: "", updateOnSync: false },
		{ key: "output_notes", value: "", updateOnSync: false },
		{ key: "companies", value: "{{companies}}", updateOnSync: true },
		{ key: "projects", value: "", updateOnSync: false },
		{ key: "transcript", value: "", updateOnSync: false },
		{ key: "ai_notes", value: "", updateOnSync: false },
		{ key: "Tags", value: ["Meeting"], updateOnSync: false },
	],
};

export function cloneSchema(schema: NoteSchema): NoteSchema {
	return structuredClone(schema);
}

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function isFieldName(value: unknown): value is string {
	return typeof value === "string" && value.length > 0 && value.length <= 100 && value === value.trim()
		&& !/[\x00-\x1f:]/.test(value) && !UNSAFE_KEYS.has(value);
}

export function isTypeValue(value: unknown): value is string {
	return typeof value === "string" && value.length > 0 && value === value.trim() && !/[\x00-\x1f]/.test(value);
}

export function isHeading(value: unknown): value is string {
	return typeof value === "string" && /^#{1,6} \S[^\r\n]*$/.test(value) && value === value.trim();
}

export function isExtraField(value: unknown): value is ExtraField {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
	const field = value as Record<string, unknown>;
	return isFieldName(field.key) && typeof field.updateOnSync === "boolean"
		&& (typeof field.value === "string" || (Array.isArray(field.value) && field.value.every((item) => typeof item === "string")));
}

/** Property names a note type uses, including its type property. Duplicates would overwrite each other. */
function usedNames(schema: NoteSchema) {
	const meeting = Object.values(schema.meeting).filter(Boolean);
	return {
		meeting: [schema.typeField, ...meeting, ...schema.meetingExtras.map((field) => field.key)],
		person: [schema.typeField, ...Object.values(schema.person)],
		series: [schema.typeField, ...Object.values(schema.series)],
		company: [schema.typeField, schema.company.domain],
	};
}

/** Describes a property name used twice within one note type, or undefined when the schema is consistent. */
export function schemaConflict(schema: NoteSchema): string | undefined {
	for (const [kind, names] of Object.entries(usedNames(schema))) {
		if (new Set(names).size !== names.length) return `Two ${kind} properties share a name.`;
	}
	if (schema.statusValues.scheduled === schema.statusValues.cancelled) return "The scheduled and cancelled status values must differ.";
	if (schema.recurrenceValues.series === schema.recurrenceValues.oneOff) return "The series and one-off recurrence values must differ.";
	return undefined;
}

function record(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** The original schema used to refresh a blank `channel` on every sync, wiping hand-entered values.
 * Copies of it saved before the fix still carry that setting, so it is switched off on load. */
function isStaleChannelReset(field: ExtraField): boolean {
	return field.key === "channel" && field.value === "";
}

/** Restores valid saved schema values and falls back to `base` for the rest. */
export function loadSchema(saved: unknown, base: NoteSchema): NoteSchema {
	const result = cloneSchema(base);
	const input = record(saved);
	if (isFieldName(input.typeField)) result.typeField = input.typeField;
	const types = record(input.types);
	for (const key of Object.keys(result.types) as Array<keyof NoteSchema["types"]>) {
		if (isTypeValue(types[key])) result.types[key] = types[key];
	}
	const groups = [
		["meeting", result.meeting], ["person", result.person], ["series", result.series], ["company", result.company],
	] as const;
	for (const [name, target] of groups) {
		const source = record(input[name]);
		for (const key of Object.keys(target)) {
			const value = source[key];
			const optional = name === "meeting" && OPTIONAL_MEETING_FIELDS.includes(key as MeetingFieldKey);
			if (isFieldName(value) || (optional && value === "")) (target as Record<string, string>)[key] = value as string;
		}
	}
	const headings = record(input.headings);
	for (const key of Object.keys(result.headings) as Array<keyof NoteSchema["headings"]>) {
		if (isHeading(headings[key])) result.headings[key] = headings[key];
	}
	for (const [name, target] of [["statusValues", result.statusValues], ["recurrenceValues", result.recurrenceValues]] as const) {
		const source = record(input[name]);
		for (const key of Object.keys(target)) {
			if (isTypeValue(source[key])) (target as Record<string, string>)[key] = source[key];
		}
	}
	if (typeof input.meetingBody === "string" && input.meetingBody.trim()) result.meetingBody = input.meetingBody;
	if (Array.isArray(input.meetingExtras) && input.meetingExtras.every(isExtraField)) {
		result.meetingExtras = input.meetingExtras.map((field) => ({ key: field.key, value: Array.isArray(field.value) ? [...field.value] : field.value, updateOnSync: field.updateOnSync && !isStaleChannelReset(field) }));
	}
	return schemaConflict(result) ? cloneSchema(base) : result;
}

/** Values available to extra-field placeholders. */
export interface ExtraContext {
	title: string;
	date: string;
	week: string;
	month: string;
	year: string;
	weekday: string;
	/** The schema's series value when the Meeting belongs to a Series note, its one-off value otherwise. */
	recurrence: string;
	companies: string[];
}

/** Fills in extra-field placeholders. A value that is exactly {{companies}} becomes a list. */
export function evaluateExtras(extras: ExtraField[], context: ExtraContext, updating = false): Record<string, unknown> {
	const text: Record<string, string> = { ...context, companies: context.companies.join(", ") };
	const fill = (value: string) => value.trim() === "{{companies}}" ? context.companies : renderTemplate(value, text);
	const result: Record<string, unknown> = {};
	for (const field of extras) {
		if (updating && !field.updateOnSync) continue;
		result[field.key] = Array.isArray(field.value) ? field.value.flatMap((item) => fill(item)) : fill(field.value);
	}
	return result;
}
