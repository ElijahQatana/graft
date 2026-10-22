import { test, before } from "node:test";
import { strict as assert } from "node:assert";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";
import { loadGraftSettings } from "../../src/config/settings.ts";
import { ORIGINAL_SCHEMA } from "../../src/config/schema.ts";
import { buildWindowLabel } from "../../src/preview/summary.ts";

const now = new Date("2026-10-04T12:00:00Z");
class Clock extends Date {
	constructor(...args: any[]) { super(...((args.length ? args : [now.getTime()]) as [])); }
	static now() { return now.getTime(); }
}
class TFile {
	[key: string]: any;
	constructor(path: any) { this.path = path; this.basename = path.split("/").at(-1).slice(0, -3); }
}
class Element {
	tag = ""; children: any[] = []; listeners: Record<string, any> = {}; text = "";
	createEl(tag: any, options: any = {}) { const child = new Element(); child.tag = tag; child.text = options.text ?? ""; this.children.push(child); return child; }
	addEventListener(name: any, callback: any) { this.listeners[name] = callback; }
	empty() { this.children = []; }
}
const modals: any[] = [];
class Modal {
	[key: string]: any;
	contentEl = new Element();
	constructor(app: any) { this.app = app; }
	setTitle(title: any) { this.title = title; return this; }
	open() { modals.push(this); this.onOpen(); }
	close() { this.closed = true; this.onClose(); }
}
const notices: any[] = [];
const hidden: any[] = [];
class Notice { constructor(message: any) { notices.push(message); this.message = message; } message: any; hide() { hidden.push(this.message); } }
const platform = { isMobile: false };
const statusBar: any[] = [];
let onStatusItem: (() => void) | undefined;
const timers: Array<{ id: number; ms: number; cleared: boolean }> = [];
const fakeWindow = {
	setInterval(_callback: any, ms: number) { const id = timers.length + 1; timers.push({ id, ms, cleared: false }); return id; },
	clearInterval(id: number) { const timer = timers.find((item) => item.id === id); if (timer) timer.cleared = true; },
};
function fakeElement(): any {
	const el: any = { children: [], listeners: {}, createSpan(options: any) { const c = fakeElement(); c.text = options?.text; el.children.push(c); return c; }, createEl(_tag: string, options: any) { const c = fakeElement(); c.text = options?.text; el.children.push(c); return c; }, addEventListener(name: string, callback: any) { el.listeners[name] = callback; } };
	return el;
}
const fakeCreateFragment = (build: (fragment: any) => void) => { const fragment = fakeElement(); build(fragment); return fragment; };
class Plugin {
	[key: string]: any;
	constructor(app: any) { this.app = app; this.commands = []; }
	addCommand(command: any) { this.commands.push(command); }
	registerView() {}
	addRibbonIcon() {}
	registerInterval(id: number) { return id; }
	addStatusBarItem() {
		const item: any = { spans: [], listeners: {}, classes: [], addClass(...names: string[]) { item.classes.push(...names); }, setAttribute() {}, addEventListener(name: string, callback: any) { item.listeners[name] = callback; }, createSpan(options: any) { item.spans.push(options); return {}; }, remove() { statusBar.splice(statusBar.indexOf(item), 1); } };
		statusBar.push(item);
		const hook = onStatusItem; onStatusItem = undefined; hook?.();
		return item;
	}
	addSettingTab() {}
	async loadData() { return {}; }
	async saveData() {}
}
class PluginSettingTab {}
const feeds = new Map<string, string>();
let onRequest: (() => void) | undefined;
class ItemView {}
const obsidian = { addIcon() {}, TFile, Modal, Notice, ItemView, Platform: platform, Plugin, PluginSettingTab, Setting: class {}, parseYaml: JSON.parse, stringifyYaml: (value: any) => JSON.stringify(value) + "\n", requestUrl: async ({ url }: any) => (onRequest?.(), { status: feeds.has(url) ? 200 : 500, text: feeds.get(url) ?? "" }) };
async function load(entry: string): Promise<any> {
	const result = await build({ entryPoints: [entry], bundle: true, write: false, platform: "node", format: "cjs", external: ["obsidian"] });
	const module: { exports: any } = { exports: {} };
	runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require: () => obsidian, URL, Intl, structuredClone, Date: Clock, window: fakeWindow, createFragment: fakeCreateFragment });
	return module.exports;
}
let prepareSync: any;
let applySync: any;
let GraftPlugin: any;
before(async () => {
	({ prepareSync, applySync } = await load("src/sync/flow.ts"));
	({ default: GraftPlugin } = await load("src/main.ts"));
});
const clean = (value: any) => JSON.parse(JSON.stringify(value));
function note(fields: any, body = "") { return `---\n${JSON.stringify(fields)}\n---\n${body}`; }
function fields(text: any) { return JSON.parse(text.match(/^---\n([\s\S]*?)\n---/)![1]); }
function calendar(uid: any, title = "Synthetic meeting", extra = "") {
	return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Example//Graft//EN\r\nBEGIN:VEVENT\r\nUID:${uid}\r\nDTSTART:20261004T140000Z\r\nDTEND:20261004T143000Z\r\nSUMMARY:${title}\r\nORGANIZER;CN=Alex Example:mailto:alex@example.com\r\nATTENDEE;CN=Pat Example:mailto:pat@example.com\r\nDESCRIPTION:New agenda\r\n${extra}END:VEVENT\r\nEND:VCALENDAR\r\n`;
}
function fixture() {
	const files = new Map<string, any>(); const texts = new Map<string, any>(); const writes: string[] = [];
	function put(path: any, text: any) { files.set(path, new TFile(path)); texts.set(path, text); }
	const app = {
		vault: {
			getMarkdownFiles: () => [...files.values()].filter((file) => file instanceof TFile),
			getAbstractFileByPath: (path: any) => files.get(path) ?? null,
			async read(file: any) { if (!texts.has(file.path)) throw new Error("Missing synthetic file"); return texts.get(file.path); },
			async create(path: any, text: any) { assert.equal(files.has(path), false); put(path, text); writes.push(path); return files.get(path); },
			async createFolder(path: any) { assert.equal(files.has(path), false); files.set(path, { path }); },
			async process(file: any, update: any) { texts.set(file.path, update(texts.get(file.path))); writes.push(file.path); },
		},
		fileManager: { async processFrontMatter(file: any, update: any) { const text = texts.get(file.path); const data = fields(text); update(data); texts.set(file.path, note(data, text.split(/\n---\n/)[1])); writes.push(file.path); } },
		workspace: { ready: undefined as any, onLayoutReady(callback: any) { this.ready = callback; } },
	};
	const settings = loadGraftSettings({
		calendars: [
			{ id: "google", name: "Google", type: "google", url: "https://example.com/google.ics", invitedAs: "one@example.com" },
			{ id: "outlook", name: "Outlook", type: "outlook", url: "https://example.com/outlook.ics", invitedAs: "two@example.com" },
		],
		schema: ORIGINAL_SCHEMA, companyLinking: true, daysBack: 0, daysAhead: 2,
	});
	const fetch = async (url: any) => url.includes("google") ? calendar("google@example.com", "Google sample", "RRULE:FREQ=DAILY;COUNT=2\r\n") : calendar("outlook@example.com", "Outlook sample");
	return { app, settings, fetch, files, texts, writes, put };
}

const calendarEntry = (name: any, type: any, invitedAs: any): any => ({ name, type, url: `https://example.com/${name.toLowerCase()}.ics`, invitedAs });

test("two calendars sync with their own invited-as identities", async () => {
	const f = fixture();
	assert.deepEqual(clean(f.settings.calendars.map(({ name, invitedAs }) => [name, invitedAs])), [["Google", "one@example.com"], ["Outlook", "two@example.com"]]);
	const prepared = await prepareSync(f.app, f.settings, f.fetch, now);
	const invitedAs = prepared.preview.newMeetings.map(({ note }: any) => note.frontmatter.invited_as);
	assert.deepEqual(clean(invitedAs).sort(), ["one@example.com", "one@example.com", "two@example.com"]);
});

test("the preview window comes from the days back and ahead settings", async () => {
	const f = fixture();
	f.settings.daysBack = 3;
	const { preview } = await prepareSync(f.app, f.settings, f.fetch, now);
	assert.equal(preview.window.daysBack, 3);
	assert.equal(preview.window.daysAhead, 2);
	assert.equal(buildWindowLabel(preview.window), "Covers 1 Oct to 6 Oct 2026 (3 days back, 2 ahead).");
});

