import type { IgnoreListEntry } from "../filters/ignoreList.ts";
import { TFile, parseYaml, stringifyYaml, type App } from "obsidian";
import { DateTime } from "luxon";
import { isVaultPath, type GraftSettings } from "../config/settings.ts";
import { buildSyncPlan, type FeedFetcher } from "./plan.ts";
import { buildSyncPreview, type PreviewInput, type SyncPreview } from "../preview/plan.ts";
import { buildPersonStub } from "../generate/personStub.ts";
import { buildSeriesStub } from "../generate/seriesStub.ts";
import { writeMeetingNote } from "../generate/writeMeetingNote.ts";
import { updateMeetingNote } from "../generate/updateMeetingNote.ts";
import { matchMeeting } from "../match/meetingMatch.ts";
import { matchPerson } from "../match/personMatch.ts";
import { matchSeries } from "../match/seriesMatch.ts";
import type { ResolvedAttendee } from "../generate/meetingNote.ts";
import type { Attendee } from "../types.ts";
import { extractSection } from "../util/markdownSections.ts";
import { isInFolder, uniqueName } from "../util/vaultPath.ts";
import { renderTemplate } from "../templates/engine.ts";
import { UserFacingError, VaultChangedError } from "./userFacingError.ts";
import type { NoteSchema } from "../config/schema.ts";

interface NoteSnapshot {
	file: TFile;
	text: string;
	frontmatter: Record<string, unknown>;
	body: string;
}

export interface PreparedSync {
	input: PreviewInput;
	preview: SyncPreview;
	canApply: boolean;
	/** Used to reject an outdated preview before the first write. */
	snapshots: NoteSnapshot[];
	folders: string[];
	templates: Array<{ file: TFile; text: string }>;
}

