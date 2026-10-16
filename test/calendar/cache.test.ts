import { test } from "node:test";
import { strict as assert } from "node:assert";
import { BrowseCache, updatedLabel } from "../../src/calendar/cache.ts";
import { browseSettings, BROWSE_DAYS_AHEAD, BROWSE_DAYS_BACK } from "../../src/calendar/browse.ts";
import { DEFAULT_SETTINGS } from "../../src/config/settings.ts";
import type { SyncPreview } from "../../src/preview/plan.ts";

const plan = (tag: string) => ({ tag }) as unknown as SyncPreview;
const message = (error: unknown) => `failed: ${(error as Error).message}`;

test("get loads once and serves the stored result afterwards", async () => {
	let calls = 0;
	const cache = new BrowseCache(async () => plan(`run-${++calls}`), message);
	const first = await cache.get();
	const second = await cache.get();
	assert.equal(calls, 1);
	assert.equal(second, first);
});

test("refresh loads again and replaces the stored result", async () => {
	let calls = 0;
	let tick = 0;
	const cache = new BrowseCache(async () => plan(`run-${++calls}`), message, () => new Date(2026, 9, 15, 9, tick++));
	const first = await cache.get();
	const second = await cache.refresh();
	assert.equal(calls, 2);
	assert.notEqual(second.at.getTime(), first.at.getTime());
	assert.equal(cache.peek(), second);
});

test("calls made while a load runs share it", async () => {
	let calls = 0;
	let release!: () => void;
	const gate = new Promise<void>((resolve) => { release = resolve; });
	const cache = new BrowseCache(async () => { calls++; await gate; return plan("x"); }, message);
	const a = cache.refresh();
	const b = cache.get();
	assert.equal(cache.loading, true);
	release();
	await Promise.all([a, b]);
	assert.equal(calls, 1);
	assert.equal(cache.loading, false);
});

test("a failed load is kept as a message and the next refresh can recover", async () => {
	let fail = true;
	const cache = new BrowseCache(async () => { if (fail) throw new Error("boom"); return plan("ok"); }, message);
	const failed = await cache.get();
	assert.equal(failed.error, "failed: boom");
	assert.equal(failed.preview, undefined);
	fail = false;
	assert.ok((await cache.refresh()).preview);
});

test("clear drops the stored result and ignores a load that started before it", async () => {
	let release!: () => void;
	const gate = new Promise<void>((resolve) => { release = resolve; });
	const cache = new BrowseCache(async () => { await gate; return plan("old"); }, message);
	const running = cache.refresh();
	cache.clear();
	release();
	await running;
	assert.equal(cache.peek(), undefined);
	assert.equal(cache.loading, false);
});

test("updatedLabel shows the time in the zone", () => {
	assert.equal(updatedLabel(undefined, "UTC"), "Not loaded yet");
	assert.equal(updatedLabel(new Date("2026-10-15T14:05:00Z"), "Europe/Paris"), "Updated 16:05");
});

test("browseSettings sets its own range and leaves the sync settings alone", () => {
	const settings = structuredClone(DEFAULT_SETTINGS);
	settings.daysBack = 1;
	settings.daysAhead = 2;
	const browse = browseSettings(settings);
	assert.equal(browse.daysBack, BROWSE_DAYS_BACK);
	assert.equal(browse.daysAhead, BROWSE_DAYS_AHEAD);
	assert.equal(settings.daysBack, 1);
	assert.equal(settings.daysAhead, 2);
});
