import { DateTime } from "luxon";
import type { CalendarEvent } from "../types.ts";
import type { PlannedEvent, SyncPreview } from "./plan.ts";
import { eventDetails, formatWhen } from "./eventDetails.ts";
import type { WeekDay } from "../util/weekStart.ts";
import { noteTitle } from "../util/vaultPath.ts";
import { addDays, bucketByDay, dayRange, layoutDay, localDate, minuteOnDate, visibleHours, weekStart, type DayEntry } from "./calendar.ts";

export type CalendarSpan = 1 | 3 | 7;

/** Held by the modal so a redraw keeps the position. */
export interface CalendarState {
	span: CalendarSpan;
	/** YYYY-MM-DD. The week view starts on the first day of the week that holds it. */
	anchor: string;
	/** First column of the week view, 0 for Sunday through 6 for Saturday. */
	weekStart: WeekDay;
	selected?: string;
	/** Unset until the user scrolls. The grid then opens near now or the first event. */
	scrollTop?: number;
	/** Set by a click so the redraw puts keyboard focus back on the chosen event. */
	refocus?: boolean;
}

interface CalendarItem {
	id: string;
	event: CalendarEvent;
	kind: "new" | "changed" | "unchanged" | "skipped";
	planned?: PlannedEvent;
	reason?: string;
}

const kindLabel = { new: "New note", changed: "Note changes", unchanged: "Unchanged", skipped: "Skipped" } as const;

/** Starts at today when today is inside the window, else at the window's first day. */
export function initialCalendarState(preview: SyncPreview, now = new Date(), weekStart: WeekDay = 0): CalendarState {
	const { window } = preview;
	const first = localDate(window.start, window.timezone);
	const last = localDate(new Date(window.end.getTime() - 1), window.timezone);
	const today = localDate(now, window.timezone);
	return { span: 3, anchor: today >= first && today <= last ? today : first, weekStart };
}

export function visibleDates({ span, anchor, weekStart: firstDay }: CalendarState): string[] {
	return dayRange(span === 7 ? weekStart(anchor, firstDay) : anchor, span);
}

/** "Thu 15 Oct 2026" for one day, else "Thu 15 to Sat 17 Oct 2026". Month and year appear on the first date only when the range crosses them. */
export function rangeLabel(dates: string[]): string {
	if (dates.length === 1) return DateTime.fromISO(dates[0], { zone: "utc" }).toFormat("ccc d MMM yyyy");
	const first = DateTime.fromISO(dates[0], { zone: "utc" });
	const last = DateTime.fromISO(dates[dates.length - 1], { zone: "utc" });
	const from = first.year !== last.year ? first.toFormat("ccc d MMM yyyy") : first.month !== last.month ? first.toFormat("ccc d MMM") : first.toFormat("ccc d");
	return `${from} to ${last.toFormat("ccc d MMM yyyy")}`;
}

/** Where the anchor goes when stepping back (negative) or forward. Weeks step from their first day. */
export function stepAnchor({ span, anchor, weekStart: firstDay }: CalendarState, direction: 1 | -1): string {
	return addDays(span === 7 ? weekStart(anchor, firstDay) : anchor, direction * span);
}

const stepName = { 1: "day", 3: "3 days", 7: "week" } as const;

/** Rough pixel metrics for a timed block: an hour is 3rem and a line of small text about 15px. */
const HOUR_PX = 48;
const LINE_PX = 15;
const BLOCK_PAD_PX = 4;

/** How a block lays out its text. A short block puts the time and the title on one line. A taller one gives the time its own line and wraps the title below it. */
export function blockFit(durationMin: number): { titleLines: number; stacked: boolean } {
	const lines = Math.max(1, Math.floor(((durationMin / 60) * HOUR_PX - BLOCK_PAD_PX) / LINE_PX));
	return lines >= 2 ? { titleLines: lines - 1, stacked: true } : { titleLines: 1, stacked: false };
}

/** A short zone label for the gutter, such as "UTC-4". The full name is kept for the tooltip. */
export function zoneLabel(zone: string, now = new Date()): string {
	const at = DateTime.fromJSDate(now, { zone });
	return at.isValid ? at.toFormat("'UTC'Z") : zone;
}

export function addSegmented<T extends string | number>(parent: HTMLElement, label: string, options: Array<[T, string]>, active: T, pick: (value: T) => void) {
	const group = parent.createEl("div", { cls: "graft-segmented", attr: { role: "group", "aria-label": label } });
	for (const [value, text] of options) {
		const on = value === active;
		const button = group.createEl("button", { text, cls: on ? "graft-segment is-active" : "graft-segment", attr: { type: "button", "aria-pressed": String(on) } });
		button.addEventListener("click", () => { if (!on) pick(value); });
	}
}

export interface CalendarOptions {
	/** Shown for a selected event whose note exists. */
	openNote?: (path: string) => void;
}

