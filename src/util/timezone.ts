import { DateTime } from "luxon";

export interface WallClock {
	date: string;
	time: string;
	week: string;
	month: string;
	year: string;
	weekday: string;
}

/**
 * Converts a UTC instant to wall-clock date/time components in the
 * target zone. This is the piece that makes the vault schema's
 * cross-timezone filing rule actually work: an Outlook event that's
 * late evening UTC can be the previous calendar day once converted,
 * and filing by the converted date (not the raw UTC date) is the
 * whole point. The target zone is a parameter, not hardcoded to
 * America/New_York: which timezone a vault files meetings under is
 * that vault's own setting, not something this repo should assume.
 */
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

/**
 * An all-day event has no timezone to convert, its date is already a
 * plain calendar date (see ics/parse.ts). This derives the same
 * wall-clock fields from that date directly, with no zone involved.
 */
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
