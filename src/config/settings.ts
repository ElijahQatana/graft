import type { TitleMatchRule } from "../filters/titleMatch.ts";
import type { FilenameConventionRule } from "../generate/personStub.ts";

export interface CalendarSettings {
	url: string;
	invitedAs: string;
}

export interface GraftSettings {
	feeds: { google: CalendarSettings; outlook: CalendarSettings };
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
	strictCompanyLinks: boolean;
	previewBeforeApply: boolean;
	autoRunOnStartup: boolean;
}

export const DEFAULT_SETTINGS: GraftSettings = {
	feeds: { google: { url: "", invitedAs: "" }, outlook: { url: "", invitedAs: "" } },
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
	strictCompanyLinks: true,
	previewBeforeApply: true,
	autoRunOnStartup: false,
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

export function isVaultPath(value: string, allowEmpty = true): boolean {
	if (!value) return allowEmpty;
	return value === value.trim() && !/^[\/\\]|[\\\x00-\x1f]|:/.test(value)
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

/** Restores valid saved fields while supplying fresh nested defaults for older settings. */
export function loadGraftSettings(saved: unknown): GraftSettings {
	const result: GraftSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
	const input = record(saved);
	const feeds = record(input.feeds);
	for (const key of ["google", "outlook"] as const) {
		const feed = record(feeds[key]);
		if (typeof feed.url === "string" && isFeedUrl(feed.url)) result.feeds[key].url = feed.url.trim();
		if (typeof feed.invitedAs === "string") result.feeds[key].invitedAs = feed.invitedAs;
	}
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
	for (const key of ["createPersonStubs", "createSeriesStubs", "strictCompanyLinks", "previewBeforeApply", "autoRunOnStartup"] as const) {
		if (typeof input[key] === "boolean") result[key] = input[key];
	}
	return result;
}

function record(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
