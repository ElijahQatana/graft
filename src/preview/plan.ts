import type { SyncPlan } from "../sync/plan.ts";
import type { CalendarEvent, SyncWindow } from "../types.ts";
import { buildMeetingNote, type MeetingNote, type MeetingNoteInput } from "../generate/meetingNote.ts";
import { buildMeetingFrontmatterUpdate, buildMeetingBodyUpdate } from "../generate/meetingUpdate.ts";
import type { PersonStub } from "../generate/personStub.ts";
import type { SeriesStub } from "../generate/seriesStub.ts";
import { validateCompanyLinks, type CompanyRecord } from "../match/companyMatch.ts";
import { extractSection } from "../util/markdownSections.ts";

export interface FieldChange {
	field: string;
	before: unknown;
	after: unknown;
}

export interface PreviewWarning {
	kind: "unresolved-company" | "ambiguous-person" | "vanished-event" | "missing-invite-heading" | "possible-duplicate-person";
	/** A note path or event title for local display. A possible duplicate names the new stub and the existing note. */
	subject: string;
	/** On a vanished-event warning: the note would be marked cancelled if Cancel vanished events were on. */
	wouldCancel?: boolean;
}

/** Which optional features are on, so the summary lists only those. */
export interface PreviewFeatures {
	personStubs: boolean;
	seriesStubs: boolean;
	/** A title rule or an ignore list is configured. */
	skipped: boolean;
}

/** The sync window the plan was built from, with the settings behind it. `end` is exclusive. */
export interface PreviewWindow extends SyncWindow {
	daysBack: number;
	daysAhead: number;
	timezone: string;
}

export interface PreviewInput {
	plan: SyncPlan;
	window: PreviewWindow;
	/** One resolved input per toProcess event, in the same order. */
	meetings: Array<{
		input: MeetingNoteInput;
		existing?: { path: string; frontmatter: Record<string, unknown>; body: string };
		/** Final filename of a new note, set once name clashes are settled. */
		filename?: string;
	}>;
	personStubs: Array<{ path: string; stub: PersonStub; body?: string }>;
	seriesStubs: Array<{ path: string; stub: SeriesStub; body?: string }>;
	companies: CompanyRecord[];
	meetingFolder: string;
	filenamePattern?: string;
	strictCompanyLinks?: boolean;
	/** Meeting notes to mark cancelled because their occurrence, or the whole series, vanished from the feeds. */
	vanishedCancellations?: Array<{ path: string; field: string; before: unknown; after: string }>;
	/** Matching and feed-coverage warnings supplied by the resolver. */
	warnings: PreviewWarning[];
	features: PreviewFeatures;
}

/** A kept event with what the sync will do to its Meeting note. */
export interface PlannedEvent {
	event: CalendarEvent;
	path: string;
	state: "new" | "changed" | "unchanged";
	changes: FieldChange[];
}

export interface SyncPreview {
	window: PreviewWindow;
	/** Kept events in plan order. */
	events: PlannedEvent[];
	newMeetings: Array<{ path: string; note: MeetingNote }>;
	updates: Array<{ path: string; changes: FieldChange[] }>;
	personStubs: PreviewInput["personStubs"];
	seriesStubs: PreviewInput["seriesStubs"];
	skipped: SyncPlan["skipped"];
	errors: SyncPlan["errors"];
	warnings: PreviewWarning[];
	features: PreviewFeatures;
}

/** Uses the write helpers' values without reading or writing the vault. */
export function buildSyncPreview(source: PreviewInput): SyncPreview {
	if (source.meetings.length !== source.plan.toProcess.length
		|| source.meetings.some(({ input }, index) => input.event !== source.plan.toProcess[index])) {
		throw new Error("Preview needs a resolved input for each planned event.");
	}
	const preview: SyncPreview = {
		window: { ...source.window }, events: [],
		newMeetings: [], updates: [], personStubs: source.personStubs,
		seriesStubs: source.seriesStubs, skipped: source.plan.skipped,
		errors: source.plan.errors, warnings: [...source.warnings], features: { ...source.features },
	};
	for (const { input, existing } of source.meetings) {
		const companyLinks = [...(input.organizer?.companyLinks ?? []), ...input.invited.flatMap((person) => person.companyLinks)];
		if (source.strictCompanyLinks !== false && validateCompanyLinks(companyLinks, source.companies).length !== companyLinks.length) {
			preview.warnings.push({ kind: "unresolved-company", subject: existing?.path ?? input.event.summary });
		}
		if (!existing) {
			const note = buildMeetingNote(input, source.filenamePattern, { companies: source.companies, strictCompanyLinks: source.strictCompanyLinks !== false });
			const path = `${source.meetingFolder}/${note.filename}.md`;
			preview.newMeetings.push({ path, note });
			preview.events.push({ event: input.event, path, state: "new", changes: [] });
			continue;
		}
		const next = buildMeetingFrontmatterUpdate(input, source.companies, source.strictCompanyLinks);
		const changes: FieldChange[] = [];
		for (const [field, after] of Object.entries(next)) {
			const before = existing.frontmatter[field];
			if (!sameValue(before, after)) changes.push({ field, before, after });
		}
		const heading = input.schema.headings.inviteAgenda;
		if (extractSection(existing.body, heading) === undefined) {
			preview.warnings.push({ kind: "missing-invite-heading", subject: existing.path });
		}
		const body = buildMeetingBodyUpdate(existing.body, input.event.description, heading, input.schema.agendaPlaceholder, input.cleanInvite);
		if (body !== existing.body) {
			const before = extractSection(existing.body, heading);
			const after = extractSection(body, heading);
			changes.push({ field: "Invite Agenda", before, after });
		}
		preview.updates.push({ path: existing.path, changes });
		preview.events.push({ event: input.event, path: existing.path, state: changes.length ? "changed" : "unchanged", changes });
	}
	for (const { path, field, before, after } of source.vanishedCancellations ?? []) {
		preview.updates.push({ path, changes: [{ field, before, after }] });
	}
	return preview;
}

function sameValue(left: unknown, right: unknown): boolean {
	if (Array.isArray(left) && Array.isArray(right)) {
		return left.length === right.length && left.every((value, index) => sameValue(value, right[index]));
	}
	return left === right;
}
