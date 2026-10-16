import { DateTime } from "luxon";
import type { PreviewWarning, PreviewWindow, SyncPreview } from "./plan.ts";

/** Picks the singular form for exactly one, the plural otherwise (zero included). */
export function count(n: number, singular: string, plural = `${singular}s`): string {
	return `${n} ${n === 1 ? singular : plural}`;
}

/** One line for the top of the preview, naming the features that are turned on. Skipped events always show once there are any. */
export function buildSummary({ newMeetings, updates, personStubs, seriesStubs, skipped, features }: SyncPreview): string {
	const parts = [count(newMeetings.length, "new Meeting"), count(updates.length, "existing Meeting")];
	if (features.personStubs) parts.push(count(personStubs.length, "Person stub"));
	if (features.seriesStubs) parts.push(count(seriesStubs.length, "Series stub"));
	// Company links are not a toggleable feature yet. Once they are, add a
	// features flag and a part here, in the same on-means-shown way.
	// Duplicate events across calendars are skipped even with no filters, so a
	// non-zero count is never hidden. With filters on, a zero still shows.
	if (features.skipped || skipped.length > 0) parts.push(`${skipped.length} skipped`);
	return `${parts.join(", ")}.`;
}

export function buildWindowLabel(window: PreviewWindow): string {
	const { daysBack, daysAhead } = window;
	return `Covers ${buildRangeText(window)} (${count(daysBack, "day")} back, ${daysAhead} ahead).`;
}

/** Shows the start year only when the range crosses a year boundary. */
export function buildRangeText({ start, end, timezone }: PreviewWindow): string {
	const first = DateTime.fromJSDate(start).setZone(timezone);
	const last = DateTime.fromJSDate(end).setZone(timezone).minus({ days: 1 });
	const from = first.year === last.year ? first.toFormat("d MMM") : first.toFormat("d MMM yyyy");
	return `${from} to ${last.toFormat("d MMM yyyy")}`;
}

/** What each warning means, shown in the warnings section and on a selected event. */
export const warningText: Record<PreviewWarning["kind"], string> = {
	"unresolved-company": "Unresolved Company link. The link will be omitted.",
	"ambiguous-person": "Ambiguous Person match. Check the matching notes before syncing.",
	"possible-duplicate-person": "Possible duplicate Person. If they are the same person, add the new address as an alias on the existing note and preview again.",
	"vanished-event": "Event missing from the feed. This does not mark it cancelled.",
	"missing-invite-heading": "No invite agenda heading in this note, so its agenda is not updated. Add the heading or check the Headings setting.",
};