export async function prepareSync(app: App, settings: GraftSettings, fetchFeed: FeedFetcher, now = new Date()): Promise<PreparedSync> {
	const feeds = settings.calendars.map(({ name, url, invitedAs }) => ({ name, url, invitedAs }));
	if (!feeds.length) throw new UserFacingError("Add a calendar in Graft settings.");
	const missing = feeds.filter((feed) => !feed.url.trim()).map((feed) => feed.name);
	if (missing.length) throw new UserFacingError(`No feed address on this device for ${missing.join(", ")}. Open Graft settings and enter it again.`);
	const day = DateTime.fromJSDate(now).setZone(settings.timezone).startOf("day");
	const window = { start: day.minus({ days: settings.daysBack }).toJSDate(), end: day.plus({ days: settings.daysAhead + 1 }).toJSDate() };
	const templates: PreparedSync["templates"] = [];
	const ignored = await readIgnoreList(app, settings.ignoreListPath, templates);
	const plan = await buildSyncPlan(feeds, window, settings.titleMatchRules, ignored, fetchFeed, settings.acceptedOnly, settings.titlePrefixesToStrip);
	const folders = [...new Set(Object.values(settings.folders))];
	const snapshots = await readSnapshots(app, folders);
	const bodies = await readTemplateBodies(app, settings, templates);
	const { schema } = settings;
	const notes = (folder: string, type: string) => snapshots.filter((note) => isInFolder(note.file, folder) && note.frontmatter[schema.typeField] === type);
	const people = notes(settings.folders.person, schema.types.person).map((note) => ({
		path: note.file.path,
		fullName: stringValue(note.frontmatter[schema.person.fullName]),
		email: stringValue(note.frontmatter[schema.person.email]),
		emailAliases: links(note.frontmatter[schema.person.emailAliases]),
		note,
	}));
	const series = notes(settings.folders.series, schema.types.series).map((note) => ({
		path: note.file.path,
		icsUid: stringValue(note.frontmatter[schema.series.uid]),
		note,
	}));
	const meetings = notes(settings.folders.meeting, schema.types.meeting).map((note) => ({
		path: note.file.path,
		icsUid: stringValue(note.frontmatter[schema.meeting.uid]),
		icsRecurrenceId: stringValue(note.frontmatter[schema.meeting.recurrenceId]),
		note,
	}));
	const linking = settings.companyLinking;
	const meetingSchema = linking ? schema : withoutCompaniesExtra(schema);
	const companies = !linking ? [] : notes(settings.folders.company, schema.types.company).map((note) => ({
		path: note.file.path,
		name: note.file.basename,
		domain: stringValue(note.frontmatter[schema.company.domain]),
	}));
	const invitedAsBySource = new Map(settings.calendars.map((calendar) => [calendar.name, calendar.invitedAs]));
	const input: PreviewInput = {
		plan,
		meetings: [],
		personStubs: [],
		seriesStubs: [],
		companies,
		meetingFolder: settings.folders.meeting,
		filenamePattern: settings.meetingFilenamePattern,
		strictCompanyLinks: linking && settings.strictCompanyLinks,
		warnings: [],
		features: {
			personStubs: settings.createPersonStubs,
			seriesStubs: settings.createSeriesStubs,
			skipped: settings.titleMatchRules.length > 0 || settings.ignoreListPath !== "" || settings.acceptedOnly,
		},
	};
	const newPeople = new Map<string, ResolvedAttendee>();
	const newSeries = new Map<string, { filename: string; standingAgenda?: string }>();
	const targets = new Set<string>();
	function reserve(folder: string, filename: string): string {
		if (!isVaultPath(`${folder}/${filename}.md`, false)) throw new UserFacingError("A planned note filename is not valid. Change the filename pattern or folder in Graft settings.");
		// A name already planned or already in the vault gets " 2", " 3" and so on, so one clash does not block the sync.
		const name = uniqueName(filename, (candidate) => targets.has(`${folder}/${candidate}.md`) || app.vault.getAbstractFileByPath(`${folder}/${candidate}.md`) !== null);
		targets.add(`${folder}/${name}.md`);
		return name;
	}
	function resolvePerson(attendee: Attendee): ResolvedAttendee | undefined {
		const matches = people.filter((person) => matchPerson(attendee, [person]));
		if (matches.length > 1) input.warnings.push({ kind: "ambiguous-person", subject: attendee.name || "Calendar attendee" });
		const person = matches[0];
		if (person) return { filename: person.note.file.basename, companyLinks: linking ? links(person.note.frontmatter[schema.person.company]) : [] };
		const key = attendee.email.toLowerCase();
		if (newPeople.has(key)) return newPeople.get(key);
		if (!settings.createPersonStubs) return undefined;
		const built = buildPersonStub(attendee, settings.personFilenameRules, companies, schema, linking);
		const stub = { ...built, filename: reserve(settings.folders.person, built.filename) };
		const path = `${settings.folders.person}/${stub.filename}.md`;
		input.personStubs.push({ path, stub, body: stubBody(bodies.person, stub.frontmatter) });
		const stubName = normalizeName(stringValue(stub.frontmatter[schema.person.fullName]));
		const sameName = stubName ? people.find((person) => normalizeName(person.fullName) === stubName || normalizeName(person.note.file.basename) === stubName) : undefined;
		if (sameName) input.warnings.push({ kind: "possible-duplicate-person", subject: `${path} and ${sameName.path}` });
		const resolved = { filename: stub.filename, companyLinks: stub.companyLinks };
		newPeople.set(key, resolved);
		return resolved;
	}
	for (const event of plan.toProcess) {
		const organizer = event.organizer ? resolvePerson(event.organizer) : undefined;
		const invited = event.attendees.map(resolvePerson).filter((person): person is ResolvedAttendee => person !== undefined);
		let resolvedSeries: { filename: string; standingAgenda?: string } | undefined;
		if (event.isRecurring || event.recurrenceId) {
			const matches = series.filter((item) => matchSeries(event.uid, [item]));
			if (matches.length > 1) throw new UserFacingError("More than one Series note matches the same event. Remove the duplicate from the Series folder.");
			if (matches[0]) resolvedSeries = { filename: matches[0].note.file.basename, standingAgenda: extractSection(matches[0].note.body, schema.headings.standingAgenda) };
			else if (newSeries.has(event.uid)) resolvedSeries = newSeries.get(event.uid);
			else if (settings.createSeriesStubs) {
				const built = buildSeriesStub(event, schema);
				const stub = { ...built, filename: reserve(settings.folders.series, built.filename) };
				const path = `${settings.folders.series}/${stub.filename}.md`;
				const body = stubBody(bodies.series, stub.frontmatter);
				input.seriesStubs.push({ path, stub, body });
				resolvedSeries = { filename: stub.filename, standingAgenda: extractSection(body, schema.headings.standingAgenda) };
				newSeries.set(event.uid, resolvedSeries);
			}
		}
		const matches = meetings.filter((item) => matchMeeting(event.uid, event.recurrenceId, [item]));
		if (matches.length > 1) throw new UserFacingError("More than one Meeting note has the same event UID. Remove the duplicate from the Meeting folder.");
		const existing = matches[0]?.note;
		if (existing) {
			if (targets.has(existing.file.path)) throw new UserFacingError("Two events from your calendars would update the same Meeting note. Check that no calendar is added twice.");
			targets.add(existing.file.path);
		}
		input.meetings.push({
			input: {
				event,
				organizer,
				invited,
				series: resolvedSeries,
				seriesStandingAgenda: resolvedSeries?.standingAgenda,
				invitedAs: invitedAsBySource.get(event.source ?? "") ?? "",
				schema: meetingSchema,
				timezone: settings.timezone,
				bodyTemplate: bodies.meeting,
				cleanInvite: settings.cleanInviteText,
			},
			existing: existing ? { path: existing.file.path, frontmatter: existing.frontmatter, body: existing.body } : undefined,
		});
	}
	if (!plan.errors.length) {
		const seen = [...plan.toProcess, ...plan.skipped.map(({ event }) => event)];
		const firstDate = day.minus({ days: settings.daysBack }).toISODate()!;
		const today = day.toISODate()!;
		const lastDate = day.plus({ days: settings.daysAhead }).toISODate()!;
		const candidates: Array<{ uid: string; path: string; field: string; before: unknown }> = [];
		for (const meeting of meetings) {
			const date = stringValue(meeting.note.frontmatter[schema.meeting.date]);
			const configuredIdentity = settings.calendars.some((calendar) => calendar.invitedAs === meeting.note.frontmatter[schema.meeting.invitedAs]);
			const inWindow = date !== undefined && date >= firstDate && date <= lastDate;
			if (!date || !configuredIdentity || !meeting.icsUid || !inWindow) continue;
			if (!seen.some((event) => matchMeeting(event.uid, event.recurrenceId, [meeting]))) {
				const field = schema.meeting.occurrenceStatus;
				const before = meeting.note.frontmatter[field];
				const eligible = settings.cancelVanishedSeries && field && date > today && meeting.icsRecurrenceId
					&& !seen.some((event) => event.uid === meeting.icsUid) && before !== schema.statusValues.cancelled;
				if (eligible) candidates.push({ uid: meeting.icsUid, path: meeting.path, field, before });
				else input.warnings.push({ kind: "vanished-event", subject: meeting.path });
			}
		}
		// A series counts as gone only when several of its future dates are missing, never one date or a one-off.
		for (const candidate of candidates) {
			if (candidates.filter((other) => other.uid === candidate.uid).length >= 2) {
				(input.vanishedCancellations ??= []).push({ path: candidate.path, field: candidate.field, before: candidate.before, after: schema.statusValues.cancelled });
			} else input.warnings.push({ kind: "vanished-event", subject: candidate.path });
		}
	}
	const preview = buildSyncPreview(input);
	const freshMeetings = input.meetings.filter((meeting) => !meeting.existing);
	preview.newMeetings.forEach((item, index) => {
		const filename = reserve(settings.folders.meeting, item.note.filename);
		item.path = `${settings.folders.meeting}/${filename}.md`;
		item.note = { ...item.note, filename };
		freshMeetings[index].filename = filename;
	});
	for (const path of targets) assertNoNoteInFolderPath(app, path);
	const hasAmbiguousPerson = input.warnings.some((warning) => warning.kind === "ambiguous-person");
	return { input, preview, canApply: !plan.errors.length && !hasAmbiguousPerson, snapshots, folders, templates };
}

