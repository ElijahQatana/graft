import { test } from "node:test";
import { strict as assert } from "node:assert";
const noIds = (calendars: Array<{ id: string }>) => calendars.map(({ id, ...rest }) => { assert.match(id, /^[a-z0-9]{1,40}$/); return rest; });
import {
	DEFAULT_SETTINGS, loadGraftSettings, isVaultPath, isFeedUrl, isCalendarUrl, sameCalendarName,
	isDayCount, isTimezone, isTitleRule, isFilenameRule,
} from "../../src/config/settings.ts";

test("empty and invalid settings get independent defaults", () => {
	for (const value of [undefined, null, {}, [], "invalid"]) assert.deepEqual(loadGraftSettings(value), DEFAULT_SETTINGS);
	const first = loadGraftSettings({});
	first.calendars.push({ id: "work", name: "Work", type: "google", url: "https://example.com/calendar.ics", invitedAs: "" });
	first.titleMatchRules.push({ mode: "exact", value: "Synthetic" });
	assert.deepEqual(loadGraftSettings({}), DEFAULT_SETTINGS);
});

test("partial nested settings preserve defaults and explicit false and zero", () => {
	const settings = loadGraftSettings({
		folders: { meeting: "Custom/Meetings" },
		templates: { meeting: "Templates/Meeting.md" },
		daysBack: 0, createPersonStubs: false, previewBeforeApply: false,
	});
	assert.deepEqual(settings.calendars, []);
	assert.equal(settings.folders.meeting, "Custom/Meetings");
	assert.equal(settings.folders.person, "People");
	assert.equal(settings.templates.meeting, "Templates/Meeting.md");
	assert.equal(settings.daysBack, 0);
	assert.equal(settings.createPersonStubs, false);
	assert.equal(settings.previewBeforeApply, false);
});

test("all settings survive JSON persistence without sharing input objects", () => {
	const saved = {
		...loadGraftSettings({}),
		calendars: [
			{ id: "work", name: "Work", type: "google" as const, url: "https://example.com/work.ics", invitedAs: "one@example.com" },
			{ id: "team", name: "Team", type: "outlook" as const, url: "https://example.com/team.ics", invitedAs: "two@example.com" },
		],
		folders: { meeting: "Custom/Meetings", person: "Custom/People", series: "Custom/Series", company: "Custom/Companies" },
		templates: { meeting: "Templates/Meeting.md", person: "Templates/Person.md", series: "Templates/Series.md" },
		ignoreListPath: "Config/ignore.json",
		titleMatchRules: [{ mode: "prefix" as const, value: "Private", caseSensitive: true }, { mode: "suffix" as const, value: "Skip", caseSensitive: false }],
		personFilenameRules: [{ domain: "example.com", style: "initialLast" as const }],
		meetingFilenamePattern: "{{date}} {{title}}", timezone: "Europe/London",
		daysBack: 0, daysAhead: 60, createPersonStubs: false, createSeriesStubs: false,
		companyLinking: true, strictCompanyLinks: false, acceptedOnly: true, mergeDuplicates: true, cleanInviteText: false, cancelVanishedSeries: true, previewBeforeApply: false, autoRunOnStartup: true,
	};
	assert.deepEqual(loadGraftSettings(JSON.parse(JSON.stringify(saved))), saved);
	const loaded = loadGraftSettings(saved);
	loaded.titleMatchRules[0].value = "Changed";
	loaded.personFilenameRules[0].domain = "example.org";
	assert.equal(saved.titleMatchRules[0].value, "Private");
	assert.equal(saved.personFilenameRules[0].domain, "example.com");
});

test("invalid saved values fall back without affecting valid siblings", () => {
	const loaded = loadGraftSettings({
		calendars: [
			{ name: "Bad URL", type: "google", url: "file:///private.ics", invitedAs: "one@example.com" },
			{ name: "No URL", type: "google", url: " ", invitedAs: "" },
			{ name: " ", type: "google", url: "https://example.com/a.ics", invitedAs: "" },
			{ name: "Bad type", type: "other", url: "https://example.com/b.ics", invitedAs: "" },
			"not an entry",
			{ name: "Good", type: "outlook", url: " https://example.com/c.ics ", invitedAs: 5 },
			{ name: " good ", type: "google", url: "https://example.com/d.ics", invitedAs: "dup@example.com" },
		],
		folders: { meeting: "../outside", person: "Custom/People" },
		templates: { meeting: "Templates/Meeting.txt" },
		ignoreListPath: "/absolute", syncLogPath: "Graft/log.txt", daysBack: -1, daysAhead: 1.5,
		timezone: "Invalid/Zone", autoRunOnStartup: "true", acceptedOnly: "yes", meetingFilenamePattern: " ",
		titleMatchRules: [{ mode: "exact", value: "" }],
		personFilenameRules: [{ domain: "example.com", style: "unknown" }],
	});
	assert.deepEqual(noIds(loaded.calendars), [{ name: "Good", type: "outlook", url: "https://example.com/c.ics", invitedAs: "" }]);
	assert.equal(loaded.folders.person, "Custom/People");
	assert.equal(loaded.folders.meeting, DEFAULT_SETTINGS.folders.meeting);
	assert.equal(loaded.templates.meeting, "");
	assert.equal(loaded.ignoreListPath, "");
	assert.equal(loaded.syncLogPath, "");
	assert.equal(loadGraftSettings({ syncLogPath: "Graft/Sync log.md" }).syncLogPath, "Graft/Sync log.md");
	assert.equal(loaded.daysBack, DEFAULT_SETTINGS.daysBack);
	assert.equal(loaded.daysAhead, DEFAULT_SETTINGS.daysAhead);
	assert.equal(loaded.timezone, "UTC");
	assert.equal(loaded.autoRunOnStartup, false);
	assert.equal(loaded.acceptedOnly, false);
	assert.equal(loaded.mergeDuplicates, false);
	assert.deepEqual(loaded.titleMatchRules, []);
	assert.deepEqual(loaded.personFilenameRules, []);
});