test("sync with no calendars asks for one and writes nothing", async () => {
	const f = fixture();
	f.settings.calendars = [];
	await assert.rejects(() => prepareSync(f.app, f.settings, f.fetch, now), /Add a calendar in Graft settings/);
	assert.equal(f.writes.length, 0);
	const blank = loadGraftSettings({ calendars: [] });
	await assert.rejects(() => prepareSync(f.app, blank, f.fetch, now), /Add a calendar in Graft settings/);
});

test("sync with one calendar reads only that calendar", async () => {
	const f = fixture();
	f.settings.calendars = [calendarEntry("Outlook", "outlook", "two@example.com")];
	const requested: string[] = [];
	const prepared = await prepareSync(f.app, f.settings, async (url: any) => { requested.push(url); return f.fetch(url); }, now);
	assert.deepEqual(requested, ["https://example.com/outlook.ics"]);
	assert.equal(prepared.preview.newMeetings.length, 1);
	assert.equal(prepared.preview.newMeetings[0].note.frontmatter.invited_as, "two@example.com");
	await applySync(f.app, prepared);
	assert.equal(fields(f.texts.get(prepared.preview.newMeetings[0].path)).invited_as, "two@example.com");
});

test("several calendars each write their own invited_as, even with the same type", async () => {
	const f = fixture();
	f.settings.calendars = [calendarEntry("Work", "google", "work@example.com"), calendarEntry("Team", "google", "team@example.com"), calendarEntry("Home", "outlook", "home@example.com")];
	const fetch = async (url: any) => calendar(`${url.split("/").at(-1)}`, `Meeting from ${url.split("/").at(-1)}`);
	const prepared = await prepareSync(f.app, f.settings, fetch, now);
	const byTitle = Object.fromEntries(prepared.preview.newMeetings.map(({ note }: any) => [note.frontmatter.title, note.frontmatter.invited_as]));
	assert.deepEqual(clean(byTitle), { "Meeting from work.ics": "work@example.com", "Meeting from team.ics": "team@example.com", "Meeting from home.ics": "home@example.com" });
	assert.equal(prepared.canApply, true);
	await applySync(f.app, prepared);
});

test("one event in several calendars becomes one Meeting note from the earliest calendar", async () => {
	const f = fixture();
	f.settings.calendars = [calendarEntry("Work", "google", "work@example.com"), calendarEntry("Home", "outlook", "home@example.com")];
	const fetch = async (url: any) => calendar("shared@example.com", url.includes("work") ? "Shared meeting" : "Shared meeting copy");
	const prepared = await prepareSync(f.app, f.settings, fetch, now);
	assert.equal(prepared.preview.newMeetings.length, 1);
	assert.equal(prepared.preview.newMeetings[0].note.frontmatter.title, "Shared meeting");
	assert.equal(prepared.preview.newMeetings[0].note.frontmatter.invited_as, "work@example.com");
	assert.deepEqual(clean(prepared.preview.skipped.map(({ event, reason }: any) => [event.source, reason])), [["Home", "Same event as one in Work"]]);
	assert.equal(prepared.canApply, true);
	await applySync(f.app, prepared);
	assert.equal(f.writes.filter((path) => path.startsWith("Meetings/")).length, 1);
	// Reordering the list changes which calendar is used.
	f.settings.calendars.reverse();
	const reordered = await prepareSync(f.app, f.settings, fetch, now);
	assert.equal(reordered.preview.updates.length, 1);
	assert.deepEqual(clean(reordered.preview.updates[0].changes.map(({ field, after }: any) => [field, after]).filter(([field]: any) => field === "invited_as" || field === "title")), [["title", "Shared meeting copy"], ["invited_as", "home@example.com"]]);
	assert.equal(reordered.preview.warnings.some((item: any) => item.kind === "vanished-event"), false);
	await applySync(f.app, reordered);
});

test("an existing Meeting note for a shared event is updated once, not reported as a conflict", async () => {
	const f = fixture();
	f.settings.calendars = [calendarEntry("Work", "google", "work@example.com"), calendarEntry("Home", "outlook", "home@example.com")];
	f.put("Meetings/Shared.md", note({ type: "Meeting", ics_uid: "shared@example.com", title: "Old", date: "2026-10-04", invited_as: "work@example.com" }, "## Invite Agenda\n\nOld"));
	const prepared = await prepareSync(f.app, f.settings, async () => calendar("shared@example.com", "Shared meeting"), now);
	assert.equal(prepared.preview.updates.length, 1);
	assert.equal(prepared.preview.newMeetings.length, 0);
	await applySync(f.app, prepared);
	assert.equal(fields(f.texts.get("Meetings/Shared.md")).title, "Shared meeting");
});

test("a failing calendar is named in the preview error and its URL is never shown", async () => {
	const f = fixture();
	f.settings.calendars = [calendarEntry("Work", "google", "work@example.com"), calendarEntry("Broken", "outlook", "broken@example.com")];
	const fetch = async (url: any) => { if (url.includes("broken")) throw new Error(url); return calendar("work@example.com", "Work meeting"); };
	const prepared = await prepareSync(f.app, f.settings, fetch, now);
	assert.equal(prepared.canApply, false);
	assert.deepEqual(clean(prepared.preview.errors), [{ feed: "Broken", message: "Calendar feed could not be fetched or parsed." }]);
	const { SyncPreviewModal } = await load("src/preview/modal.ts");
	const modal = new SyncPreviewModal(f.app, prepared.preview, undefined, () => {});
	modal.open();
	const text = elements(modal.contentEl).map((item) => item.text).join("\n");
	assert.match(text, /Broken: Calendar feed could not be fetched or parsed/);
	assert.equal(text.includes("broken.ics"), false);
	assert.equal(text.includes("https://"), false);
});

test("vanished events are checked against every configured calendar's identity", async () => {
	const f = fixture();
	f.settings.calendars = [calendarEntry("Work", "google", "work@example.com"), calendarEntry("Home", "outlook", "home@example.com")];
	f.put("Meetings/Gone.md", note({ type: "Meeting", ics_uid: "gone@example.com", title: "Gone", date: "2026-10-04", invited_as: "home@example.com" }));
	f.put("Meetings/Other.md", note({ type: "Meeting", ics_uid: "other@example.com", title: "Other", date: "2026-10-04", invited_as: "removed@example.com" }));
	const prepared = await prepareSync(f.app, f.settings, async () => calendar("here@example.com"), now);
	assert.deepEqual(clean(prepared.preview.warnings.filter((item: any) => item.kind === "vanished-event")), [{ kind: "vanished-event", subject: "Meetings/Gone.md" }]);
});

test("a vanished series is marked cancelled only when the setting is on and every guard rail holds", async () => {
	const meeting = (uid: string, date: string, extra: any = {}) => note({ type: "Meeting", ics_uid: uid, title: uid, date, invited_as: "one@example.com", occurrence_status: "Scheduled", ...extra }, "## Invite Agenda\n\nOld");
	const setup = () => {
		const f = fixture();
		f.settings.cancelVanishedSeries = true;
		f.put("Meetings/Gone.md", meeting("gone@example.com", "2026-10-05", { ics_recurrence_id: "20261005T140000Z" }));
		f.put("Meetings/Gone 2.md", meeting("gone@example.com", "2026-10-06", { ics_recurrence_id: "20261006T140000Z" }));
		f.put("Meetings/Single.md", meeting("single@example.com", "2026-10-05", { ics_recurrence_id: "20261005T140000Z" }));
		f.put("Meetings/OneOff.md", meeting("oneoff@example.com", "2026-10-05"));
		f.put("Meetings/Today.md", meeting("today@example.com", "2026-10-04"));
		f.put("Meetings/Partial.md", meeting("here@example.com", "2026-10-05", { ics_recurrence_id: "20261005T140000Z" }));
		f.put("Meetings/Far.md", meeting("far@example.com", "2026-10-20"));
		return f;
	};
	const feed = async () => calendar("here@example.com");
	const f = setup();
	const prepared = await prepareSync(f.app, f.settings, feed, now);
	assert.deepEqual(clean(prepared.preview.updates.filter((item: any) => item.path === "Meetings/Gone.md")), [{ path: "Meetings/Gone.md", changes: [{ field: "occurrence_status", before: "Scheduled", after: "Cancelled" }] }]);
	assert.deepEqual(clean(prepared.preview.warnings.filter((item: any) => item.kind === "vanished-event").map((item: any) => item.subject).sort()), ["Meetings/OneOff.md", "Meetings/Partial.md", "Meetings/Single.md", "Meetings/Today.md"]);
	await applySync(f.app, prepared);
	assert.equal(fields(f.texts.get("Meetings/Gone.md")).occurrence_status, "Cancelled");
	assert.equal(fields(f.texts.get("Meetings/Gone 2.md")).occurrence_status, "Cancelled");
	for (const path of ["Meetings/Single.md", "Meetings/OneOff.md", "Meetings/Today.md", "Meetings/Partial.md", "Meetings/Far.md"]) assert.equal(fields(f.texts.get(path)).occurrence_status, "Scheduled");
	assert.ok(f.files.has("Meetings/Gone.md"));
	const off = setup();
	off.settings.cancelVanishedSeries = false;
	const plain = await prepareSync(off.app, off.settings, feed, now);
	assert.equal(plain.preview.updates.some((item: any) => item.path === "Meetings/Gone.md"), false);
	assert.ok(plain.preview.warnings.some((item: any) => item.subject === "Meetings/Gone.md"));
	const failed = setup();
	const broken = await prepareSync(failed.app, failed.settings, async () => { throw new Error("Synthetic feed failure"); }, now);
	assert.equal(broken.preview.updates.some((item: any) => item.path === "Meetings/Gone.md"), false);
	assert.equal(broken.canApply, false);
});