/** Checks all inputs before any write; a changed vault requires a new preview. */
export async function applySync(app: App, prepared: PreparedSync): Promise<void> {
	if (!prepared.canApply) throw new UserFacingError("The sync plan has errors, so nothing was written. Run Preview sync and fix what it reports.");
	const current = app.vault.getMarkdownFiles().filter((file) => prepared.folders.some((folder) => isInFolder(file, folder))).map((file) => file.path).sort();
	const expected = prepared.snapshots.map((note) => note.file.path).sort();
	if (JSON.stringify(current) !== JSON.stringify(expected)) throw new VaultChangedError("The vault changed. Run Preview sync again.");
	for (const snapshot of [...prepared.snapshots, ...prepared.templates]) {
		const file = app.vault.getAbstractFileByPath(snapshot.file.path);
		if (!(file instanceof TFile) || await app.vault.read(file) !== snapshot.text) throw new VaultChangedError("The vault changed. Run Preview sync again.");
	}
	const newPaths = [...prepared.preview.newMeetings, ...prepared.input.personStubs, ...prepared.input.seriesStubs].map((note) => note.path);
	for (const path of newPaths) {
		if (app.vault.getAbstractFileByPath(path)) throw new VaultChangedError("A planned note already exists. Run Preview sync again.");
		assertNoNoteInFolderPath(app, path);
	}
	for (const path of newPaths) await ensureFolder(app, path.split("/").slice(0, -1).join("/"));
	for (const { path, stub, body } of [...prepared.input.personStubs, ...prepared.input.seriesStubs]) {
		await app.vault.create(path, `---\n${stringifyYaml(stub.frontmatter)}---\n\n${body ?? ""}`);
	}
	for (const { path, field, after } of prepared.input.vanishedCancellations ?? []) {
		const file = app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) throw new VaultChangedError("A Meeting note is missing. Run Preview sync again.");
		await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => { frontmatter[field] = after; });
	}
	for (const meeting of prepared.input.meetings) {
		if (meeting.existing) {
			const changes = prepared.preview.updates.find((update) => update.path === meeting.existing!.path)?.changes;
			if (!changes?.length) continue;
			const file = app.vault.getAbstractFileByPath(meeting.existing.path);
			if (!(file instanceof TFile)) throw new VaultChangedError("A Meeting note is missing. Run Preview sync again.");
			if (await app.vault.read(file) !== prepared.snapshots.find((note) => note.file.path === file.path)?.text) throw new VaultChangedError("The vault changed. Run Preview sync again.");
			await updateMeetingNote(app, file, meeting.input, prepared.input.companies, prepared.input.strictCompanyLinks);
		} else await writeMeetingNote(app, prepared.input.meetingFolder, meeting.input, prepared.input.companies, prepared.input.filenamePattern, prepared.input.strictCompanyLinks, meeting.filename);
	}
}