/** Draws from the plan the preview already holds and fetches nothing. */
export function renderCalendar(container: HTMLElement, preview: SyncPreview, state: CalendarState, update: () => void, now = new Date(), options: CalendarOptions = {}) {
	const zone = preview.window.timezone;
	const items: CalendarItem[] = [
		...preview.events.map((planned, index): CalendarItem => ({ id: `kept-${index}`, event: planned.event, kind: planned.state, planned })),
		...preview.skipped.map(({ event, reason }, index): CalendarItem => ({ id: `skipped-${index}`, event, kind: "skipped", reason })),
	];
	const dates = visibleDates(state);
	const first = localDate(preview.window.start, zone);
	const last = localDate(new Date(preview.window.end.getTime() - 1), zone);
	const today = localDate(now, zone);
	const shift = (direction: 1 | -1) => { state.anchor = stepAnchor(state, direction); update(); };

	const bar = container.createEl("div", { cls: "graft-cal-bar" });
	const nav = bar.createEl("div", { cls: "graft-cal-nav" });
	const previous = nav.createEl("button", { text: "Previous", cls: "graft-cal-step", attr: { type: "button", "aria-label": `Previous ${stepName[state.span]}` } });
	const next = nav.createEl("button", { text: "Next", cls: "graft-cal-step", attr: { type: "button", "aria-label": `Next ${stepName[state.span]}` } });
	if (dates[0] <= first) previous.disabled = true;
	else previous.addEventListener("click", () => shift(-1));
	if (dates[dates.length - 1] >= last) next.disabled = true;
	else next.addEventListener("click", () => shift(1));
	bar.createEl("span", { text: rangeLabel(dates), cls: "graft-cal-range" });
	addSegmented<CalendarSpan>(bar, "Days shown", [[1, "1 day"], [3, "3 days"], [7, "Week"]], state.span, (span) => { state.span = span; update(); });
	bar.createEl("span", { text: `Times in ${zone}`, cls: "graft-muted graft-cal-zone-note" });

	const days = bucketByDay(items, dates, zone).map(({ date, entries }) => ({ date, allDay: entries.filter((entry) => entry.allDay), blocks: layoutDay(entries) }));
	const hours = visibleHours(days.flatMap((day) => day.blocks));
	const span = (hours.end - hours.start) * 60;
	const percent = (minutes: number) => `${(((minutes - hours.start * 60) / span) * 100).toFixed(3)}%`;
	const marks = days.map(({ date }) => (date === today ? minuteOnDate(now, date, zone) : undefined));
	const scroll = container.createEl("div", { cls: "graft-cal-scroll" });
	scroll.addEventListener("scroll", () => { state.scrollTop = scroll.scrollTop; });
	const grid = scroll.createEl("div", { cls: `graft-cal-grid graft-cal-days-${dates.length}`, attr: { style: `--graft-cal-hours:${hours.end - hours.start};--graft-cal-days:${dates.length}` } });

	const gutter = grid.createEl("div", { cls: "graft-cal-gutter" });
	gutter.createEl("div", { text: zoneLabel(zone, now), cls: "graft-cal-day-head graft-cal-zone", attr: { title: zone } });
	gutter.createEl("div", { cls: "graft-cal-allday" });
	const gutterBody = gutter.createEl("div", { cls: "graft-cal-gutter-body" });
	for (let hour = hours.start; hour < hours.end; hour++) {
		gutterBody.createEl("span", { text: `${String(hour).padStart(2, "0")}:00`, cls: "graft-cal-hour", attr: { style: `top:${percent(hour * 60)}` } });
	}

	days.forEach(({ date, allDay, blocks }, index) => {
		const day = DateTime.fromISO(date, { zone: "utc" });
		const column = grid.createEl("div", { cls: date === today ? "graft-cal-day is-today" : "graft-cal-day" });
		const head = column.createEl("div", { cls: "graft-cal-day-head" });
		head.createEl("span", { text: day.toFormat("ccc"), cls: "graft-cal-day-name" });
		head.createEl("span", { text: day.toFormat("d"), cls: "graft-cal-day-num" });
		const row = column.createEl("div", { cls: "graft-cal-allday" });
		for (const entry of allDay) addChip(row, entry.item, entry, state, update);
		const body = column.createEl("div", { cls: "graft-cal-day-body" });
		for (const { entry, startMin, endMin, column: slot, columns } of blocks) {
			const position = `top:${percent(startMin)};height:${(((endMin - startMin) / span) * 100).toFixed(3)}%;left:${((slot / columns) * 100).toFixed(3)}%;width:${(100 / columns).toFixed(3)}%`;
			addChip(body, entry.item, entry, state, update, position, endMin - startMin);
		}
		const mark = marks[index];
		if (mark !== undefined && mark >= hours.start * 60 && mark <= hours.end * 60) {
			body.createEl("div", { cls: "graft-cal-now", attr: { style: `top:${percent(mark)}`, "aria-hidden": "true" } });
		}
	});
	const target = marks.find((mark) => mark !== undefined) ?? Math.min(...days.flatMap((day) => day.blocks.map((block) => block.startMin)), hours.end * 60);
	scrollToState(scroll, grid, state, (Math.max(target, hours.start * 60) - hours.start * 60) / span);

	const legend = container.createEl("div", { cls: "graft-cal-legend" });
	for (const kind of Object.keys(kindLabel) as Array<keyof typeof kindLabel>) {
		const key = legend.createEl("span", { cls: "graft-cal-key" });
		key.createEl("span", { cls: `graft-cal-swatch graft-cal-${kind}` });
		key.createEl("span", { text: kindLabel[kind] });
	}
	const selected = items.find((item) => item.id === state.selected);
	const detail = container.createEl("div", { cls: selected ? `graft-cal-detail has-event graft-cal-${selected.kind}` : "graft-cal-detail", attr: { role: "region", "aria-label": "Event details", "aria-live": "polite" } });
	if (!selected) detail.createEl("p", { text: "Select an event to see its note and what will change.", cls: "graft-muted" });
	if (selected) {
		const head = detail.createEl("div", { cls: "graft-cal-detail-head" });
		head.createEl("span", { text: selected.event.summary || "(No title)", cls: "graft-cal-detail-title" });
		head.createEl("span", { text: kindLabel[selected.kind], cls: "graft-cal-pill", attr: { "aria-hidden": "true" } });
		detail.createEl("div", { text: formatWhen(selected.event, zone), cls: "graft-cal-detail-when" });
		detail.createEl("p", { text: describe(selected), cls: "graft-cal-sr" });
		const facts = detail.createEl("dl", { cls: "graft-cal-facts" });
		for (const { label, lines } of eventDetails(selected, preview.warnings, zone)) {
			if (label === "Title" || label === "When") continue;
			facts.createEl("dt", { text: label });
			const value = facts.createEl("dd", { cls: label === "Warnings" ? "graft-cal-fact-warning" : "" });
			for (const line of lines) value.createEl("div", { text: line, cls: label === "Changes" ? "graft-cal-change" : "" });
		}
	}
	if (selected?.planned && selected.kind !== "new" && options.openNote) {
		const path = selected.planned.path;
		const open = detail.createEl("button", { text: "Open note", cls: "graft-cal-open", attr: { type: "button" } });
		open.addEventListener("click", () => options.openNote!(path));
	}
	if (state.refocus) {
		state.refocus = false;
		container.querySelector?.<HTMLElement>(".graft-cal-event.is-selected")?.focus?.({ preventScroll: true });
	}
}

