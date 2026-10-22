import { test, before } from "node:test";
import { strict as assert } from "node:assert";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";
import { buildSyncPreview } from "../../src/preview/plan.ts";
import { ORIGINAL_SCHEMA } from "../../src/config/schema.ts";
import { BrowseCache } from "../../src/calendar/cache.ts";
import { initialCalendarState, renderCalendar } from "../../src/preview/calendarView.ts";
import { makeEvent } from "../helpers.ts";

class Element {
	[key: string]: any;
	tag = "";
	text = "";
	cls = "";
	disabled = false;
	children: any[] = [];
	listeners: Record<string, any> = {};
	createEl(tag: string, options: any = {}) {
		const child = new Element();
		child.tag = tag;
		child.text = options.text ?? "";
		child.cls = options.cls ?? "";
		this.children.push(child);
		return child;
	}
	addEventListener(name: string, callback: any) { this.listeners[name] = callback; }
	addClass(name: string) { this.cls += ` ${name}`; }
	empty() { this.children = []; }
}
class ItemView {
	[key: string]: any;
	contentEl = new Element();
	constructor(leaf: any) { this.leaf = leaf; }
}
let CalendarView: any;
before(async () => {
	const result = await build({ entryPoints: ["src/calendar/view.ts"], bundle: true, write: false, platform: "node", format: "cjs", external: ["obsidian"] });
	const module: { exports: any } = { exports: {} };
	runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require: () => ({ ItemView }), Intl, Date });
	({ CalendarView } = module.exports);
});
const all = (root: any): any[] => [root, ...root.children.flatMap(all)];

function previewWith(options: { errors?: boolean } = {}) {
	const event = makeEvent({ summary: "Weekly sync", start: "2026-10-15T09:00:00.000Z", end: "2026-10-15T09:30:00.000Z" });
	const second = makeEvent({ uid: "b@example.com", summary: "Planning", start: "2026-10-15T10:00:00.000Z", end: "2026-10-15T10:30:00.000Z" });
	return buildSyncPreview({
		plan: { toProcess: [event, second], skipped: [], errors: options.errors ? [{ feed: "Work", message: "private" }] : [] } as any,
		window: { start: new Date("2026-10-01T00:00:00Z"), end: new Date("2026-11-15T00:00:00Z"), daysBack: 14, daysAhead: 30, timezone: "UTC" },
		meetings: [
			{ input: { event, invited: [], invitedAs: "me@example.com", schema: ORIGINAL_SCHEMA, timezone: "UTC" }, existing: { path: "Meetings/Weekly sync.md", frontmatter: {}, body: "" } },
			{ input: { event: second, invited: [], invitedAs: "me@example.com", schema: ORIGINAL_SCHEMA, timezone: "UTC" } },
		],
		personStubs: [], seriesStubs: [], companies: [], meetingFolder: "Meetings",
		features: { personStubs: false, seriesStubs: false, skipped: false }, warnings: [],
	});
}

test("renderCalendar offers Open note only for an existing note, and only when asked", () => {
	const preview = previewWith();
	const draw = (selected: string | undefined, openNote?: (path: string) => void) => {
		const state = { ...initialCalendarState(preview, new Date("2026-10-15T08:00:00Z")), selected };
		const root = new Element();
		renderCalendar(root as any, preview, state, () => {}, new Date("2026-10-15T08:00:00Z"), { openNote });
		return all(root).filter((element) => element.tag === "button" && element.text === "Open note");
	};
	const opened: string[] = [];
	assert.equal(draw("kept-0").length, 0);
	assert.equal(draw("kept-1", (path) => opened.push(path)).length, 0);
	const [button] = draw("kept-0", (path) => opened.push(path));
	button.listeners.click();
	assert.deepEqual(opened, ["Meetings/Weekly sync.md"]);
});

function open(cache: BrowseCache) {
	const view = new CalendarView({}, { cache, timezone: () => "UTC", now: () => new Date("2026-10-15T08:00:00Z"), openNote: () => {} });
	return view;
}

test("the view loads once, then redraws from the cache and refreshes on request", async () => {
	let loads = 0;
	const cache = new BrowseCache(async () => { loads++; return previewWith({ errors: true }); }, () => "Could not read");
	const first = open(cache);
	await first.onOpen();
	assert.equal(loads, 1);
	const text = all(first.contentEl).map((element) => element.text);
	assert.ok(text.some((line) => line.startsWith("Updated ")));
	assert.ok(text.includes("Work: Calendar feed could not be fetched or parsed."));
	assert.equal(text.some((line) => line.includes("private")), false);
	assert.ok(text.includes("Weekly sync"));
	assert.equal(all(first.contentEl).some((element) => element.text === "Apply"), false);
	await first.onClose();
	assert.deepEqual(first.contentEl.children, []);

	const second = open(cache);
	await second.onOpen();
	assert.equal(loads, 1);
	await all(second.contentEl).find((element) => element.text === "Refresh").listeners.click();
	await cache.get();
	assert.equal(loads, 2);
});

test("a failed load shows its message inside the view with Refresh still available", async () => {
	const cache = new BrowseCache(async () => { throw new Error("x"); }, () => "Add a calendar in Graft settings.");
	const view = open(cache);
	await view.onOpen();
	const elements = all(view.contentEl);
	assert.ok(elements.some((element) => element.text === "Add a calendar in Graft settings."));
	assert.ok(elements.some((element) => element.text === "Refresh" && !element.disabled));
});

test("the calendar view uses the Graft icon", () => {
	assert.equal(new CalendarView(undefined, {} as any).getIcon(), "graft-logo");
});