test("calendar validators require a URL and compare names without case", () => {
	assert.equal(isCalendarUrl(""), false);
	assert.equal(isCalendarUrl("  "), false);
	assert.equal(isCalendarUrl("https://user:password@example.com/feed"), false);
	assert.equal(isCalendarUrl("https://example.com/feed.ics"), true);
	assert.equal(sameCalendarName(" Work ", "work"), true);
	assert.equal(sameCalendarName("Work", "Home"), false);
});

test("validators reject unsafe paths, URLs, windows, and rule rows", () => {
	for (const path of ["../outside", "a/../b", "/absolute", "a\\b", "a//b", "a/./b", "a/", "a\u0000b", "C:/folder"]) assert.equal(isVaultPath(path), false);
	assert.equal(isVaultPath("Custom/People"), true);
	assert.equal(isVaultPath("", false), false);
	assert.equal(isVaultPath(""), true);
	for (const url of ["javascript:alert(1)", "not a URL", "https://user:password@example.com/feed"]) assert.equal(isFeedUrl(url), false);
	assert.equal(isFeedUrl("https://example.com/feed.ics?key=synthetic"), true);
	assert.equal(isFeedUrl(""), true);
	for (const count of [-1, 1.5, Infinity, NaN]) assert.equal(isDayCount(count), false);
	assert.equal(isDayCount(0), true);
	assert.equal(isTimezone("Invalid/Zone"), false);
	assert.equal(isTimezone("UTC"), true);
	assert.equal(isTitleRule({ mode: "contains", value: " " }), false);
	assert.equal(isTitleRule({ mode: "invalid", value: "Synthetic" }), false);
	assert.equal(isTitleRule({ mode: ["exact"], value: "Synthetic" }), false);
	assert.equal(isFilenameRule({ domain: "example.com", style: ["full"] }), false);
	assert.equal(isFilenameRule({ domain: "person@example.com", style: "full" }), false);
	assert.equal(isFilenameRule({ domain: "example.com", style: "firstOnly" }), true);
});

test("Company linking is off unless it was saved on", () => {
	for (const value of [undefined, null, {}, [], "invalid", { daysBack: 3 }, { strictCompanyLinks: false }]) assert.equal(loadGraftSettings(value).companyLinking, false);
	assert.equal(DEFAULT_SETTINGS.companyLinking, false);
});

test("a saved Company linking choice is kept either way", () => {
	assert.equal(loadGraftSettings({ companyLinking: true }).companyLinking, true);
	assert.equal(loadGraftSettings({ daysBack: 3, companyLinking: false }).companyLinking, false);
	assert.equal(loadGraftSettings({ daysBack: 3, companyLinking: "yes" }).companyLinking, false);
});

test("Strict Company links keeps its default and saved value whether linking is on or off", () => {
	assert.equal(loadGraftSettings({}).strictCompanyLinks, true);
	assert.equal(loadGraftSettings({ strictCompanyLinks: false }).strictCompanyLinks, false);
});

test("title prefixes default to forward and reply markers and reject bad saved values", () => {
	assert.deepEqual(loadGraftSettings({}).titlePrefixesToStrip, ["FW:", "Fwd:", "RE:"]);
	assert.deepEqual(loadGraftSettings({ titlePrefixesToStrip: [" Sent: ", ""] }).titlePrefixesToStrip, ["Sent:"]);
	assert.deepEqual(loadGraftSettings({ titlePrefixesToStrip: [] }).titlePrefixesToStrip, []);
	assert.deepEqual(loadGraftSettings({ titlePrefixesToStrip: [1] }).titlePrefixesToStrip, ["FW:", "Fwd:", "RE:"]);
});

test("scheduled sync settings default to off and every hour, and invalid values fall back", () => {
	assert.equal(DEFAULT_SETTINGS.scheduledSync, "off");
	assert.equal(DEFAULT_SETTINGS.syncIntervalMinutes, 60);
	const ok = loadGraftSettings({ scheduledSync: "notify", syncIntervalMinutes: 15 });
	assert.equal(ok.scheduledSync, "notify");
	assert.equal(ok.syncIntervalMinutes, 15);
	for (const bad of [14, 1441, 30.5, "30", null]) assert.equal(loadGraftSettings({ syncIntervalMinutes: bad }).syncIntervalMinutes, 60);
	assert.equal(loadGraftSettings({ scheduledSync: "automatic" }).scheduledSync, "automatic");
	assert.equal(loadGraftSettings({ scheduledSync: "sometimes" }).scheduledSync, "off");
	assert.equal(DEFAULT_SETTINGS.automaticMaxNotes, 25);
	assert.equal(loadGraftSettings({ automaticMaxNotes: 100 }).automaticMaxNotes, 100);
	for (const bad of [0, 501, 2.5, "25"]) assert.equal(loadGraftSettings({ automaticMaxNotes: bad }).automaticMaxNotes, 25);
});