test("a one-off range replaces the window for one plan and leaves the settings alone", async () => {
	const f = fixture();
	const before = JSON.stringify(f.settings);
	const wide = await prepareSync(f.app, f.settings, f.fetch, now, { daysBack: 10, daysAhead: 19 });
	assert.equal(buildWindowLabel(wide.preview.window), "Covers 24 Sep to 23 Oct 2026 (10 days back, 19 ahead).");
	assert.equal(JSON.stringify(f.settings), before);
	assert.equal(f.settings.daysBack, 0);
	const same = await prepareSync(f.app, f.settings, f.fetch, now);
	assert.equal(buildWindowLabel(same.preview.window), "Covers 4 Oct to 6 Oct 2026 (0 days back, 2 ahead).");
});

test("a one-off range reads the feeds again and plans only events inside it", async () => {
	const f = fixture();
	let reads = 0;
	const fetch = async (url: any) => { reads++; return f.fetch(url); };
	await prepareSync(f.app, f.settings, fetch, now);
	await prepareSync(f.app, f.settings, fetch, now, { daysBack: 0, daysAhead: 6 });
	assert.equal(reads, 4);
	const day = (date: string) => calendar("one@example.com").replaceAll("20261004", date);
	const early = await prepareSync(f.app, f.settings, async () => day("20261001"), now, { daysBack: 3, daysAhead: 0 });
	assert.equal(early.preview.newMeetings.length > 0, true);
	const outside = await prepareSync(f.app, f.settings, async () => day("20261001"), now);
	assert.equal(outside.preview.newMeetings.length, 0);
});

test("a one-off range over 30 days or with bad numbers is refused before any feed is read", async () => {
	const f = fixture();
	let reads = 0;
	const fetch = async (url: any) => { reads++; return f.fetch(url); };
	await assert.rejects(() => prepareSync(f.app, f.settings, fetch, now, { daysBack: 0, daysAhead: 30 }), /at most 30 days/);
	await assert.rejects(() => prepareSync(f.app, f.settings, fetch, now, { daysBack: -1, daysAhead: 3 }), /whole numbers/);
	assert.equal(reads, 0);
	await prepareSync(f.app, f.settings, fetch, now, { daysBack: 0, daysAhead: 29 });
	assert.ok(reads > 0);
});

test("vanished-event warnings follow the range of the preview, on both edges", async () => {
	const f = fixture();
	const meeting = (uid: string, date: string) => note({ type: "Meeting", ics_uid: uid, title: uid, date, invited_as: "one@example.com", occurrence_status: "Scheduled" }, "## Invite Agenda\n\nOld");
	for (const [name, date] of [["Before", "2026-09-30"], ["First", "2026-10-01"], ["Last", "2026-10-07"], ["After", "2026-10-08"]]) f.put(`Meetings/${name}.md`, meeting(`${name.toLowerCase()}@example.com`, date));
	const feed = async () => calendar("here@example.com");
	const vanished = async (range?: any) => clean((await prepareSync(f.app, f.settings, feed, now, range)).preview.warnings.filter((item: any) => item.kind === "vanished-event").map((item: any) => item.subject).sort());
	assert.deepEqual(await vanished({ daysBack: 3, daysAhead: 3 }), ["Meetings/First.md", "Meetings/Last.md"]);
	assert.deepEqual(await vanished({ daysBack: 2, daysAhead: 2 }), []);
	assert.deepEqual(await vanished({ daysBack: 4, daysAhead: 4 }), ["Meetings/After.md", "Meetings/Before.md", "Meetings/First.md", "Meetings/Last.md"].sort());
	assert.deepEqual(await vanished(), []);
});

test("a narrower or wider range never cancels a series with an occurrence in range and one out", async () => {
	const meeting = (uid: string, date: string, extra: any = {}) => note({ type: "Meeting", ics_uid: uid, title: uid, date, invited_as: "one@example.com", occurrence_status: "Scheduled", ...extra }, "## Invite Agenda\n\nOld");
	const setup = () => {
		const f = fixture();
		f.settings.cancelVanishedSeries = true;
		f.put("Meetings/Series Later.md", meeting("series@example.com", "2026-10-06", { ics_recurrence_id: "20261006T140000Z" }));
		f.put("Meetings/Gone 5.md", meeting("gone@example.com", "2026-10-05", { ics_recurrence_id: "20261005T140000Z" }));
		f.put("Meetings/Gone 6.md", meeting("gone@example.com", "2026-10-06", { ics_recurrence_id: "20261006T140000Z" }));
		return f;
	};
	// The feed has this series on 4 and 5 Oct only; the note for 6 Oct is a later date the feed no longer lists.
	const feed = async () => calendar("series@example.com", "Series", "RRULE:FREQ=DAILY;COUNT=2\r\n");
	const status = async (range: any, path: string) => {
		const f = setup();
		const prepared = await prepareSync(f.app, f.settings, feed, now, range);
		return { cancelled: prepared.preview.updates.some((item: any) => item.path === path && item.changes.some((change: any) => change.after === "Cancelled")), warned: prepared.preview.warnings.some((item: any) => item.subject === path) };
	};
	// 6 Oct is the last day of this range: the series still has occurrences seen, so only a warning.
	assert.deepEqual(await status({ daysBack: 0, daysAhead: 2 }, "Meetings/Series Later.md"), { cancelled: false, warned: true });
	// 6 Oct is one day past the range: nothing is said about it.
	assert.deepEqual(await status({ daysBack: 0, daysAhead: 1 }, "Meetings/Series Later.md"), { cancelled: false, warned: false });
	assert.deepEqual(await status({ daysBack: 0, daysAhead: 29 }, "Meetings/Series Later.md"), { cancelled: false, warned: true });
	// A series with nothing left is cancelled only when two of its dates are inside the range.
	assert.deepEqual(await status({ daysBack: 0, daysAhead: 2 }, "Meetings/Gone 6.md"), { cancelled: true, warned: false });
	assert.deepEqual(await status({ daysBack: 0, daysAhead: 2 }, "Meetings/Gone 5.md"), { cancelled: true, warned: false });
	// One day shorter, only one date is inside, so it is a warning and nothing is cancelled.
	assert.deepEqual(await status({ daysBack: 0, daysAhead: 1 }, "Meetings/Gone 5.md"), { cancelled: false, warned: true });
	assert.deepEqual(await status({ daysBack: 0, daysAhead: 1 }, "Meetings/Gone 6.md"), { cancelled: false, warned: false });
	assert.deepEqual(await status({ daysBack: 0, daysAhead: 0 }, "Meetings/Gone 5.md"), { cancelled: false, warned: false });
});

test("a failed feed or an ambiguous person still blocks Apply on a one-off range", async () => {
	const range = { daysBack: 1, daysAhead: 10 };
	const failing = fixture();
	const broken = await prepareSync(failing.app, failing.settings, async (url: any) => { if (url.includes("outlook")) throw new Error("synthetic"); return failing.fetch(url); }, now, range);
	assert.equal(broken.canApply, false);
	await assert.rejects(() => applySync(failing.app, broken), /sync plan has errors/);
	const people = fixture();
	for (const name of ["First", "Second"]) people.put(`People/${name}.md`, note({ type: "Person", email: "alex@example.com" }));
	const ambiguous = await prepareSync(people.app, people.settings, people.fetch, now, range);
	assert.equal(ambiguous.canApply, false);
	assert.equal(failing.writes.length + people.writes.length, 0);
});

