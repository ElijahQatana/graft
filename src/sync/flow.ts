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
import { isInFolder } from "../util/vaultPath.ts";
import { renderTemplate } from "../templates/engine.ts";
import { UserFacingError } from "./userFacingError.ts";

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
	const feeds = settings.calendars.map(({ name, url }) => ({ name, url }));
	if (!feeds.length) throw new UserFacingError("Add a calendar in Graft settings.");
	const day = DateTime.fromJSDate(now).setZone(settings.timezone).startOf("day");
	const window = { start: day.minus({ days: settings.daysBack }).toJSDate(), end: day.plus({ days: settings.daysAhead + 1 }).toJSDate() };
	const ignoreFile = settings.ignoreListPath ? app.vault.getAbstractFileByPath(settings.ignoreListPath) : null;
	const templates: PreparedSync["templates"] = [];
	let ignored = [];
	if (ignoreFile instanceof TFile) {
		const text = await app.vault.read(ignoreFile);
		templates.push({ file: ignoreFile, text });
		let value;
		try { value = text.trim() ? JSON.parse(text) : { ignored: [] }; }
		catch { throw new UserFacingError("The ignore list is not valid JSON. Fix the file or clear the ignore list setting."); }
		if (!value || !Array.isArray(value.ignored) || !value.ignored.every((entry: { uid?: unknown; recurrenceId?: unknown; note?: unknown }) => entry && typeof entry.uid === "string" && (entry.recurrenceId === null || typeof entry.recurrenceId === "string") && (entry.note === undefined || typeof entry.note === "string"))) {
			throw new UserFacingError("The ignore list is not valid. Each ignored entry needs a uid and a recurrenceId, and may have a note.");
		}
		ignored = value.ignored;
	}
	const plan = await buildSyncPlan(feeds, window, settings.titleMatchRules, ignored, fetchFeed);
	const folders = [...new Set(Object.values(settings.folders))];
	const snapshots: NoteSnapshot[] = [];
	for (const file of app.vault.getMarkdownFiles().filter((file) => folders.some((folder) => isInFolder(file, folder)))) {
		const text = await app.vault.read(file);
		snapshots.push({ file, text, ...splitNote(text) });
	}
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
	const { schema } = settings;
	const notes = (folder: string, type: string) => snapshots.filter((note) => isInFolder(note.file, folder) && note.frontmatter[schema.typeField] === type);
	const people = notes(settings.folders.person, schema.types.person).map((note) => ({ path: note.file.path, email: stringValue(note.frontmatter[schema.person.email]), emailAliases: links(note.frontmatter[schema.person.emailAliases]), note }));
	const series = notes(settings.folders.series, schema.types.series).map((note) => ({ path: note.file.path, icsUid: stringValue(note.frontmatter[schema.series.uid]), note }));
	const meetings = notes(settings.folders.meeting, schema.types.meeting).map((note) => ({ path: note.file.path, icsUid: stringValue(note.frontmatter[schema.meeting.uid]), icsRecurrenceId: stringValue(note.frontmatter[schema.meeting.recurrenceId]), note }));
	const linking = settings.companyLinking;
	// With linking off, a {{companies}} extra would write an empty list over links already in a note.
	const meetingSchema = linking ? schema : { ...schema, meetingExtras: schema.meetingExtras.filter((field) => ![field.value].flat().some((item) => item.trim() === "{{companies}}")) };
	const companies = !linking ? [] : notes(settings.folders.company, schema.types.company).map((note) => ({ path: note.file.path, name: note.file.basename, domain: stringValue(note.frontmatter[schema.company.domain]) }));
	const invitedAsBySource = new Map(settings.calendars.map((calendar) => [calendar.name, calendar.invitedAs]));
	const input: PreviewInput = { plan, meetings: [], personStubs: [], seriesStubs: [], companies, meetingFolder: settings.folders.meeting, filenamePattern: settings.meetingFilenamePattern, strictCompanyLinks: linking && settings.strictCompanyLinks, warnings: [],
		features: { personStubs: settings.createPersonStubs, seriesStubs: settings.createSeriesStubs, skipped: settings.titleMatchRules.length > 0 || settings.ignoreListPath !== "" } };
	const newPeople = new Map<string, ResolvedAttendee>();
	const newSeries = new Map<string, { filename: string; standingAgenda?: string }>();
	const targets = new Set<string>();
	function reserve(path: string) {
		if (!isVaultPath(path, false)) throw new UserFacingError("A planned note filename is not valid. Change the filename pattern or folder in Graft settings.");
		if (targets.has(path) || app.vault.getAbstractFileByPath(path)) throw new UserFacingError("Two notes would get the same name, or a note with that name already exists. Change the filename pattern or folders in Graft settings.");
		targets.add(path);
	}
	function resolvePerson(attendee: Attendee): ResolvedAttendee | undefined {
		const matches = people.filter((person) => matchPerson(attendee, [person]));
		if (matches.length > 1) input.warnings.push({ kind: "ambiguous-person", subject: attendee.name || "Calendar attendee" });
		const person = matches[0];
		if (person) return { filename: person.note.file.basename, companyLinks: linking ? links(person.note.frontmatter[schema.person.company]) : [] };
		const key = attendee.email.toLowerCase();
		if (newPeople.has(key)) return newPeople.get(key);
		if (!settings.createPersonStubs) return undefined;
		const stub = buildPersonStub(attendee, settings.personFilenameRules, companies, schema, linking);
		const path = `${settings.folders.person}/${stub.filename}.md`;
		reserve(path);
		input.personStubs.push({ path, stub, body: stubBody(bodies.person, stub.frontmatter) });
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
				const stub = buildSeriesStub(event, schema);
				const path = `${settings.folders.series}/${stub.filename}.md`;
				reserve(path);
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
			input: { event, organizer, invited, series: resolvedSeries, seriesStandingAgenda: resolvedSeries?.standingAgenda, invitedAs: invitedAsBySource.get(event.source ?? "") ?? "", schema: meetingSchema, timezone: settings.timezone, bodyTemplate: bodies.meeting },
			existing: existing ? { path: existing.file.path, frontmatter: existing.frontmatter, body: existing.body } : undefined,
		});
	}
	if (!plan.errors.length) {
		const seen = [...plan.toProcess, ...plan.skipped.map(({ event }) => event)];
		for (const meeting of meetings) {
			const date = stringValue(meeting.note.frontmatter[schema.meeting.date]);
			const configuredIdentity = settings.calendars.some((calendar) => calendar.invitedAs === meeting.note.frontmatter[schema.meeting.invitedAs]);
			if (date && configuredIdentity && meeting.icsUid && date >= day.minus({ days: settings.daysBack }).toISODate()! && date <= day.plus({ days: settings.daysAhead }).toISODate()!
				&& !seen.some((event) => matchMeeting(event.uid, event.recurrenceId, [meeting]))) {
				input.warnings.push({ kind: "vanished-event", subject: meeting.path });
			}
		}
	}
	const preview = buildSyncPreview(input);
	for (const note of preview.newMeetings) reserve(note.path);
	for (const path of targets) {
		const parts = path.split("/").slice(0, -1);
		for (let count = 1; count <= parts.length; count++) {
			if (app.vault.getAbstractFileByPath(parts.slice(0, count).join("/")) instanceof TFile) throw new UserFacingError("A note has the same path as a folder Graft needs to create. Rename the note or change the folders in Graft settings.");
		}
	}
	return { input, preview, canApply: !plan.errors.length && !input.warnings.some((warning) => warning.kind === "ambiguous-person"), snapshots, folders, templates };
}