function splitNote(text: string): { frontmatter: Record<string, unknown>; body: string } {
	const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	if (!match) return { frontmatter: {}, body: text };
	const value: unknown = parseYaml(match[1]);
	if (value !== null && (typeof value !== "object" || Array.isArray(value))) throw new UserFacingError("A note in the configured folders has frontmatter that cannot be read. Fix its properties and run Preview sync again.");
	return { frontmatter: (value ?? {}) as Record<string, unknown>, body: text.slice(match[0].length) };
}

function stringValue(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function normalizeName(value: string | undefined): string {
	return (value ?? "").trim().toLowerCase();
}

function links(value: unknown): string[] {
	if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
	return typeof value === "string" ? [value] : [];
}

function stubBody(template: string | undefined, fields: object): string {
	if (template === undefined) return "";
	const values = Object.entries(fields).map(([key, value]: [string, unknown]): [string, string] => [key, Array.isArray(value) ? value.join(", ") : String(value)]);
	return renderTemplate(template, Object.fromEntries(values));
}

/** With company linking off, a {{companies}} extra would write an empty list over links already in a note. */
function withoutCompaniesExtra(schema: NoteSchema): NoteSchema {
	const meetingExtras = schema.meetingExtras.filter((field) => [field.value].flat().every((item) => item.trim() !== "{{companies}}"));
	return { ...schema, meetingExtras };
}

function isIgnoreEntry(entry: { uid?: unknown; recurrenceId?: unknown; note?: unknown }): boolean {
	return Boolean(entry)
		&& typeof entry.uid === "string"
		&& (entry.recurrenceId === null || typeof entry.recurrenceId === "string")
		&& (entry.note === undefined || typeof entry.note === "string");
}

/** Reads the ignore list file, if one is set, and records it among `templates` so Apply can detect edits. */
async function readIgnoreList(app: App, path: string, templates: PreparedSync["templates"]) {
	const file = path ? app.vault.getAbstractFileByPath(path) : null;
	if (!(file instanceof TFile)) return [];
	const text = await app.vault.read(file);
	templates.push({ file, text });
	let value: { ignored?: unknown } | null;
	try {
		value = text.trim() ? JSON.parse(text) as { ignored?: unknown } | null : { ignored: [] };
	} catch {
		throw new UserFacingError("The ignore list is not valid JSON. Fix the file or clear the ignore list setting.");
	}
	if (!value || !Array.isArray(value.ignored) || !value.ignored.every(isIgnoreEntry)) {
		throw new UserFacingError("The ignore list is not valid. Each ignored entry needs a uid and a recurrenceId, and may have a note.");
	}
	return value.ignored as IgnoreListEntry[];
}

async function readSnapshots(app: App, folders: string[]): Promise<NoteSnapshot[]> {
	const snapshots: NoteSnapshot[] = [];
	for (const file of app.vault.getMarkdownFiles().filter((file) => folders.some((folder) => isInFolder(file, folder)))) {
		const text = await app.vault.read(file);
		snapshots.push({ file, text, ...splitNote(text) });
	}
	return snapshots;
}

/** Reads the configured templates, records them among `templates`, and returns each one's body. */
async function readTemplateBodies(app: App, settings: GraftSettings, templates: PreparedSync["templates"]) {
	const bodies: Partial<Record<"meeting" | "person" | "series", string>> = {};
	for (const key of ["meeting", "person", "series"] as const) {
		const path = settings.templates[key];
		if (!path) continue;
		const file = app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) throw new UserFacingError("A template file set in Graft settings was not found. Fix the template path or clear it.");
		const text = await app.vault.read(file);
		templates.push({ file, text });
		bodies[key] = splitNote(text).body;
	}
	return bodies;
}

/** A note sitting where Graft would need a folder blocks the write. */
function assertNoNoteInFolderPath(app: App, path: string) {
	const parts = path.split("/").slice(0, -1);
	for (let count = 1; count <= parts.length; count++) {
		if (app.vault.getAbstractFileByPath(parts.slice(0, count).join("/")) instanceof TFile) {
			throw new UserFacingError("A note has the same path as a folder Graft needs to create. Rename the note or change the folders in Graft settings.");
		}
	}
}

async function ensureFolder(app: App, path: string) {
	const parts = path.split("/");
	for (let count = 1; count <= parts.length; count++) {
		const folder = parts.slice(0, count).join("/");
		if (!app.vault.getAbstractFileByPath(folder)) await app.vault.createFolder(folder);
	}
}