test("Apply on a one-off range writes that range's plan, and a repeat sync changes nothing", async () => {
	const f = fixture();
	const range = { daysBack: 0, daysAhead: 9 };
	const prepared = await prepareSync(f.app, f.settings, f.fetch, now, range);
	assert.equal(prepared.canApply, true);
	await applySync(f.app, prepared);
	const written = f.writes.length;
	assert.ok(written > 0);
	const repeat = await prepareSync(f.app, f.settings, f.fetch, now, range);
	assert.equal(repeat.preview.newMeetings.length, 0);
	assert.equal(repeat.preview.updates.every((item: any) => item.changes.length === 0), true);
});

test("an invite moved to another day updates the note's date without a vanished-event warning", async () => {
	const f = fixture();
	f.settings.calendars = [calendarEntry("Work", "google", "work@example.com")];
	f.put("Meetings/Moved.md", note({ type: "Meeting", ics_uid: "moved@example.com", title: "Moved", date: "2026-10-02", invited_as: "work@example.com" }, "## Invite Agenda\n\nOld"));
	const prepared = await prepareSync(f.app, f.settings, async () => calendar("moved@example.com", "Moved"), now);
	assert.deepEqual(clean(prepared.preview.updates[0].changes.find((item: any) => item.field === "date")), { field: "date", before: "2026-10-02", after: "2026-10-04" });
	assert.equal(prepared.preview.warnings.some((item: any) => item.kind === "vanished-event"), false);
	await applySync(f.app, prepared);
	assert.equal(fields(f.texts.get("Meetings/Moved.md")).date, "2026-10-04");
});

test("two feeds preview without writes, apply matches preview, and repeat sync reuses stubs", async () => {
	const f = fixture();
	const prepared = await prepareSync(f.app, f.settings, f.fetch, now);
	assert.equal(f.writes.length, 0);
	assert.equal(prepared.preview.newMeetings.length, 3);
	assert.equal(prepared.preview.personStubs.length, 2);
	assert.equal(prepared.preview.seriesStubs.length, 1);
	await applySync(f.app, prepared);
	for (const { path, note: expected } of prepared.preview.newMeetings) {
		assert.deepEqual(fields(f.texts.get(path)), clean(expected.frontmatter));
		assert.ok(f.texts.get(path).endsWith(expected.body));
	}
	for (const { path, stub } of [...prepared.preview.personStubs, ...prepared.preview.seriesStubs]) assert.deepEqual(fields(f.texts.get(path)), clean(stub.frontmatter));
	const again = await prepareSync(f.app, f.settings, f.fetch, now);
	assert.equal(again.preview.newMeetings.length, 0);
	assert.equal(again.preview.personStubs.length, 0);
	assert.equal(again.preview.seriesStubs.length, 0);
	assert.equal(again.preview.updates.every((item: any) => item.changes.length === 0), true);
	const count = f.writes.length;
	await applySync(f.app, again);
	assert.equal(f.writes.length, count);
});

test("preview feature flags come from settings", async () => {
	const cases = [
		[{}, { personStubs: true, seriesStubs: true, skipped: false }],
		[{ createPersonStubs: false }, { personStubs: false, seriesStubs: true, skipped: false }],
		[{ createSeriesStubs: false }, { personStubs: true, seriesStubs: false, skipped: false }],
		[{ ignoreListPath: "Ignore.md" }, { personStubs: true, seriesStubs: true, skipped: true }],
		[{ titleMatchRules: [{ mode: "contains", value: "sample" }] }, { personStubs: true, seriesStubs: true, skipped: true }],
	];
	for (const [override, expected] of cases) {
		const f = fixture();
		if ((override as any).ignoreListPath) f.put((override as any).ignoreListPath, "");
		const settings = { ...f.settings, ...override };
		const prepared = await prepareSync(f.app, settings, f.fetch, now);
		assert.deepEqual(clean(prepared.preview.features), expected);
		assert.deepEqual(clean(prepared.input.features), expected);
	}
});

test("updates preserve handwritten fields and body, use existing Series agenda and Company links", async () => {
	const f = fixture();
	f.put("People/Alex Example.md", note({ type: "Person", email_aliases: ["alex@example.com"], company: ["[[Example Co]]", "[[Missing]]"] }));
	f.put("Companies/Example Co.md", note({ type: "Company", domain: "example.com" }));
	f.put("Series/Existing.md", note({ type: "Series", google_recurring_event_id: "google@example.com" }, "## Standing Agenda\n\nStanding example"));
	f.put("Meetings/Original.md", note({ type: "Meeting", ics_uid: "outlook@example.com", title: "Old title", date: "2026-10-04", participants: ["[[Manual]]"], actual_start: "13:59" }, "## Invite Agenda\n\nOld agenda\n\n# Human Notes (yay)\nKeep this"));
	const prepared = await prepareSync(f.app, f.settings, f.fetch, now);
	assert.equal(prepared.preview.warnings.some((item: any) => item.kind === "unresolved-company"), true);
	assert.ok(prepared.preview.newMeetings[0].note.body.includes("Standing example"));
	await applySync(f.app, prepared);
	const actual = fields(f.texts.get("Meetings/Original.md"));
	assert.equal(actual.title, "Outlook sample");
	assert.equal(actual.actual_start, "13:59");
	assert.deepEqual(actual.participants, ["[[Manual]]"]);
	assert.deepEqual(actual.companies, ["[[Example Co]]"]);
	assert.ok(f.texts.get("Meetings/Original.md").includes("Keep this"));
});

test("with Company linking off there is no Company matching, warning or company property", async () => {
	const f = fixture();
	f.settings.companyLinking = false;
	f.put("People/Alex Example.md", note({ type: "Person", email_aliases: ["alex@example.com"], company: ["[[Example Co]]", "[[Missing]]"] }));
	f.put("Companies/Example Co.md", note({ type: "Company", domain: "example.com" }));
	f.put("Meetings/Original.md", note({ type: "Meeting", ics_uid: "outlook@example.com", title: "Old title", date: "2026-10-04", companies: ["[[Handwritten]]"] }, "## Invite Agenda\n\nOld agenda"));
	const prepared = await prepareSync(f.app, f.settings, f.fetch, now);
	assert.deepEqual(clean(prepared.input.companies), []);
	assert.equal(prepared.input.strictCompanyLinks, false);
	assert.equal(prepared.preview.warnings.some((item: any) => item.kind === "unresolved-company"), false);
	assert.ok(prepared.input.personStubs.length > 0);
	for (const { stub } of prepared.input.personStubs) assert.equal("company" in stub.frontmatter, false);
	for (const { note: created } of prepared.preview.newMeetings) assert.equal("companies" in created.frontmatter, false);
	await applySync(f.app, prepared);
	assert.deepEqual(fields(f.texts.get("Meetings/Original.md")).companies, ["[[Handwritten]]"]);
	assert.equal(fields(f.texts.get("Meetings/Original.md")).title, "Outlook sample");
});

test("with Company linking on a new Person stub links the matching Company and strict links apply", async () => {
	const f = fixture();
	f.put("Companies/Example Co.md", note({ type: "Company", domain: "example.com" }));
	const prepared = await prepareSync(f.app, f.settings, f.fetch, now);
	assert.equal(prepared.input.strictCompanyLinks, true);
	assert.equal(prepared.input.companies.length, 1);
	const linked = prepared.input.personStubs.filter(({ stub }: any) => stub.companyLinks.length);
	assert.ok(linked.length > 0);
	for (const { stub } of linked) assert.deepEqual(clean(stub.frontmatter.company), ["[[Example Co]]"]);
	for (const { stub } of prepared.input.personStubs) assert.ok("company" in stub.frontmatter);
});

test("a matched Meeting note without the invite heading warns, is left unchanged, and still applies", async () => {
	const f = fixture();
	const body = "# Human Notes (yay)\nKeep this";
	f.put("Meetings/Original.md", note({ type: "Meeting", ics_uid: "outlook@example.com", title: "Old title", date: "2026-10-04" }, body));
	const prepared = await prepareSync(f.app, f.settings, f.fetch, now);
	assert.deepEqual(clean(prepared.preview.warnings.filter((item: any) => item.kind === "missing-invite-heading")), [{ kind: "missing-invite-heading", subject: "Meetings/Original.md" }]);
	assert.equal(prepared.canApply, true);
	await applySync(f.app, prepared);
	assert.equal(fields(f.texts.get("Meetings/Original.md")).title, "Outlook sample");
	assert.ok(f.texts.get("Meetings/Original.md").endsWith(body));
	assert.equal(f.texts.get("Meetings/Original.md").includes("New agenda"), false);
	const fresh = await prepareSync(f.app, f.settings, f.fetch, now);
	assert.equal(fresh.preview.warnings.some((item: any) => item.kind === "missing-invite-heading" && item.subject !== "Meetings/Original.md"), false);
});