/** Checks all inputs before any write; a changed vault requires a new preview. */
export async function applySync(app: App, prepared: PreparedSync): Promise<void> {
	if (!prepared.canApply) throw new UserFacingError("The sync plan has errors, so nothing was written. Run Preview sync and fix what it reports.");
	const current = app.vault.getMarkdownFiles().filter((file) => prepared.folders.some((folder) => isInFolder(file, folder))).map((file) => file.path).sort();
	if (JSON.stringify(current) !== JSON.stringify(prepared.snapshots.map((note) => note.file.path).sort())) throw new UserFacingError("The vault changed. Run Preview sync again.");
	for (const snapshot of [...prepared.snapshots, ...prepared.templates]) {
		const file = app.vault.getAbstractFileByPath(snapshot.file.path);
		if (!(file instanceof TFile) || await app.vault.read(file) !== snapshot.text) throw new UserFacingError("The vault changed. Run Preview sync again.");
	}
	const newPaths = [...prepared.preview.newMeetings, ...prepared.input.personStubs, ...prepared.input.seriesStubs].map((note) => note.path);
	for (const path of newPaths) {
		if (app.vault.getAbstractFileByPath(path)) throw new UserFacingError("A planned note already exists. Run Preview sync again.");
		const parts = path.split("/").slice(0, -1);
		for (let count = 1; count <= parts.length; count++) {
			const folder = app.vault.getAbstractFileByPath(parts.slice(0, count).join("/"));
			if (folder instanceof TFile) throw new UserFacingError("A note has the same path as a folder Graft needs to create. Rename the note or change the folders in Graft settings.");
		}
	}
	for (const path of newPaths) await ensureFolder(app, path.split("/").slice(0, -1).join("/"));
	for (const { path, stub, body } of [...prepared.input.personStubs, ...prepared.input.seriesStubs]) {
		await app.vault.create(path, `---\n${stringifyYaml(stub.frontmatter)}---\n\n${body ?? ""}`);
	}
	for (const meeting of prepared.input.meetings) {
		if (meeting.existing) {
			const changes = prepared.preview.updates.find((update) => update.path === meeting.existing!.path)?.changes;
			if (!changes?.length) continue;
			const file = app.vault.getAbstractFileByPath(meeting.existing.path);
			if (!(file instanceof TFile)) throw new UserFacingError("A Meeting note is missing. Run Preview sync again.");
			if (await app.vault.read(file) !== prepared.snapshots.find((note) => note.file.path === file.path)?.text) throw new UserFacingError("The vault changed. Run Preview sync again.");
			await updateMeetingNote(app, file, meeting.input, prepared.input.companies, prepared.input.strictCompanyLinks);
		} else await writeMeetingNote(app, prepared.input.meetingFolder, meeting.input, prepared.input.companies, prepared.input.filenamePattern, prepared.input.strictCompanyLinks);
	}
}

function splitNote(text: string): { frontmatter: Record<string, unknown>; body: string } {
	const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	if (!match) return { frontmatter: {}, body: text };
	const value = parseYaml(match[1]);
	if (value !== null && (typeof value !== "object" || Array.isArray(value))) throw new UserFacingError("A note in the configured folders has frontmatter that cannot be read. Fix its properties and run Preview sync again.");
	return { frontmatter: value ?? {}, body: text.slice(match[0].length) };
}
function stringValue(value: unknown): string | undefined { return typeof value === "string" ? value : undefined; }
function links(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : typeof value === "string" ? [value] : []; }
function stubBody(template: string | undefined, fields: object): string {
	return template === undefined ? "" : renderTemplate(template, Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : String(value)])));
}
async function ensureFolder(app: App, path: string) {
	const parts = path.split("/");
	for (let count = 1; count <= parts.length; count++) {
		const folder = parts.slice(0, count).join("/");
		if (!app.vault.getAbstractFileByPath(folder)) await app.vault.createFolder(folder);
	}
}
