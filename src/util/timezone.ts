import { DateTime } from "luxon";

export interface WallClock {
	date: string;
	time: string;
	week: string;
	month: string;
	year: string;
	weekday: string;
}

/** Converts an instant to date and time fields in the selected timezone. */
export function toWallClock(isoUtc: string, zone: string): WallClock {
	const dt = DateTime.fromISO(isoUtc, { zone: "utc" }).setZone(zone);
	return {
		date: dt.toFormat("yyyy-MM-dd"),
		time: dt.toFormat("HH:mm"),
		week: dt.toFormat("kkkk-'W'WW"),
		month: dt.toFormat("yyyy-MM"),
		year: dt.toFormat("yyyy"),
		weekday: dt.toFormat("cccc"),
	};
}

/** Derives date fields for an all-day event without timezone conversion. */
export function wallClockFromDate(isoDate: string): WallClock {
	const dt = DateTime.fromISO(isoDate);
	return {
		date: dt.toFormat("yyyy-MM-dd"),
		time: "00:00",
		week: dt.toFormat("kkkk-'W'WW"),
		month: dt.toFormat("yyyy-MM"),
		year: dt.toFormat("yyyy"),
		weekday: dt.toFormat("cccc"),
	};
}