test("a hand-entered channel survives repeat syncs under the original schema", async () => {
	const f = fixture();
	f.put("Meetings/Original.md", note({ type: "Meeting", ics_uid: "outlook@example.com", title: "Old title", date: "2026-10-04", channel: "#team-chat" }, "Keep this"));
	for (let run = 0; run < 2; run++) {
		await applySync(f.app, await prepareSync(f.app, f.settings, f.fetch, now));
		const actual = fields(f.texts.get("Meetings/Original.md"));
		assert.equal(actual.title, "Outlook sample");
		assert.equal(actual.channel, "#team-chat");
	}
	const created: any = [...f.texts].find(([path]) => path !== "Meetings/Original.md" && path.startsWith("Meetings/"));
	assert.equal(fields(created[1]).channel, "");
});

test("feed failure or ambiguous people allow preview but prevent all writes", async () => {
	for (const kind of ["feed", "person"]) {
		const f = fixture();
		if (kind === "person") for (const name of ["First", "Second"]) f.put(`People/${name}.md`, note({ type: "Person", email: "alex@example.com" }));
		const fetch = kind === "feed" ? async (url: any) => { if (url.includes("outlook")) throw new Error("synthetic private response"); return f.fetch(url); } : f.fetch;
		const prepared = await prepareSync(f.app, f.settings, fetch, now);
		assert.equal(prepared.canApply, false);
		await assert.rejects(() => applySync(f.app, prepared), /sync plan has errors/);
		assert.equal(f.writes.length, 0);
		assert.equal(JSON.stringify(prepared.preview).includes("synthetic private response"), false);
	}
});

test("filters retain skip reasons and missing events are warnings without cancellation writes", async () => {
	const f = fixture();
	f.settings.titleMatchRules = [{ mode: "prefix", value: "Google" }];
	f.settings.ignoreListPath = "ignore.json";
	f.put("ignore.json", JSON.stringify({ ignored: [{ uid: "outlook@example.com", recurrenceId: null }] }));
	f.put("Meetings/Filtered.md", note({ type: "Meeting", ics_uid: "outlook@example.com", date: "2026-10-04", invited_as: "two@example.com" }));
	f.put("Meetings/Missing.md", note({ type: "Meeting", ics_uid: "missing@example.com", date: "2026-10-04", invited_as: "one@example.com", occurrence_status: "Scheduled" }));
	const prepared = await prepareSync(f.app, f.settings, f.fetch, now);
	assert.equal(prepared.preview.skipped.length, 3);
	assert.ok(prepared.preview.skipped.every((item: any) => item.reason));
	assert.deepEqual(clean(prepared.preview.warnings), [{ kind: "vanished-event", subject: "Meetings/Missing.md" }]);
	await applySync(f.app, prepared);
	assert.equal(f.writes.length, 0);
	assert.equal(fields(f.texts.get("Meetings/Missing.md")).occurrence_status, "Scheduled");
	const failed = await prepareSync(f.app, f.settings, async () => { throw new Error("Synthetic feed failure"); }, now);
	assert.equal(failed.preview.warnings.length, 0);
});

test("vault changes and occupied targets reject apply before any note or folder writes", async () => {
	for (const change of ["edit", "add", "target", "folder"]) {
		const f = fixture();
		f.put("People/Existing.md", note({ type: "Person", email: "existing@example.com" }));
		const prepared = await prepareSync(f.app, f.settings, f.fetch, now);
		if (change === "edit") f.texts.set("People/Existing.md", note({ type: "Person", email: "changed@example.com" }));
		if (change === "add") f.put("People/New.md", note({ type: "Person" }));
		if (change === "target") f.put(prepared.preview.newMeetings[0].path, "Handwritten note");
		if (change === "folder") f.put("Meetings", "Handwritten note");
		const before = f.files.size;
		await assert.rejects(() => applySync(f.app, prepared));
		assert.equal(f.writes.length, 0);
		assert.equal(f.files.size, before);
	}
});

test("custom bodies, filenames, disabled stubs and non-strict links are honored", async () => {
	const f = fixture();
	f.put("Templates/Meeting.md", "# Custom {{title}}\n## Invite Agenda\n\n{{invite_agenda}}\n");
	f.put("Templates/Person.md", "# {{full_name}}\n{{email}}");
	f.put("Templates/Series.md", "## Standing Agenda\n\n{{series_title}}");
	f.settings.templates = { meeting: "Templates/Meeting.md", person: "Templates/Person.md", series: "Templates/Series.md" };
	f.settings.meetingFilenamePattern = "{{date}} {{title}}";
	const prepared = await prepareSync(f.app, f.settings, f.fetch, now);
	assert.ok(prepared.preview.newMeetings[0].path.startsWith("Meetings/2026-10-04"));
	assert.ok(prepared.preview.newMeetings[0].note.body.startsWith("# Custom Google sample"));
	assert.ok(prepared.input.personStubs[0].body.includes("alex@example.com"));
	assert.ok(prepared.input.seriesStubs[0].body.includes("Google sample"));
	await applySync(f.app, prepared);
	assert.ok(f.texts.get(prepared.input.personStubs[0].path).includes(prepared.input.personStubs[0].body));
	const other = fixture();
	other.settings.createPersonStubs = false; other.settings.createSeriesStubs = false; other.settings.strictCompanyLinks = false;
	other.put("People/Alex Example.md", note({ type: "Person", email: "alex@example.com", company: ["[[Missing]]"] }));
	const next = await prepareSync(other.app, other.settings, other.fetch, now);
	assert.equal(next.input.personStubs.length, 0); assert.equal(next.input.seriesStubs.length, 0);
	assert.deepEqual(clean(next.preview.newMeetings[0].note.frontmatter.companies), ["[[Missing]]"]);
	await applySync(other.app, next);
	assert.deepEqual(fields(other.texts.get(next.preview.newMeetings[0].path)).companies, ["[[Missing]]"]);
});

test("invalid ignore lists, duplicate keys and invalid filenames fail without writes", async () => {
	for (const kind of ["ignore", "duplicate", "invalid"]) {
		const f = fixture();
		if (kind === "ignore") { f.settings.ignoreListPath = "ignore.json"; f.put("ignore.json", JSON.stringify({ ignored: [null] })); }
		if (kind === "invalid") f.settings.folders.meeting = "Bad:folder";
		if (kind === "duplicate") for (const name of ["One", "Two"]) f.put(`Meetings/${name}.md`, note({ type: "Meeting", ics_uid: "outlook@example.com" }));
		await assert.rejects(() => prepareSync(f.app, f.settings, f.fetch, now));
		assert.equal(f.writes.length, 0);
	}
});

test("event titles with a colon preview and apply with cleaned filenames", async () => {
	const f = fixture();
	f.settings.createSeriesStubs = false;
	f.fetch = async (url) => url.includes("google") ? calendar("colon@example.com", "Sync: Planning") : calendar("private@example.com", "Private: dentist? [2026] #1");
	const prepared = await prepareSync(f.app, f.settings, f.fetch, now);
	assert.equal(prepared.preview.newMeetings.length, 2);
	assert.deepEqual(clean(prepared.preview.newMeetings.map((item: any) => item.path).sort()), ["Meetings/Private - dentist - 2026 - 1 2026-10-04.md", "Meetings/Sync - Planning 2026-10-04.md"]);
	assert.equal(prepared.preview.newMeetings.find((item: any) => item.path.startsWith("Meetings/Sync")).note.frontmatter.title, "Sync: Planning");
	await applySync(f.app, prepared);
	assert.ok(f.texts.has("Meetings/Sync - Planning 2026-10-04.md"));
	const again = await prepareSync(f.app, f.settings, f.fetch, now);
	assert.equal(again.preview.newMeetings.length, 0);
});

