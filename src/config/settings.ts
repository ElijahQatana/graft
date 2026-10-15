import type { TitleMatchRule } from "../filters/titleMatch.ts";
import type { FilenameConventionRule } from "../generate/personStub.ts";
import { MINIMAL_SCHEMA, cloneSchema, loadSchema, type NoteSchema } from "./schema.ts";

export type CalendarType = "google" | "outlook";

export interface CalendarSettings {
	/** Stable, lowercase alphanumeric and unique. Names the calendar's secret when the URL is kept in secret storage. */
	id: string;
	/** Required and unique among calendars, ignoring case. Shown in the preview. */
	name: string;
	type: CalendarType;
	/** In memory this is the full feed URL. It is empty on a device whose secret storage holds no URL for the calendar. */
	url: string;
	invitedAs: string;
}

export function isCalendarId(value: unknown): value is string {
	return typeof value === "string" && /^[a-z0-9]{1,40}$/.test(value);
}

/** A new calendar id that is not in `taken`. */
export function newCalendarId(taken: Iterable<string>): string {
	const used = new Set(taken);
	for (;;) {
		const id = Array.from({ length: 12 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]).join("");
		if (!used.has(id)) return id;
	}
}

export interface GraftSettings {
	/** Synced in this order; when two calendars hold one event, the earlier one is used. */
	calendars: CalendarSettings[];
	folders: { meeting: string; person: string; series: string; company: string };
	/** Vault-relative Markdown template paths. Blank selects the built-in body. */
	templates: { meeting: string; person: string; series: string };
	ignoreListPath: string;
	titleMatchRules: TitleMatchRule[];
	personFilenameRules: FilenameConventionRule[];
	meetingFilenamePattern: string;
	timezone: string;
	daysBack: number;
	daysAhead: number;
	createPersonStubs: boolean;
	createSeriesStubs: boolean;
	/** Company matching, links and validation. Off on a new install; on for settings saved before it existed. */
	companyLinking: boolean;
	strictCompanyLinks: boolean;
	/** Skip events whose own RSVP is declined, tentative or not yet answered. Needs "invited as". */
	acceptedOnly: boolean;
	previewBeforeApply: boolean;
	autoRunOnStartup: boolean;
	/** Note types, property names and headings Graft reads and writes. */
	schema: NoteSchema;
}

export const DEFAULT_SETTINGS: GraftSettings = {
	calendars: [],
	folders: { meeting: "Meetings", person: "People", series: "Series", company: "Companies" },
	templates: { meeting: "", person: "", series: "" },
	ignoreListPath: "",
	titleMatchRules: [],
	personFilenameRules: [],
	meetingFilenamePattern: "{{title}} {{date}}",
	timezone: "UTC",
	daysBack: 7,
	daysAhead: 30,
	createPersonStubs: true,
	createSeriesStubs: true,
	companyLinking: false,
	strictCompanyLinks: true,
	acceptedOnly: false,
	previewBeforeApply: true,
	autoRunOnStartup: false,
	schema: cloneSchema(MINIMAL_SCHEMA),
};

export function isFeedUrl(value: string): boolean {
	if (!value.trim()) return true;
	try {
		const url = new URL(value);
		return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password;
	} catch {
		return false;
	}
}

/** A calendar needs a feed URL, unlike the optional URL fields elsewhere. */
export function isCalendarUrl(value: string): boolean {
	return value.trim().length > 0 && isFeedUrl(value);
}

export function isCalendarType(value: unknown): value is CalendarType {
	return value === "google" || value === "outlook";
}

export function sameCalendarName(left: string, right: string): boolean {
	return left.trim().toLowerCase() === right.trim().toLowerCase();
}

