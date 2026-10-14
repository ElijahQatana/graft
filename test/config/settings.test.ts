import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
	DEFAULT_SETTINGS, loadGraftSettings, isVaultPath, isFeedUrl,
	isDayCount, isTimezone, isTitleRule, isFilenameRule,
} from "../../src/config/settings.ts";

test("empty and legacy settings get independent defaults", () => {
	for (const value of [undefined, null, {}, [], "invalid"]) assert.deepEqual(loadGraftSettings(value), DEFAULT_SETTINGS);
	const first = loadGraftSettings({});
	first.feeds.google.url = "https://example.com/calendar.ics";
	first.titleMatchRules.push({ mode: "exact", value: "Synthetic" });
	assert.deepEqual(loadGraftSettings({}), DEFAULT_SETTINGS);
});

test("partial nested settings preserve defaults and explicit false and zero", () => {
	const settings = loadGraftSettings({
		feeds: { google: { url: "https://example.com/calendar.ics" } },
		folders: { meeting: "Custom/Meetings" },
		templates: { meeting: "Templates/Meeting.md" },
		daysBack: 0, createPersonStubs: false, previewBeforeApply: false,
	});
	assert.equal(settings.feeds.google.url, "https://example.com/calendar.ics");
	assert.deepEqual(settings.feeds.outlook, DEFAULT_SETTINGS.feeds.outlook);
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
		feeds: { google: { url: "https://example.com/google.ics", invitedAs: "one@example.com" }, outlook: { url: "https://example.com/outlook.ics", invitedAs: "two@example.com" } },
		folders: { meeting: "Custom/Meetings", person: "Custom/People", series: "Custom/Series", company: "Custom/Companies" },
		templates: { meeting: "Templates/Meeting.md", person: "Templates/Person.md", series: "Templates/Series.md" },
		ignoreListPath: "Config/ignore.json",
		titleMatchRules: [{ mode: "prefix" as const, value: "Private", caseSensitive: true }, { mode: "suffix" as const, value: "Skip", caseSensitive: false }],
		personFilenameRules: [{ domain: "example.com", style: "initialLast" as const }],
		meetingFilenamePattern: "{{date}} {{title}}", timezone: "Europe/London",
		daysBack: 0, daysAhead: 60, createPersonStubs: false, createSeriesStubs: false,
		companyLinking: true, strictCompanyLinks: false, previewBeforeApply: false, autoRunOnStartup: true,
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
		feeds: { google: { url: "file:///private.ics", invitedAs: "one@example.com" } },
		folders: { meeting: "../outside", person: "Custom/People" },
		templates: { meeting: "Templates/Meeting.txt" },
		ignoreListPath: "/absolute", daysBack: -1, daysAhead: 1.5,
		timezone: "Invalid/Zone", autoRunOnStartup: "true", meetingFilenamePattern: " ",
		titleMatchRules: [{ mode: "exact", value: "" }],
		personFilenameRules: [{ domain: "example.com", style: "unknown" }],
	});
	assert.equal(loaded.feeds.google.url, "");
	assert.equal(loaded.feeds.google.invitedAs, "one@example.com");
	assert.equal(loaded.folders.person, "Custom/People");
	assert.equal(loaded.folders.meeting, DEFAULT_SETTINGS.folders.meeting);
	assert.equal(loaded.templates.meeting, "");
	assert.equal(loaded.ignoreListPath, "");
	assert.equal(loaded.daysBack, DEFAULT_SETTINGS.daysBack);
	assert.equal(loaded.daysAhead, DEFAULT_SETTINGS.daysAhead);
	assert.equal(loaded.timezone, "UTC");
	assert.equal(loaded.autoRunOnStartup, false);
	assert.deepEqual(loaded.titleMatchRules, []);
	assert.deepEqual(loaded.personFilenameRules, []);
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

test("Company linking is off for a new install and on for settings saved before it existed", () => {
	for (const value of [undefined, null, {}, [], "invalid"]) assert.equal(loadGraftSettings(value).companyLinking, false);
	assert.equal(DEFAULT_SETTINGS.companyLinking, false);
	assert.equal(loadGraftSettings({ daysBack: 3 }).companyLinking, true);
	assert.equal(loadGraftSettings({ strictCompanyLinks: false }).companyLinking, true);
	assert.equal(loadGraftSettings({ schema: {}, createPersonStubs: true }).companyLinking, true);
});

test("a saved Company linking choice is kept either way", () => {
	assert.equal(loadGraftSettings({ companyLinking: true }).companyLinking, true);
	assert.equal(loadGraftSettings({ daysBack: 3, companyLinking: false }).companyLinking, false);
	assert.equal(loadGraftSettings({ daysBack: 3, companyLinking: "yes" }).companyLinking, true);
});

test("Strict Company links keeps its default and saved value whether linking is on or off", () => {
	assert.equal(loadGraftSettings({}).strictCompanyLinks, true);
	assert.equal(loadGraftSettings({ strictCompanyLinks: false }).strictCompanyLinks, false);
});