test("two titles that clean to the same filename get a numbered name and apply without a clash", async () => {
	const f = fixture();
	f.settings.createSeriesStubs = false;
	f.fetch = async (url) => url.includes("google") ? calendar("a@example.com", "Sync: Planning") : calendar("b@example.com", "Sync? Planning");
	const prepared = await prepareSync(f.app, f.settings, f.fetch, now);
	assert.deepEqual(clean(prepared.preview.newMeetings.map((item: any) => item.path)), ["Meetings/Sync - Planning 2026-10-04.md", "Meetings/Sync - Planning 2026-10-04 2.md"]);
	assert.equal(f.writes.length, 0);
	await applySync(f.app, prepared);
	assert.ok(f.texts.has("Meetings/Sync - Planning 2026-10-04.md") && f.texts.has("Meetings/Sync - Planning 2026-10-04 2.md"));
	const again = await prepareSync(f.app, f.settings, f.fetch, now);
	assert.equal(again.preview.newMeetings.length, 0);
});

test("a new note never takes the name of an unrelated existing note", async () => {
	const f = fixture();
	f.settings.createSeriesStubs = false;
	const first = (await prepareSync(f.app, f.settings, f.fetch, now)).preview.newMeetings[0];
	f.put(first.path, note({ type: "Meeting", ics_uid: "other@example.com" }));
	f.put("People/Alex Example.md", note({ type: "Person", email: "someone@example.com" }));
	const prepared = await prepareSync(f.app, f.settings, f.fetch, now);
	assert.ok(prepared.preview.newMeetings.some((item: any) => item.path === first.path.replace(/\.md$/, " 2.md")));
	assert.ok(prepared.input.personStubs.some((item: any) => item.path === "People/Alex Example 2.md" && item.stub.filename === "Alex Example 2"));
	await applySync(f.app, prepared);
	assert.equal(fields(f.texts.get(first.path.replace(/\.md$/, " 2.md"))).organizer, "[[Alex Example 2]]");
});

test("Series stubs for different recurring events with the same title get numbered names", async () => {
	const f = fixture();
	const rule = "RRULE:FREQ=WEEKLY;COUNT=2\r\n";
	f.fetch = async (url) => url.includes("google") ? calendar("one@example.com", "1:1", rule) : calendar("two@example.com", "1:1", rule);
	const prepared = await prepareSync(f.app, f.settings, f.fetch, now);
	assert.deepEqual(clean(prepared.input.seriesStubs.map((item: any) => item.path)).sort(), ["Series/1-1 2.md", "Series/1-1.md"]);
	await applySync(f.app, prepared);
	const again = await prepareSync(f.app, f.settings, f.fetch, now);
	assert.equal(again.input.seriesStubs.length, 0);
	assert.equal(again.preview.newMeetings.length, 0);
});

async function pluginFixture(previewBeforeApply = true) {
	const f = fixture();
	for (const { url } of f.settings.calendars) feeds.set(url, await f.fetch(url));
	const plugin = new GraftPlugin(f.app);
	plugin.loadData = async () => ({ ...f.settings, previewBeforeApply });
	await plugin.onload();
	return { ...f, plugin };
}
async function settle() { await new Promise((resolve) => setImmediate(resolve)); }
function elements(root: any) { return [root, ...root.children.flatMap(elements)]; }

test("commands open a reachable preview, Apply writes once, and parallel sync is blocked", async () => {
	const f = await pluginFixture(false);
	assert.deepEqual(clean(f.plugin.commands.map((item: any) => item.name)), ["Preview sync", "Sync now", "Open calendar"]);
	const run = f.plugin.runSync(true);
	await settle();
	const modal = modals.at(-1);
	assert.equal(f.writes.length, 0);
	await f.plugin.runSync(false);
	assert.match(notices.at(-1), /already open/);
	const apply = elements(modal.contentEl).find((item) => item.text === "Apply");
	await apply.listeners.click();
	await run;
	assert.equal(modal.closed, true);
	assert.ok(f.writes.length > 0);
	const before = f.writes.length;
	await apply.listeners.click();
	assert.equal(f.writes.length, before);
});

test("Sync now honors both preview toggle values, and closing preview writes nothing", async () => {
	const f = await pluginFixture(true);
	const run = f.plugin.runSync(false);
	await settle();
	assert.equal(f.writes.length, 0);
	modals.at(-1).close();
	await run;
	assert.equal(f.writes.length, 0);
	const immediate = await pluginFixture(false);
	await immediate.plugin.runSync(false);
	assert.ok(immediate.writes.length > 0);
});

test("startup uses the same flow only when enabled, and failures remain generic", async () => {
	const f = await pluginFixture(true);
	f.app.workspace.ready();
	assert.equal(f.writes.length, 0);
	f.plugin.settings.autoRunOnStartup = true;
	f.app.workspace.ready();
	await settle();
	modals.at(-1).close();
	await settle();
	f.plugin.settings.ignoreListPath = "ignore.json";
	f.put("ignore.json", "synthetic private invalid json");
	await f.plugin.runSync(true);
	assert.equal(notices.at(-1).includes("synthetic private"), false);
});

function withFeeds(settings: any) {
	settings.calendars = [
		{ name: "Google", type: "google", url: "https://example.com/google.ics", invitedAs: "one@example.com" },
		{ name: "Outlook", type: "outlook", url: "https://example.com/outlook.ics", invitedAs: "two@example.com" },
	];
	settings.daysBack = 0;
	settings.daysAhead = 2;
	return settings;
}

test("a vault with different folders, types, properties, and headings syncs from settings alone", async () => {
	const f = fixture();
	f.settings = withFeeds(loadGraftSettings({
		companyLinking: true,
		folders: { meeting: "Calls", person: "Contacts", series: "Recurring", company: "Orgs" },
		schema: {
			typeField: "kind",
			types: { meeting: "Call", person: "Contact", series: "Recurring", company: "Org" },
			meeting: { title: "name", date: "day", scheduledStart: "from", scheduledEnd: "to", organizer: "host", invited: "guests", series: "recurring", invitedAs: "me", inviteUpdated: "", uid: "cal_uid", recurrenceId: "cal_rid", occurrenceStatus: "" },
			person: { email: "mail", emailAliases: "mail_aliases", company: "org", fullName: "name", firstName: "given", lastName: "family" },
			series: { uid: "cal_uid", title: "name" },
			company: { domain: "site" },
			headings: { inviteAgenda: "## From the invite", seriesAgenda: "## Recurring agenda", standingAgenda: "## Usual agenda" },
			meetingBody: "{{series_section}}{{invite_section}}\n",
			meetingExtras: [{ key: "orgs", value: "{{companies}}", updateOnSync: true }, { key: "shape", value: "{{recurrence}}", updateOnSync: false }],
		},
	}));
	f.put("Contacts/Alex Example.md", note({ kind: "Contact", mail_aliases: ["alex@example.com"], org: ["[[Example Co]]"] }));
	f.put("Orgs/Example Co.md", note({ kind: "Org", site: "example.com" }));
	f.put("Recurring/Existing.md", note({ kind: "Recurring", cal_uid: "google@example.com" }, "## Usual agenda\n\nStanding example"));
	f.put("Calls/Original.md", note({ kind: "Call", cal_uid: "outlook@example.com", name: "Old title", day: "2026-10-04" }, "## From the invite\n\nOld agenda\n\n# Notes\nKeep this"));
	const prepared = await prepareSync(f.app, f.settings, f.fetch, now);
	assert.equal(prepared.preview.newMeetings.length, 2);
	assert.equal(prepared.preview.personStubs.length, 1);
	assert.equal(prepared.preview.seriesStubs.length, 0);
	await applySync(f.app, prepared);

	const created = prepared.preview.newMeetings.map(({ path }: any) => path);
	assert.ok(created.every((path: any) => path.startsWith("Calls/")));
	const first = fields(f.texts.get(created[0]));
	for (const absent of ["type", "title", "date", "ics_uid", "scheduled_start", "occurrence_status", "invite_updated", "week", "Tags"]) assert.equal(absent in first, false, absent);
	assert.equal(first.kind, "Call");
	assert.equal(first.cal_uid, "google@example.com");
	assert.equal(first.shape, "RegularSync");
	assert.deepEqual(first.orgs, ["[[Example Co]]"]);
	assert.equal(first.recurring, "[[Existing]]");
	assert.ok(f.texts.get(created[0]).includes("## Recurring agenda\n\nStanding example"));
	assert.ok(f.texts.get(created[0]).includes("## From the invite\n\nNew agenda"));

	const stub = fields(f.texts.get("Contacts/Pat Example.md"));
	assert.deepEqual(stub, { kind: "Contact", name: "Pat Example", given: "Pat", family: "Example", org: ["[[Example Co]]"], mail: "pat@example.com" });

	const updated = fields(f.texts.get("Calls/Original.md"));
	assert.equal(updated.name, "Outlook sample");
	assert.equal(updated.me, "two@example.com");
	assert.ok(f.texts.get("Calls/Original.md").includes("## From the invite\n\nNew agenda"));
	assert.ok(f.texts.get("Calls/Original.md").includes("Keep this"));

	const again = await prepareSync(f.app, f.settings, f.fetch, now);
	assert.equal(again.preview.newMeetings.length, 0);
	assert.equal(again.preview.personStubs.length, 0);
	assert.equal(again.preview.updates.every((item: any) => item.changes.length === 0), true);
});