export function isVaultPath(value: string, allowEmpty = true): boolean {
	if (!value) return allowEmpty;
	// eslint-disable-next-line no-control-regex -- control characters are exactly what is rejected
	return value === value.trim() && !/^[/\\]|[\\\x00-\x1f]|:/.test(value)
		&& value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

export function isTimezone(value: string): boolean {
	try {
		new Intl.DateTimeFormat("en", { timeZone: value }).format();
		return value.length > 0;
	} catch {
		return false;
	}
}

export function isDayCount(value: number): boolean {
	return Number.isSafeInteger(value) && value >= 0;
}

export function isTitleRule(value: unknown): value is TitleMatchRule {
	const rule = record(value);
	return typeof rule.mode === "string" && ["exact", "prefix", "suffix", "contains"].includes(rule.mode)
		&& typeof rule.value === "string" && rule.value.trim().length > 0
		&& (rule.caseSensitive === undefined || typeof rule.caseSensitive === "boolean");
}

export function isFilenameRule(value: unknown): value is FilenameConventionRule {
	const rule = record(value);
	return typeof rule.domain === "string" && /^[a-z0-9-]+(?:\.[a-z0-9-]+)*$/i.test(rule.domain)
		&& typeof rule.style === "string" && ["full", "firstOnly", "initialLast"].includes(rule.style);
}

/** Restores valid saved fields while supplying fresh nested defaults for anything missing or invalid. */
export function loadGraftSettings(saved: unknown): GraftSettings {
	const result: GraftSettings = structuredClone(DEFAULT_SETTINGS);
	const input = record(saved);
	result.schema = loadSchema(input.schema, MINIMAL_SCHEMA);
	result.calendars = loadCalendars(input);
	const folders = record(input.folders);
	for (const key of ["meeting", "person", "series", "company"] as const) {
		const value = folders[key];
		if (typeof value === "string" && isVaultPath(value, false)) result.folders[key] = value;
	}
	const templates = record(input.templates);
	for (const key of ["meeting", "person", "series"] as const) {
		const value = templates[key];
		if (typeof value === "string" && isVaultPath(value) && (!value || value.endsWith(".md"))) result.templates[key] = value;
	}
	if (typeof input.ignoreListPath === "string" && isVaultPath(input.ignoreListPath)) result.ignoreListPath = input.ignoreListPath;
	if (Array.isArray(input.titleMatchRules) && input.titleMatchRules.every(isTitleRule)) {
		result.titleMatchRules = input.titleMatchRules.map((rule) => ({ mode: rule.mode, value: rule.value, caseSensitive: rule.caseSensitive ?? false }));
	}
	if (Array.isArray(input.personFilenameRules) && input.personFilenameRules.every(isFilenameRule)) {
		result.personFilenameRules = input.personFilenameRules.map((rule) => ({ domain: rule.domain.toLowerCase(), style: rule.style }));
	}
	if (typeof input.meetingFilenamePattern === "string" && input.meetingFilenamePattern.trim()) result.meetingFilenamePattern = input.meetingFilenamePattern;
	if (typeof input.timezone === "string" && isTimezone(input.timezone)) result.timezone = input.timezone;
	for (const key of ["daysBack", "daysAhead"] as const) {
		if (typeof input[key] === "number" && isDayCount(input[key])) result[key] = input[key];
	}
	for (const key of ["createPersonStubs", "createSeriesStubs", "companyLinking", "strictCompanyLinks", "acceptedOnly", "previewBeforeApply", "autoRunOnStartup"] as const) {
		if (typeof input[key] === "boolean") result[key] = input[key];
	}
	return result;
}

/** Reads the calendar list. Every calendar gets an id.
 * A saved calendar with an id may have no URL: it is in secret storage, or missing on this device. */
function loadCalendars(input: Record<string, unknown>): CalendarSettings[] {
	const calendars: CalendarSettings[] = [];
	const ids = new Set<string>();
	function add(candidate: Record<string, unknown>) {
		if (typeof candidate.name !== "string" || !candidate.name.trim() || !isCalendarType(candidate.type)) return;
		const hasId = isCalendarId(candidate.id);
		const url = typeof candidate.url === "string" ? candidate.url : "";
		if (url.trim() ? !isCalendarUrl(url) : !hasId) return;
		const name = candidate.name.trim();
		if (calendars.some((calendar) => sameCalendarName(calendar.name, name))) return;
		const id = hasId && !ids.has(candidate.id as string) ? candidate.id as string : newCalendarId(ids);
		ids.add(id);
		calendars.push({ id, name, type: candidate.type, url: url.trim(), invitedAs: typeof candidate.invitedAs === "string" ? candidate.invitedAs : "" });
	}
	if (Array.isArray(input.calendars)) {
		for (const entry of input.calendars) add(record(entry));
	}
	return calendars;
}

function record(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
