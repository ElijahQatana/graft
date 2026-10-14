import { test } from "node:test";
import { strict as assert } from "node:assert";
import { buildSyncPlan, type FeedConfig } from "../../src/sync/plan.ts";

const WINDOW = {
	start: new Date("2026-08-25T00:00:00Z"),
	end: new Date("2026-09-30T00:00:00Z"),
};

function vevent(uid: string, summary: string): string {
	return `BEGIN:VEVENT
UID:${uid}
DTSTAMP:20260101T000000Z
DTSTART:20260901T140000Z
DTEND:20260901T143000Z
SUMMARY:${summary}
END:VEVENT
`;
}

function icsWith(...vevents: string[]): string {
	return `BEGIN:VCALENDAR\nVERSION:2.0\n${vevents.join("")}END:VCALENDAR\n`;
}

test("fetches both feeds, parses them, and tags events with their feed name", async () => {
	const feeds: FeedConfig[] = [
		{ name: "Google", url: "https://google.example/feed.ics" },
		{ name: "Outlook", url: "https://outlook.example/feed.ics" },
	];
	const fakeFetch = async (url: string) => {
		if (url.includes("google")) return icsWith(vevent("g-1@example.com", "From Google"));
		return icsWith(vevent("o-1@example.com", "From Outlook"));
	};

	const plan = await buildSyncPlan(feeds, WINDOW, [], [], fakeFetch);

	assert.equal(plan.toProcess.length, 2);
	assert.deepEqual(
		plan.toProcess.map((e) => e.source).sort(),
		["Google", "Outlook"],
	);
	assert.equal(plan.errors.length, 0);
});

test("applies the title-match and ignore-list filters to the combined events", async () => {
	const feeds: FeedConfig[] = [{ name: "Google", url: "https://google.example/feed.ics" }];
	const fakeFetch = async () =>
		icsWith(
			vevent("busy-1@example.com", "Synthetic block Focus block"),
			vevent("real-1@example.com", "Real meeting"),
		);

	const plan = await buildSyncPlan(
		feeds,
		WINDOW,
		[{ mode: "prefix", value: "Synthetic block" }],
		[],
		fakeFetch,
	);

	assert.deepEqual(
		plan.toProcess.map((e) => e.uid),
		["real-1@example.com"],
	);
	assert.equal(plan.skipped.length, 1);
});

test("one feed failing to fetch doesn't stop the other feed's events from being processed", async () => {
	const feeds: FeedConfig[] = [
		{ name: "Google", url: "https://google.example/feed.ics" },
		{ name: "Outlook", url: "https://outlook.example/feed.ics" },
	];
	const fakeFetch = async (url: string) => {
		if (url.includes("outlook")) throw new Error("HTTP 401");
		return icsWith(vevent("g-1@example.com", "From Google"));
	};

	const plan = await buildSyncPlan(feeds, WINDOW, [], [], fakeFetch);

	assert.equal(plan.toProcess.length, 1);
	assert.equal(plan.toProcess[0].source, "Google");
	assert.equal(plan.errors.length, 1);
	assert.equal(plan.errors[0].feed, "Outlook");
	assert.equal(plan.errors[0].message, "Calendar feed could not be fetched or parsed.");
});

test("feed errors do not include request or parser details", async () => {
	const feeds: FeedConfig[] = [{ name: "Google", url: "https://example.com/feed.ics?key=synthetic" }];
	for (const failure of [new Error("https://example.com/feed.ics?key=synthetic"), "Synthetic event content"]) {
		const plan = await buildSyncPlan(feeds, WINDOW, [], [], async () => { throw failure; });
		assert.deepEqual(plan.errors, [{ feed: "Google", message: "Calendar feed could not be fetched or parsed." }]);
	}
	const malformed = await buildSyncPlan(feeds, WINDOW, [], [], async () => "Synthetic invalid ICS content");
	assert.deepEqual(malformed.errors, [{ feed: "Google", message: "Calendar feed could not be fetched or parsed." }]);
});

test("an event in more than one calendar is used once, from the earlier calendar", async () => {
	const feeds: FeedConfig[] = [
		{ name: "Work", url: "https://work.example/feed.ics" },
		{ name: "Home", url: "https://home.example/feed.ics" },
		{ name: "Team", url: "https://team.example/feed.ics" },
	];
	const fakeFetch = async (url: string) => {
		if (url.includes("work")) return icsWith(vevent("shared@example.com", "Shared"), vevent("work-only@example.com", "Work only"));
		if (url.includes("home")) return icsWith(vevent("shared@example.com", "Shared copy"), vevent("home-only@example.com", "Home only"));
		return icsWith(vevent("shared@example.com", "Shared again"));
	};

	const plan = await buildSyncPlan(feeds, WINDOW, [], [], fakeFetch);

	assert.deepEqual(plan.toProcess.map((e) => [e.uid, e.source]), [["shared@example.com", "Work"], ["work-only@example.com", "Work"], ["home-only@example.com", "Home"]]);
	assert.deepEqual(plan.skipped.map(({ event, reason }) => [event.source, reason]), [
		["Home", "Same event as one in Work"],
		["Team", "Same event as one in Work"],
	]);
	assert.equal(plan.errors.length, 0);
});

test("occurrences of one series are matched one by one across calendars", async () => {
	const series = (count: number) => `BEGIN:VEVENT
UID:series@example.com
DTSTAMP:20260101T000000Z
DTSTART:20260901T140000Z
DTEND:20260901T143000Z
RRULE:FREQ=DAILY;COUNT=${count}
SUMMARY:Daily
END:VEVENT
`;
	const feeds: FeedConfig[] = [{ name: "Work", url: "https://work.example/feed.ics" }, { name: "Home", url: "https://home.example/feed.ics" }];
	const fakeFetch = async (url: string) => icsWith(series(url.includes("work") ? 2 : 3));

	const plan = await buildSyncPlan(feeds, WINDOW, [], [], fakeFetch);

	assert.deepEqual(plan.toProcess.map((e) => e.source), ["Work", "Work", "Home"]);
	assert.deepEqual(plan.skipped.map(({ event }) => event.source), ["Home", "Home"]);
});

test("a calendar with no events and no calendars at all produce an empty plan", async () => {
	assert.deepEqual(await buildSyncPlan([], WINDOW, [], [], async () => icsWith()), { toProcess: [], skipped: [], errors: [] });
});