test("a fresh install writes the minimal schema without vault-specific properties", async () => {
	const f = fixture();
	f.settings = withFeeds(loadGraftSettings({}));
	const prepared = await prepareSync(f.app, f.settings, f.fetch, now);
	await applySync(f.app, prepared);
	const path = prepared.preview.newMeetings[0].path;
	assert.deepEqual(Object.keys(fields(f.texts.get(path))).sort(), [
		"date", "ics_recurrence_id", "ics_uid", "invite_updated", "invited", "invited_as", "occurrence_status", "organizer",
		"scheduled_end", "scheduled_start", "series", "title", "type",
	]);
	assert.ok(f.texts.get(path).endsWith("# Notes\n"));
	assert.ok(!f.texts.get(path).includes("Human Notes"));
	const series = fields(f.texts.get(prepared.preview.seriesStubs[0].path));
	assert.deepEqual(Object.keys(series).sort(), ["ics_uid", "series_title", "type"]);
	const again = await prepareSync(f.app, f.settings, f.fetch, now);
	assert.equal(again.preview.newMeetings.length, 0);
	assert.equal(again.preview.seriesStubs.length, 0);
});

const generic = "Graft could not prepare the sync. Check the calendar settings, folders, templates, and ignore list.";

test("deliberate prepare errors show their own message in the notice", async () => {
	const cases = {
		"Add a calendar in Graft settings.": (f: any) => { f.plugin.settings.calendars = []; },
		"The ignore list is not valid JSON. Fix the file or clear the ignore list setting.": (f: any) => { f.plugin.settings.ignoreListPath = "ignore.json"; f.put("ignore.json", "{ not json"); },
		"The ignore list is not valid. Each ignored entry needs a uid and a recurrenceId, and may have a note.": (f: any) => { f.plugin.settings.ignoreListPath = "ignore.json"; f.put("ignore.json", JSON.stringify({ ignored: [null] })); },
		"A template file set in Graft settings was not found. Fix the template path or clear it.": (f: any) => { f.plugin.settings.templates.meeting = "Templates/Missing.md"; },
		"A planned note filename is not valid. Change the filename pattern or folder in Graft settings.": (f: any) => { f.plugin.settings.folders.meeting = "Bad:folder"; },
		"More than one Meeting note has the same event UID. Remove the duplicate from the Meeting folder.": (f: any) => { for (const name of ["One", "Two"]) f.put(`Meetings/${name}.md`, note({ type: "Meeting", ics_uid: "outlook@example.com" })); },
	};
	for (const [message, arrange] of Object.entries(cases)) {
		const f = await pluginFixture(true);
		arrange(f);
		await f.plugin.runSync(true);
		assert.equal(notices.at(-1), message);
		assert.equal(f.writes.length, 0);
	}
});

test("an unexpected error shows the generic notice and never echoes a feed URL or note text", async () => {
	const f = await pluginFixture(true);
	f.app.vault.getMarkdownFiles = () => { throw new Error("failed for https://example.com/secret-token.ics: synthetic private note text"); };
	await f.plugin.runSync(true);
	assert.equal(notices.at(-1), generic);
	assert.equal(/example\.com|synthetic private/.test(notices.at(-1)), false);
});

test("a plain Error with a deliberate-looking message stays generic", async () => {
	const f = await pluginFixture(true);
	f.plugin.settings.ignoreListPath = "ignore.json";
	f.put("ignore.json", "{}");
	f.app.vault.read = async () => { throw new Error("Add a calendar in Graft settings."); };
	await f.plugin.runSync(true);
	assert.equal(notices.at(-1), generic);
});

test("a calendar with no URL on this device stops the sync with a plain message and no fetch", async () => {
	const f = fixture();
	f.settings.calendars = [{ id: "a1", name: "Work", type: "google", url: "", invitedAs: "" }, { id: "b2", name: "Home", type: "google", url: "https://example.com/home.ics", invitedAs: "" }];
	let fetched = 0;
	await assert.rejects(() => prepareSync(f.app, f.settings, async () => { fetched++; return ""; }, now),
		(error: any) => error.message === "No feed address on this device for Work. Open Graft settings and enter it again.");
	assert.equal(fetched, 0);
	assert.equal(f.writes.length, 0);
});

test("a new Person stub with the name of an existing Person note warns without blocking Apply", async () => {
	const f = fixture();
	f.put("People/Pat Example.md", note({ type: "Person", full_name: " PAT example ", email: "pat@example.org", email_aliases: [] }));
	f.put("People/Alex Example.md", note({ type: "Person", full_name: "Alex Example", email: "alex@example.com", email_aliases: [] }));
	const prepared = await prepareSync(f.app, f.settings, f.fetch, now);
	const duplicates = prepared.preview.warnings.filter((warning: any) => warning.kind === "possible-duplicate-person");
	assert.deepEqual(clean(duplicates), [{ kind: "possible-duplicate-person", subject: "People/Pat Example 2.md and People/Pat Example.md" }]);
	assert.equal(prepared.canApply, true);
	const before = f.texts.get("People/Pat Example.md");
	await applySync(f.app, prepared);
	assert.equal(f.texts.get("People/Pat Example.md"), before);
});

test("a status shows while feeds are read, and is gone before the preview opens", async () => {
	const f = await pluginFixture(true);
	const seen: string[] = [];
	onRequest = () => seen.push(statusBar.map((item) => item.spans.map((span: any) => span.text ?? span.cls).join("|")).join(","));
	const run = f.plugin.runSync(true);
	await settle();
	onRequest = undefined;
	assert.ok(seen.length > 0);
	assert.ok(seen.every((entry) => entry === "graft-spinner|Graft: checking calendars"));
	assert.equal(statusBar.length, 0);
	modals.at(-1).close();
	await run;
	assert.equal(statusBar.length, 0);
});

test("the status shows a different label for Sync now and clears when the sync stops with an error", async () => {
	const f = await pluginFixture(true);
	f.plugin.settings.calendars = [];
	await f.plugin.runSync(false);
	assert.equal(statusBar.length, 0);
	assert.match(notices.at(-1), /Add a calendar/);
	const g = await pluginFixture(true);
	let label = "";
	onRequest = () => { label = statusBar[0]?.spans.at(-1)?.text ?? ""; };
	const run = g.plugin.runSync(false);
	await settle();
	onRequest = undefined;
	assert.equal(label, "Graft: syncing");
	modals.at(-1).close();
	await run;
	assert.equal(statusBar.length, 0);
});

test("on mobile the status is a notice that is hidden when the work ends", async () => {
	platform.isMobile = true;
	try {
		const f = await pluginFixture(true);
		hidden.length = 0;
		const before = notices.length;
		const run = f.plugin.runSync(true);
		await settle();
		assert.equal(notices[before], "Graft: checking calendars");
		assert.deepEqual(hidden, ["Graft: checking calendars"]);
		assert.equal(statusBar.length, 0);
		modals.at(-1).close();
		await run;
	} finally {
		platform.isMobile = false;
	}
});

