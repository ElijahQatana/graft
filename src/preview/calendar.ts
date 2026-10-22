import { DateTime } from "luxon";
import type { CalendarEvent } from "../types.ts";
import type { WeekDay } from "../util/weekStart.ts";

/** A timed event that crosses midnight gets an entry on each day it touches. */
export interface DayEntry<T> {
	item: T;
	allDay: boolean;
	/** Wall-clock start and end in the zone, HH:mm. Empty for all-day events. */
	startTime: string;
	endTime: string;
	continuesFromPrevious: boolean;
	continuesToNext: boolean;
}

export interface DayBucket<T> {
	/** Local date, YYYY-MM-DD. */
	date: string;
	/** All-day events first, then timed events by start. */
	entries: DayEntry<T>[];
}

const DAY = "yyyy-MM-dd";

export function addDays(date: string, days: number): string {
	return DateTime.fromISO(date, { zone: "utc" }).plus({ days }).toFormat(DAY);
}

export function dayRange(start: string, count: number): string[] {
	return Array.from({ length: count }, (_, index) => addDays(start, index));
}

/** The first day of the week holding `date`. `firstDay` is 0 for Sunday through 6 for Saturday. */
export function weekStart(date: string, firstDay: WeekDay): string {
	const weekday = DateTime.fromISO(date, { zone: "utc" }).weekday % 7;
	return addDays(date, -((weekday - firstDay + 7) % 7));
}

export function localDate(instant: Date, zone: string): string {
	return DateTime.fromJSDate(instant).setZone(zone).toFormat(DAY);
}

/**
 * Groups items by local day. Day boundaries come from the zone, so a day can be 23 or 25 hours long.
 * A timed event ending exactly at midnight does not reach the next day. All-day events use their
 * calendar dates as written, with an exclusive end, and ignore the zone.
 */
export function bucketByDay<T extends { event: CalendarEvent }>(items: T[], dates: string[], zone: string): DayBucket<T>[] {
	return dates.map((date) => {
		const dayStart = DateTime.fromISO(date, { zone }).startOf("day");
		const dayEnd = dayStart.plus({ days: 1 });
		const entries: DayEntry<T>[] = [];
		for (const item of items) {
			const { event } = item;
			if (event.allDay) {
				const last = event.end > event.start ? event.end : addDays(event.start, 1);
				if (event.start <= date && date < last) {
					entries.push({ item, allDay: true, startTime: "", endTime: "", continuesFromPrevious: event.start < date, continuesToNext: addDays(date, 1) < last });
				}
				continue;
			}
			const start = DateTime.fromISO(event.start, { zone: "utc" }).setZone(zone);
			const end = DateTime.fromISO(event.end, { zone: "utc" }).setZone(zone);
			const instant = end <= start;
			if (start >= dayEnd || (instant ? start < dayStart : end <= dayStart)) continue;
			entries.push({ item, allDay: false, startTime: start.toFormat("HH:mm"), endTime: end.toFormat("HH:mm"), continuesFromPrevious: start < dayStart, continuesToNext: !instant && end > dayEnd });
		}
		entries.sort((a, b) => Number(b.allDay) - Number(a.allDay)
			|| (a.allDay ? 0 : a.item.event.start.localeCompare(b.item.event.start)));
		return { date, entries };
	});
}

/** Times are minutes after local midnight. */
export interface TimedBlock<T> {
	entry: DayEntry<T>;
	startMin: number;
	/** At least MIN_BLOCK after startMin, to keep very short events clickable. */
	endMin: number;
	column: number;
	/** Slots in the group of overlapping events. */
	columns: number;
}

export interface HourRange {
	start: number;
	/** Exclusive, so 24 ends the day. */
	end: number;
}

export const MIN_BLOCK = 30;
export const DEFAULT_HOURS: HourRange = { start: 7, end: 20 };

function minutesOf(time: string): number {
	return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

/** Overlapping spans form a group with one slot count. A span that starts as another ends reuses its slot. */
export function assignColumns(spans: Array<{ start: number; end: number }>): Array<{ column: number; columns: number }> {
	const order = spans.map((_, index) => index).sort((a, b) => spans[a].start - spans[b].start || spans[b].end - spans[a].end || a - b);
	const result = spans.map(() => ({ column: 0, columns: 1 }));
	let group: number[] = [];
	let slotEnds: number[] = [];
	let groupEnd = -Infinity;
	const close = () => {
		for (const index of group) result[index].columns = slotEnds.length;
		group = [];
		slotEnds = [];
	};
	for (const index of order) {
		const { start, end } = spans[index];
		if (group.length && start >= groupEnd) close();
		let slot = slotEnds.findIndex((slotEnd) => slotEnd <= start);
		if (slot < 0) slot = slotEnds.length;
		slotEnds[slot] = end;
		result[index].column = slot;
		group.push(index);
		groupEnd = Math.max(groupEnd, end);
	}
	close();
	return result;
}

/**
 * Positions use the clock times in the zone, even on a daylight saving day. An event continuing from the day
 * before starts at midnight, and one continuing to the next day ends at midnight.
 */
export function layoutDay<T>(entries: DayEntry<T>[]): TimedBlock<T>[] {
	const timed = entries.filter((entry) => !entry.allDay).map((entry) => {
		const startMin = entry.continuesFromPrevious ? 0 : minutesOf(entry.startTime);
		const endMin = entry.continuesToNext ? 1440 : minutesOf(entry.endTime);
		return { entry, startMin, endMin: Math.min(1440, Math.max(endMin, startMin + MIN_BLOCK)) };
	});
	const slots = assignColumns(timed.map(({ startMin, endMin }) => ({ start: startMin, end: endMin })));
	return timed.map((block, index) => ({ ...block, ...slots[index] }));
}

/** The default hours, widened to whole hours that hold every block. */
export function visibleHours(blocks: Array<{ startMin: number; endMin: number }>, defaults: HourRange = DEFAULT_HOURS): HourRange {
	let { start, end } = defaults;
	for (const block of blocks) {
		start = Math.min(start, Math.floor(block.startMin / 60));
		end = Math.max(end, Math.ceil(block.endMin / 60));
	}
	return { start, end };
}

/** Minutes after local midnight for an instant in the zone, or undefined when it is not on the date. */
export function minuteOnDate(instant: Date, date: string, zone: string): number | undefined {
	const local = DateTime.fromJSDate(instant).setZone(zone);
	return local.toFormat(DAY) === date ? local.hour * 60 + local.minute : undefined;
}
