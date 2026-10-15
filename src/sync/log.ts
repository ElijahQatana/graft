import type { SyncPreview } from "../preview/plan.ts";

/** How many entries the log note keeps. Older ones are dropped from the top. */
export const MAX_LOG_ENTRIES = 200;

const HEADER = "# Graft sync log\n";

export interface SyncLogEntry {
	/** Local date and time, already formatted. */
	when: string;
	/** What started the run, such as "Sync now" or "Apply from preview". */
	source: string;
	created: string[];
	/** Existing Meeting notes that changed, with how many fields. */
	updated: Array<{ path: string; changes: number }>;
	personStubs: string[];
	seriesStubs: string[];
	warnings: number;
	skipped: number;
	error?: string;
}

/** Builds a log entry from a preview that was applied. Feed addresses never appear in a preview, so none can leak here. */
export function logEntryFromPreview(preview: SyncPreview, when: string, source: string, error?: string): SyncLogEntry {
	return {
		when, source,
		created: preview.newMeetings.map((note) => note.path),
		updated: preview.updates.filter((update) => update.changes.length > 0).map((update) => ({ path: update.path, changes: update.changes.length })),
		personStubs: preview.personStubs.map((stub) => stub.path),
		seriesStubs: preview.seriesStubs.map((stub) => stub.path),
		warnings: preview.warnings.length,
		skipped: preview.skipped.length,
		error,
	};
}

/** True when the entry records something worth keeping: a write or an error. */
export function isLoggable(entry: SyncLogEntry): boolean {
	return Boolean(entry.error) || entry.created.length + entry.updated.length + entry.personStubs.length + entry.seriesStubs.length > 0;
}

const link = (path: string) => `[[${path.replace(/\.md$/, "")}]]`;
const noun = (n: number, singular: string, plural = `${singular}s`) => `${n} ${n === 1 ? singular : plural}`;

export function formatLogEntry(entry: SyncLogEntry): string {
	const lines = [`## ${entry.when} · ${entry.source}`];
	if (entry.created.length) lines.push(`- Created ${noun(entry.created.length, "Meeting note")}: ${entry.created.map(link).join(", ")}`);
	if (entry.updated.length) lines.push(`- Updated ${noun(entry.updated.length, "Meeting note")}: ${entry.updated.map((item) => `${link(item.path)} (${noun(item.changes, "change")})`).join(", ")}`);
	if (entry.personStubs.length) lines.push(`- Created ${noun(entry.personStubs.length, "Person stub")}: ${entry.personStubs.map(link).join(", ")}`);
	if (entry.seriesStubs.length) lines.push(`- Created ${noun(entry.seriesStubs.length, "Series stub")}: ${entry.seriesStubs.map(link).join(", ")}`);
	if (entry.warnings || entry.skipped) lines.push(`- ${noun(entry.warnings, "warning")}, ${entry.skipped} skipped`);
	if (entry.error) lines.push(`- Stopped: ${entry.error}`);
	return `${lines.join("\n")}\n`;
}

/** Adds an entry to the end of the log text, creating the header when there is none, and keeps only the newest entries. */
export function appendLogEntry(existing: string | undefined, entry: SyncLogEntry, keep = MAX_LOG_ENTRIES): string {
	const text = existing?.trim() ? existing : HEADER;
	const parts = text.split(/^(?=## )/m);
	const header = parts[0].startsWith("## ") ? HEADER : parts.shift()!;
	const entries = [...parts, formatLogEntry(entry)].map((part) => (part.endsWith("\n") ? part : `${part}\n`));
	return `${header.replace(/\s*$/, "\n")}\n${entries.slice(-keep).join("\n")}`;
}

/** The log must not sit in a folder Graft reads as notes, or it would be scanned on every sync. */
export function isInsideNoteFolders(path: string, folders: string[]): boolean {
	return folders.some((folder) => path === folder || path.startsWith(`${folder}/`));
}