/** Restores the scroll position, or on first show brings now or the first event into view. */
function scrollToState(scroll: HTMLElement, grid: HTMLElement, state: CalendarState, fraction: number) {
	if (state.scrollTop !== undefined) { scroll.scrollTop = state.scrollTop; return; }
	const body = grid.querySelector?.<HTMLElement>(".graft-cal-day-body");
	if (!body || !Number.isFinite(body.offsetTop)) return;
	scroll.scrollTop = Math.max(0, body.offsetTop + fraction * body.offsetHeight - scroll.clientHeight / 4);
}

function addChip(list: HTMLElement, item: CalendarItem, entry: DayEntry<unknown>, state: CalendarState, update: () => void, position?: string, duration = 0) {
	const time = entry.allDay ? "All day" : entry.continuesFromPrevious ? `Until ${entry.endTime}` : entry.startTime;
	const title = item.event.summary || "(No title)";
	const classes = ["graft-cal-event", `graft-cal-${item.kind}`];
	const fit = position ? blockFit(duration) : undefined;
	if (position) classes.push("is-timed", fit!.stacked ? "is-stacked" : "is-inline");
	if (item.id === state.selected) classes.push("is-selected");
	if (entry.continuesFromPrevious) classes.push("is-continued");
	if (entry.continuesToNext) classes.push("is-continuing");
	const chip = list.createEl("button", { cls: classes.join(" "), attr: { type: "button", "aria-pressed": String(item.id === state.selected), "aria-label": `${kindLabel[item.kind]}: ${time}, ${title}`, ...(position ? { style: position } : {}) } });
	if (fit && !entry.allDay) chip.createEl("span", { text: time, cls: "graft-cal-time" });
	chip.createEl("span", { text: title, cls: "graft-cal-title", ...(fit?.stacked ? { attr: { style: `-webkit-line-clamp:${fit.titleLines}` } } : {}) });
	chip.addEventListener("click", () => { state.selected = item.id === state.selected ? undefined : item.id; state.refocus = true; update(); });
}

function describe({ event, kind, planned, reason }: CalendarItem): string {
	const title = event.summary || "(No title)";
	if (kind === "skipped" || !planned) return `${title}: skipped. ${reason ?? "No reason given."}`;
	const note = noteTitle(planned.path);
	if (kind === "new") return `${title}: new note ${note}.`;
	if (kind === "unchanged") return `${title}: no changes to ${note}.`;
	return `${title}: changes to ${note}: ${planned.changes.map((change) => change.field).join(", ")}.`;
}
