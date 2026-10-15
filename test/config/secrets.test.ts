import { test } from "node:test";
import { strict as assert } from "node:assert";
import { hydrateSecrets, prepareForSave, secretIdFor, secretStoreOf } from "../../src/config/secrets.ts";
import { isCalendarId, loadGraftSettings, newCalendarId } from "../../src/config/settings.ts";

function mockStore(initial: Record<string, string> = {}, failOn?: string) {
	const secrets = new Map(Object.entries(initial));
	return {
		secrets,
		getSecret(id: string) { if (failOn === "get") throw new Error("synthetic storage failure"); return secrets.get(id) ?? null; },
		setSecret(id: string, value: string) { if (failOn === "set") throw new Error("synthetic storage failure"); secrets.set(id, value); },
	};
}
const calendar = (id: string, url: string) => ({ id, name: `Cal ${id}`, type: "google" as const, url, invitedAs: "" });
const withCalendars = (...calendars: ReturnType<typeof calendar>[]) => ({ ...loadGraftSettings({}), calendars });

test("calendar ids are valid secret ids and unique", () => {
	const taken = new Set<string>();
	for (let i = 0; i < 500; i++) {
		const id = newCalendarId(taken);
		assert.equal(isCalendarId(id), true);
		assert.match(secretIdFor(id), /^[a-z0-9]+(-[a-z0-9]+)*$/);
		assert.equal(taken.has(id), false);
		taken.add(id);
	}
	assert.equal(isCalendarId("Upper"), false);
	assert.equal(isCalendarId("has-dash"), false);
	assert.equal(isCalendarId(""), false);
});

test("loading gives every calendar a unique id and keeps valid saved ids", () => {
	const loaded = loadGraftSettings({
		calendars: [
			{ id: "keep1", name: "A", type: "google", url: "https://example.com/a.ics" },
			{ id: "keep1", name: "B", type: "google", url: "https://example.com/b.ics" },
			{ id: "BAD ID", name: "C", type: "google", url: "https://example.com/c.ics" },
			{ name: "D", type: "outlook", url: "https://example.com/d.ics" },
		],
	});
	const ids = loaded.calendars.map((item) => item.id);
	assert.equal(ids[0], "keep1");
	assert.equal(new Set(ids).size, 4);
	assert.ok(ids.every(isCalendarId));
});

test("a saved calendar with an id and no URL loads with an empty URL; one without an id is dropped", () => {
	const loaded = loadGraftSettings({ calendars: [{ id: "abc", name: "A", type: "google" }, { name: "B", type: "google" }] });
	assert.deepEqual(loaded.calendars.map(({ id, name, url }) => [id, name, url]), [["abc", "A", ""]]);
});

test("secretStoreOf detects storage and tolerates its absence", () => {
	assert.equal(secretStoreOf({} as never), undefined);
	assert.equal(secretStoreOf({ secretStorage: {} } as never), undefined);
	assert.equal(secretStoreOf(undefined as never), undefined);
	const store = mockStore();
	assert.equal(secretStoreOf({ secretStorage: store } as never), store);
});

test("saving puts the URL in storage and leaves none in the saved data", () => {
	const store = mockStore();
	const { data, failed } = prepareForSave(withCalendars(calendar("one", "https://example.com/one.ics")), store);
	assert.equal(failed, 0);
	assert.equal(store.secrets.get("graft-calendar-one"), "https://example.com/one.ics");
	assert.equal(data.calendars[0].url, "");
	assert.equal(JSON.stringify(data).includes("example.com/one"), false);
});

test("saving does not overwrite a secret with an empty URL", () => {
	const store = mockStore({ "graft-calendar-one": "https://example.com/one.ics" });
	prepareForSave(withCalendars(calendar("one", "")), store);
	assert.equal(store.secrets.get("graft-calendar-one"), "https://example.com/one.ics");
});

test("loading fills the URL from storage", () => {
	const store = mockStore({ "graft-calendar-one": "https://example.com/one.ics" });
	const settings = loadGraftSettings({ calendars: [{ id: "one", name: "A", type: "google" }] });
	assert.deepEqual(hydrateSecrets(settings, store), { moved: 0, failed: 0 });
	assert.equal(settings.calendars[0].url, "https://example.com/one.ics");
});

test("a missing secret leaves the URL empty", () => {
	const settings = loadGraftSettings({ calendars: [{ id: "one", name: "A", type: "google" }] });
	assert.deepEqual(hydrateSecrets(settings, mockStore()), { moved: 0, failed: 0 });
	assert.equal(settings.calendars[0].url, "");
});

test("a plain-text URL moves into storage once and is gone from the next saved data", () => {
	const store = mockStore();
	const settings = loadGraftSettings({ calendars: [{ id: "one", name: "A", type: "google", url: "https://example.com/one.ics" }] });
	assert.deepEqual(hydrateSecrets(settings, store), { moved: 1, failed: 0 });
	assert.equal(store.secrets.get("graft-calendar-one"), "https://example.com/one.ics");
	assert.equal(settings.calendars[0].url, "https://example.com/one.ics");
	assert.equal(prepareForSave(settings, store).data.calendars[0].url, "");
});

test("old fixed Google and Outlook feeds migrate with new ids", () => {
	const store = mockStore();
	const settings = loadGraftSettings({ feeds: { google: { url: "https://example.com/google.ics" }, outlook: { url: "https://example.com/outlook.ics" } } });
	assert.equal(hydrateSecrets(settings, store).moved, 2);
	const saved = prepareForSave(settings, store).data;
	assert.equal(JSON.stringify(saved).includes("example.com/"), false);
	assert.deepEqual([...store.secrets.values()].sort(), ["https://example.com/google.ics", "https://example.com/outlook.ics"]);
	const reloaded = loadGraftSettings(JSON.parse(JSON.stringify(saved)));
	hydrateSecrets(reloaded, store);
	assert.deepEqual(reloaded.calendars.map((item) => item.url), ["https://example.com/google.ics", "https://example.com/outlook.ics"]);
});

test("removed calendars have their secret cleared", () => {
	const store = mockStore({ "graft-calendar-gone": "https://example.com/gone.ics" });
	prepareForSave(withCalendars(), store, ["gone"]);
	assert.equal(store.secrets.get("graft-calendar-gone"), "");
});

test("without storage nothing changes", () => {
	const settings = withCalendars(calendar("one", "https://example.com/one.ics"));
	assert.deepEqual(prepareForSave(settings, undefined, ["x"]), { data: settings, failed: 0 });
	assert.deepEqual(hydrateSecrets(settings, undefined), { moved: 0, failed: 0 });
});

test("storage errors keep the URL and never surface it", () => {
	const settings = withCalendars(calendar("one", "https://example.com/one.ics"));
	const saved = prepareForSave(settings, mockStore({}, "set"));
	assert.equal(saved.failed, 1);
	assert.equal(saved.data.calendars[0].url, "https://example.com/one.ics");
	const loaded = loadGraftSettings({ calendars: [{ id: "one", name: "A", type: "google", url: "https://example.com/one.ics" }] });
	assert.deepEqual(hydrateSecrets(loaded, mockStore({}, "set")), { moved: 0, failed: 1 });
	assert.equal(loaded.calendars[0].url, "https://example.com/one.ics");
	const empty = loadGraftSettings({ calendars: [{ id: "one", name: "A", type: "google" }] });
	assert.deepEqual(hydrateSecrets(empty, mockStore({}, "get")), { moved: 0, failed: 1 });
	assert.equal(empty.calendars[0].url, "");
});
