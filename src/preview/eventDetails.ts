import { DateTime } from "luxon";
import type { CalendarEvent } from "../types.ts";
import type { FieldChange, PlannedEvent, PreviewWarning } from "./plan.ts";
import { warningMessage } from "./summary.ts";

export interface DetailSource {
	event: CalendarEvent;
	kind: "new" | "changed" | "unchanged" | "skipped";
	planned?: PlannedEvent;
	reason?: string;
}

export interface DetailRow {
	label: string;
	/** One line each. */
	lines: string[];
}

const statusText = {
	new: "New note. The sync will create it.",
	changed: "Existing note with changes.",
	unchanged: "Existing note, no changes.",
	skipped: "Skipped. No note is written.",
} as const;

/** "Thu 15 Oct 2026, 09:00 to 09:30 (Europe/London)". All-day events show dates and ignore the zone. */
export function formatWhen(event: CalendarEvent, zone: string): string {
	if (event.allDay) {
		const first = DateTime.fromISO(event.start, { zone: "utc" });
		const last = event.end > event.start ? DateTime.fromISO(event.end, { zone: "utc" }).minus({ days: 1 }) : first;
		const day = (value: DateTime) => value.toFormat("ccc d MMM yyyy");
		return last > first ? `${day(first)} to ${day(last)}, all day` : `${day(first)}, all day`;
	}
	const start = DateTime.fromISO(event.start, { zone: "utc" }).setZone(zone);
	const end = DateTime.fromISO(event.end, { zone: "utc" }).setZone(zone);
	if (end <= start) return `${start.toFormat("ccc d MMM yyyy, HH:mm")} (${zone})`;
	const until = start.hasSame(end, "day") ? end.toFormat("HH:mm") : end.toFormat("ccc d MMM yyyy, HH:mm");
	return `${start.toFormat("ccc d MMM yyyy, HH:mm")} to ${until} (${zone})`;
}

function show(value: unknown): string {
	if (value === undefined) return "(missing)";
	return typeof value === "string" ? value || "(empty)" : JSON.stringify(value);
}

export function describeChange({ field, before, after }: FieldChange): string {
	return `${field}: ${show(before)} to ${show(after)}`;
}

/** Warnings name either the note path or the event title. */
export function warningsFor({ event, planned }: DetailSource, warnings: PreviewWarning[]): string[] {
	return warnings
		.filter((warning) => warning.subject === planned?.path || warning.subject === event.summary)
		.map(warningMessage);
}

/** The rows shown for a selected event. Rows with nothing to say are left out. */
export function eventDetails(item: DetailSource, warnings: PreviewWarning[], zone: string): DetailRow[] {
	const { event, kind, planned, reason } = item;
	const rows: DetailRow[] = [
		{ label: "Title", lines: [event.summary || "(No title)"] },
		{ label: "When", lines: [formatWhen(event, zone)] },
		{ label: "Status", lines: [statusText[kind]] },
	];
	if (planned) rows.push({ label: "Note", lines: [planned.path] });
	if (kind === "skipped") rows.push({ label: "Reason", lines: [reason || "No reason given."] });
	if (planned && planned.changes.length) rows.push({ label: "Changes", lines: planned.changes.map(describeChange) });
	const found = warningsFor(item, warnings);
	if (found.length) rows.push({ label: "Warnings", lines: found });
	return rows;
}
