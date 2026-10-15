import { DateTime } from "luxon";
import type { CalendarEvent } from "../types.ts";

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

/** Weeks start on Monday. */
export function weekStart(date: string): string {
	return addDays(date, 1 - DateTime.fromISO(date, { zone: "utc" }).weekday);
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