test("a sync that wrote notes is recorded in the sync log note, and a repeat that changes nothing is not", async () => {
	const f = await pluginFixture(false);
	f.plugin.settings.syncLogPath = "Graft/Sync log.md";
	await f.plugin.runSync(false);
	const log = f.texts.get("Graft/Sync log.md");
	assert.match(log, /^# Graft sync log\n\n## \d{4}-\d{2}-\d{2} \d{2}:\d{2} · Sync now\n- Created \d+ Meeting notes?: \[\[Meetings\//);
	assert.equal(log.includes("http"), false);
	await f.plugin.runSync(false);
	assert.equal(f.texts.get("Graft/Sync log.md"), log);
});

test("a preview Apply is labelled, and with no log path nothing is created", async () => {
	const f = await pluginFixture(true);
	f.plugin.settings.syncLogPath = "Sync log.md";
	const run = f.plugin.runSync(true);
	await settle();
	const modal = modals.at(-1);
	await elements(modal.contentEl).find((item) => item.text === "Apply").listeners.click();
	await run;
	assert.match(f.texts.get("Sync log.md"), /· Apply from preview\n/);
	const blank = await pluginFixture(false);
	await blank.plugin.runSync(false);
	assert.equal([...blank.files.keys()].some((path: string) => path.endsWith("log.md")), false);
});

test("a log path inside a note folder is refused with a notice and the sync still succeeds", async () => {
	const f = await pluginFixture(false);
	f.plugin.settings.syncLogPath = "Meetings/log.md";
	await f.plugin.runSync(false);
	assert.ok(notices.some((message: string) => /inside a note folder/.test(message)));
	assert.equal(f.files.has("Meetings/log.md"), false);
	assert.ok(f.writes.some((path: string) => path.startsWith("Meetings/")));
});

async function scheduledFixture(mode = "notify", minutes = 30) {
	const f = await pluginFixture(true);
	f.plugin.settings.scheduledSync = mode;
	f.plugin.settings.syncIntervalMinutes = minutes;
	statusBar.length = 0;
	timers.length = 0;
	await f.plugin.saveSettings();
	return f;
}
const readyItems = () => statusBar.filter((item) => item.classes.includes("graft-status-ready"));
const itemText = (item: any) => item.spans.map((span: any) => span.text).join("");

test("the scheduled check timer follows the mode and interval, and an unrelated save leaves it alone", async () => {
	const f = await scheduledFixture("notify", 30);
	assert.deepEqual(timers.map((timer) => [timer.ms, timer.cleared]), [[30 * 60000, false]]);
	await f.plugin.saveSettings();
	assert.equal(timers.length, 1);
	f.plugin.settings.syncIntervalMinutes = 45;
	await f.plugin.saveSettings();
	assert.deepEqual(timers.map((timer) => [timer.ms, timer.cleared]), [[30 * 60000, true], [45 * 60000, false]]);
	f.plugin.settings.scheduledSync = "off";
	await f.plugin.saveSettings();
	assert.equal(timers.at(-1)!.cleared, true);
	assert.equal(timers.length, 2);
});

test("a scheduled check announces ready changes once, writes nothing, and clears when nothing is pending", async () => {
	const f = await scheduledFixture();
	const before = f.writes.length;
	const noticesBefore = notices.length;
	await f.plugin.scheduledCheck();
	assert.equal(f.writes.length, before);
	assert.equal(readyItems().length, 1);
	assert.match(itemText(readyItems()[0]), /^Graft: \d+ changes? ready to review$/);
	assert.equal(notices.length, noticesBefore + 1);
	await f.plugin.scheduledCheck();
	assert.equal(notices.length, noticesBefore + 1);
	assert.equal(readyItems().length, 1);
	f.plugin.settings.previewBeforeApply = false;
	await f.plugin.runSync(false);
	assert.equal(readyItems().length, 0);
	await f.plugin.scheduledCheck();
	assert.equal(readyItems().length, 0);
	assert.equal(notices.length, noticesBefore + 1 + 1);
});

test("clicking the ready item opens a fresh preview and removes the item", async () => {
	const f = await scheduledFixture();
	await f.plugin.scheduledCheck();
	const modalsBefore = modals.length;
	const run = readyItems()[0].listeners.click();
	await settle();
	assert.equal(modals.length, modalsBefore + 1);
	assert.equal(readyItems().length, 0);
	modals.at(-1).close();
	await run;
});

test("a scheduled check is skipped while a sync or preview is open and does nothing when the mode is off", async () => {
	const f = await scheduledFixture();
	const run = f.plugin.runSync(true);
	await settle();
	const noticesBefore = notices.length;
	await f.plugin.scheduledCheck();
	assert.equal(readyItems().length, 0);
	assert.equal(notices.length, noticesBefore);
	modals.at(-1).close();
	await run;
	f.plugin.settings.scheduledSync = "off";
	await f.plugin.scheduledCheck();
	assert.equal(readyItems().length, 0);
});

test("three failed checks in a row show that the last check failed, and a good check clears it", async () => {
	const f = await scheduledFixture();
	const saved = [...feeds.entries()];
	feeds.clear();
	const noticesBefore = notices.length;
	await f.plugin.scheduledCheck();
	await f.plugin.scheduledCheck();
	assert.equal(readyItems().length, 0);
	assert.equal(notices.length, noticesBefore);
	await f.plugin.scheduledCheck();
	assert.equal(readyItems().length, 1);
	assert.equal(itemText(readyItems()[0]), "Graft: the last check failed");
	await f.plugin.scheduledCheck();
	assert.equal(notices.length, noticesBefore + 1);
	for (const [url, text] of saved) feeds.set(url, text);
	await f.plugin.scheduledCheck();
	assert.match(itemText(readyItems()[0]), /changes? ready to review/);
});

test("on mobile the ready message is only a notice", async () => {
	platform.isMobile = true;
	try {
		const f = await scheduledFixture();
		const noticesBefore = notices.length;
		await f.plugin.scheduledCheck();
		assert.equal(statusBar.length, 0);
		assert.equal(notices.length, noticesBefore + 1);
	} finally {
		platform.isMobile = false;
	}
});

async function automaticFixture(minutes = 30) {
	const f = await scheduledFixture("automatic", minutes);
	f.plugin.settings.syncLogPath = "Graft/Sync log.md";
	return f;
}

test("Automatic applies a clean plan like Apply, logs it, says so once, and has nothing left to do", async () => {
	const f = await automaticFixture();
	const noticesBefore = notices.length;
	await f.plugin.scheduledCheck();
	assert.ok(f.writes.some((path: string) => path.startsWith("Meetings/")));
	assert.equal(readyItems().length, 0);
	assert.ok(notices.slice(noticesBefore).some((message: any) => /scheduled sync wrote \d+ changes?\. See the sync log/.test(message)));
	assert.match(f.texts.get("Graft/Sync log.md"), /· Scheduled sync\n- Created \d+ Meeting notes?/);
	const writes = f.writes.length;
	await f.plugin.scheduledCheck();
	assert.equal(f.writes.length, writes);
});

test("Automatic leaves a plan over the limit for the user, announced like Notify and not written", async () => {
	const f = await automaticFixture();
	f.plugin.settings.automaticMaxNotes = 1;
	await f.plugin.scheduledCheck();
	assert.equal(f.writes.filter((path: string) => path.startsWith("Meetings/")).length, 0);
	assert.equal(readyItems().length, 1);
	assert.match(itemText(readyItems()[0]), /ready to review \(over the automatic limit of 1\)$/);
	assert.equal(f.files.has("Graft/Sync log.md"), false);
});

test("Automatic never applies a blocked plan", async () => {
	const f = await automaticFixture();
	f.put("People/Pat One.md", note({ type: "Person", email: "pat@example.com" }));
	f.put("People/Pat Two.md", note({ type: "Person", email: "pat@example.com" }));
	await f.plugin.scheduledCheck();
	assert.equal(f.writes.filter((path: string) => path.startsWith("Meetings/")).length, 0);
	assert.match(itemText(readyItems()[0]), /need review before they can be applied$/);
});

test("Automatic retries quietly when the vault changed after the plan, without a notice, a log entry or a failure", async () => {
	const f = await automaticFixture();
	const noticesBefore = notices.length;
	onStatusItem = () => f.put("Meetings/Added during the run.md", note({ type: "Meeting", ics_uid: "added@example.com" }));
	await f.plugin.scheduledCheck();
	assert.equal(notices.length, noticesBefore);
	assert.equal(f.files.has("Graft/Sync log.md"), false);
	assert.equal(f.writes.filter((path: string) => path.startsWith("Meetings/")).length, 0);
	await f.plugin.scheduledCheck();
	assert.ok(f.writes.some((path: string) => path.startsWith("Meetings/")));
});

test("Automatic shows, logs and counts any other failure, and the third one shows the failed item", async () => {
	const f = await automaticFixture();
	const create = f.app.vault.create;
	f.app.vault.create = async (path: string, text: string) => { if (path.startsWith("Meetings/")) throw new Error("Synthetic write failure"); return create(path, text); };
	const noticesBefore = notices.length;
	await f.plugin.scheduledCheck();
	assert.ok(notices.slice(noticesBefore).some((message: any) => /^Graft: scheduled sync stopped\. Graft sync stopped/.test(message)));
	assert.match(f.texts.get("Graft/Sync log.md"), /- Stopped: Graft sync stopped/);
	assert.equal(f.texts.get("Graft/Sync log.md").includes("Synthetic write failure"), false);
	await f.plugin.scheduledCheck();
	assert.equal(readyItems().length, 0);
	await f.plugin.scheduledCheck();
	assert.equal(itemText(readyItems()[0]), "Graft: the last check failed");
	f.app.vault.create = create;
});
