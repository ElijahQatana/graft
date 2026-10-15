import { DateTime } from "luxon";
import type { CalendarEvent } from "../types.ts";
import type { PlannedEvent, SyncPreview } from "./plan.ts";
import { addDays, bucketByDay, dayRange, layoutDay, localDate, minuteOnDate, visibleHours, weekStart, type DayEntry } from "./calendar.ts";

export type CalendarSpan = 3 | 7;

/** Held by the modal so a redraw keeps the position. */
export interface CalendarState {
	span: CalendarSpan;
	/** YYYY-MM-DD. The week view starts on the Monday on or before it. */
	anchor: string;
	selected?: string;
	/** Unset until the user scrolls. The grid then opens near now or the first event. */
	scrollTop?: number;
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
export function initialCalendarState(preview: SyncPreview, now = new Date()): CalendarState {
	const { window } = preview;
	const first = localDate(window.start, window.timezone);
	const last = localDate(new Date(window.end.getTime() - 1), window.timezone);
	const today = localDate(now, window.timezone);
	return { span: 3, anchor: today >= first && today <= last ? today : first };
}

export function visibleDates({ span, anchor }: CalendarState): string[] {
	return dayRange(span === 7 ? weekStart(anchor) : anchor, span);
}

/** "Thu 15 to Sat 17 Oct 2026". Month and year appear on the first date only when the range crosses them. */
export function rangeLabel(dates: string[]): string {
	const first = DateTime.fromISO(dates[0], { zone: "utc" });
	const last = DateTime.fromISO(dates[dates.length - 1], { zone: "utc" });
	const from = first.year !== last.year ? first.toFormat("ccc d MMM yyyy") : first.month !== last.month ? first.toFormat("ccc d MMM") : first.toFormat("ccc d");
	return `${from} to ${last.toFormat("ccc d MMM yyyy")}`;
}

export function addSegmented<T extends string | number>(parent: HTMLElement, label: string, options: Array<[T, string]>, active: T, pick: (value: T) => void) {
	const group = parent.createEl("div", { cls: "graft-segmented", attr: { role: "group", "aria-label": label } });
	for (const [value, text] of options) {
		const on = value === active;
		const button = group.createEl("button", { text, cls: on ? "graft-segment is-active" : "graft-segment", attr: { type: "button", "aria-pressed": String(on) } });
		button.addEventListener("click", () => { if (!on) pick(value); });
	}
}

/** Draws from the plan the preview already holds and fetches nothing. */
export function renderCalendar(container: HTMLElement, preview: SyncPreview, state: CalendarState, update: () => void, now = new Date()) {
	const zone = preview.window.timezone;
	const items: CalendarItem[] = [
		...preview.events.map((planned, index): CalendarItem => ({ id: `kept-${index}`, event: planned.event, kind: planned.state, planned })),
		...preview.skipped.map(({ event, reason }, index): CalendarItem => ({ id: `skipped-${index}`, event, kind: "skipped", reason })),
	];
	const dates = visibleDates(state);
	const first = localDate(preview.window.start, zone);
	const last = localDate(new Date(preview.window.end.getTime() - 1), zone);
	const today = localDate(now, zone);
	const shift = (days: number) => { state.anchor = addDays(state.span === 7 ? dates[0] : state.anchor, days); update(); };

	const bar = container.createEl("div", { cls: "graft-cal-bar" });
	const nav = bar.createEl("div", { cls: "graft-cal-nav" });
	const previous = nav.createEl("button", { text: "Previous", cls: "graft-cal-step", attr: { type: "button", "aria-label": `Previous ${state.span} days` } });
	const next = nav.createEl("button", { text: "Next", cls: "graft-cal-step", attr: { type: "button", "aria-label": `Next ${state.span} days` } });
	if (dates[0] <= first) previous.disabled = true;
	else previous.addEventListener("click", () => shift(-state.span));
	if (dates[dates.length - 1] >= last) next.disabled = true;
	else next.addEventListener("click", () => shift(state.span));
	bar.createEl("span", { text: rangeLabel(dates), cls: "graft-cal-range" });
	addSegmented<CalendarSpan>(bar, "Days shown", [[3, "3 days"], [7, "Week"]], state.span, (span) => { state.span = span; update(); });

	const days = bucketByDay(items, dates, zone).map(({ date, entries }) => ({ date, allDay: entries.filter((entry) => entry.allDay), blocks: layoutDay(entries) }));
	const hours = visibleHours(days.flatMap((day) => day.blocks));
	const span = (hours.end - hours.start) * 60;
	const percent = (minutes: number) => `${(((minutes - hours.start * 60) / span) * 100).toFixed(3)}%`;
	const marks = days.map(({ date }) => (date === today ? minuteOnDate(now, date, zone) : undefined));
	const scroll = container.createEl("div", { cls: "graft-cal-scroll" });
	scroll.addEventListener("scroll", () => { state.scrollTop = scroll.scrollTop; });
	const grid = scroll.createEl("div", { cls: `graft-cal-grid graft-cal-days-${dates.length}`, attr: { style: `--graft-cal-hours:${hours.end - hours.start}` } });

	const gutter = grid.createEl("div", { cls: "graft-cal-gutter" });
	gutter.createEl("div", { text: zone, cls: "graft-cal-day-head graft-cal-zone" });
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
			addChip(body, entry.item, entry, state, update, position);
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
	container.createEl("p", { text: selected ? describe(selected) : "Select an event to see its note and what will change.", cls: "graft-cal-detail graft-muted" });
}

/** Restores the scroll position, or on first show brings now or the first event into view. */
function scrollToState(scroll: HTMLElement, grid: HTMLElement, state: CalendarState, fraction: number) {
	if (state.scrollTop !== undefined) { scroll.scrollTop = state.scrollTop; return; }
	const body = grid.querySelector?.<HTMLElement>(".graft-cal-day-body");
	if (!body || !Number.isFinite(body.offsetTop)) return;
	scroll.scrollTop = Math.max(0, body.offsetTop + fraction * body.offsetHeight - scroll.clientHeight / 4);
}

function addChip(list: HTMLElement, item: CalendarItem, entry: DayEntry<unknown>, state: CalendarState, update: () => void, position?: string) {
	const time = entry.allDay ? "All day" : entry.continuesFromPrevious ? `Until ${entry.endTime}` : entry.startTime;
	const title = item.event.summary || "(No title)";
	const classes = ["graft-cal-event", `graft-cal-${item.kind}`];
	if (position) classes.push("is-timed");
	if (item.id === state.selected) classes.push("is-selected");
	if (entry.continuesFromPrevious) classes.push("is-continued");
	if (entry.continuesToNext) classes.push("is-continuing");
	const chip = list.createEl("button", { cls: classes.join(" "), attr: { type: "button", "aria-pressed": String(item.id === state.selected), "aria-label": `${kindLabel[item.kind]}: ${time}, ${title}`, ...(position ? { style: position } : {}) } });
	if (!entry.allDay) chip.createEl("span", { text: time, cls: "graft-cal-time" });
	chip.createEl("span", { text: title, cls: "graft-cal-title" });
	chip.addEventListener("click", () => { state.selected = item.id === state.selected ? undefined : item.id; update(); });
}

function describe({ event, kind, planned, reason }: CalendarItem): string {
	const title = event.summary || "(No title)";
	if (kind === "skipped" || !planned) return `${title}: skipped. ${reason ?? "No reason given."}`;
	if (kind === "new") return `${title}: new note at ${planned.path}.`;
	if (kind === "unchanged") return `${title}: no changes to ${planned.path}.`;
	return `${title}: changes to ${planned.path}: ${planned.changes.map((change) => change.field).join(", ")}.`;
}
