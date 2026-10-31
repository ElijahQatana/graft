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

test("events keep feed order even when a later feed answers first", async () => {
	const feeds: FeedConfig[] = [
		{ name: "Work", url: "https://work.example/feed.ics" },
		{ name: "Home", url: "https://home.example/feed.ics" },
	];
	let releaseWork: (text: string) => void = () => {};
	const work = new Promise<string>((resolve) => { releaseWork = resolve; });
	const fakeFetch = (url: string) => {
		if (url.includes("work")) return work;
		return Promise.resolve(icsWith(vevent("h-1@example.com", "From Home")));
	};

	const planned = buildSyncPlan(feeds, WINDOW, [], [], fakeFetch);
	await new Promise((resolve) => setImmediate(resolve));
	releaseWork(icsWith(vevent("w-1@example.com", "From Work")));
	const plan = await planned;

	assert.deepEqual(plan.toProcess.map((e) => e.source), ["Work", "Home"]);
});

test("a failing feed in the middle leaves the feeds around it and reports only its own error", async () => {
	const feeds: FeedConfig[] = [
		{ name: "Work", url: "https://work.example/feed.ics" },
		{ name: "Broken", url: "https://broken.example/feed.ics" },
		{ name: "Home", url: "https://home.example/feed.ics" },
	];
	const fakeFetch = async (url: string) => {
		if (url.includes("broken")) throw new Error("HTTP 500");
		if (url.includes("work")) return icsWith(vevent("w-1@example.com", "From Work"));
		return icsWith(vevent("h-1@example.com", "From Home"));
	};

	const plan = await buildSyncPlan(feeds, WINDOW, [], [], fakeFetch);

	assert.deepEqual(plan.toProcess.map((e) => e.source), ["Work", "Home"]);
	assert.deepEqual(plan.errors, [{ feed: "Broken", message: "Calendar feed could not be fetched or parsed." }]);
});

test("all feeds are requested before the first one finishes", async () => {
	const feeds: FeedConfig[] = [
		{ name: "Work", url: "https://work.example/feed.ics" },
		{ name: "Home", url: "https://home.example/feed.ics" },
	];
	const requested: string[] = [];
	let releaseWork: (text: string) => void = () => {};
	const fakeFetch = (url: string) => {
		requested.push(url);
		if (url.includes("work")) return new Promise<string>((resolve) => { releaseWork = resolve; });
		return Promise.resolve(icsWith());
	};

	const planned = buildSyncPlan(feeds, WINDOW, [], [], fakeFetch);
	assert.deepEqual(requested, ["https://work.example/feed.ics", "https://home.example/feed.ics"]);
	releaseWork(icsWith());
	await planned;
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

test("accepted-only drops events the user has not accepted, using the synthetic RSVP feed", async () => {
	const { readFile } = await import("node:fs/promises");
	const ics = await readFile(new URL("../fixtures/synthetic/rsvp.ics", import.meta.url), "utf8");
	const feeds: FeedConfig[] = [{ name: "Work", url: "https://work.example/feed.ics", invitedAs: "alex.tester@example.com" }];
	const fetchFeed = async () => ics;

	const off = await buildSyncPlan(feeds, WINDOW, [], [], fetchFeed);
	assert.equal(off.toProcess.length, 7);
	assert.equal(off.skipped.length, 0);

	const on = await buildSyncPlan(feeds, WINDOW, [], [], fetchFeed, true);
	assert.deepEqual(on.toProcess.map((e) => e.uid).sort(), [
		"rsvp-accepted@example.com", "rsvp-no-guests@example.com", "rsvp-no-partstat@example.com", "rsvp-organiser@example.com",
	]);
	assert.deepEqual(on.skipped.map((s) => [s.event.uid, s.reason]).sort(), [
		["rsvp-declined@example.com", "not accepted (declined)"],
		["rsvp-needs-action@example.com", "not accepted (no response yet)"],
		["rsvp-tentative@example.com", "not accepted (tentative)"],
	]);
});

test("strips configured prefixes from titles before title rules run", async () => {
	const feeds: FeedConfig[] = [{ name: "Google", url: "https://google.example/feed.ics" }];
	const fakeFetch = async () => icsWith(vevent("a@example.com", "FW: Budget review"), vevent("b@example.com", "Fwd: Skip me"));

	const plan = await buildSyncPlan(
		feeds, WINDOW, [{ mode: "exact", value: "Skip me" }], [], fakeFetch, false, ["FW:", "Fwd:"],
	);

	assert.deepEqual(plan.toProcess.map((e) => [e.uid, e.summary]), [["a@example.com", "Budget review"]]);
	assert.equal(plan.skipped.length, 1);
});

test("leaves titles alone when no prefixes are configured", async () => {
	const feeds: FeedConfig[] = [{ name: "Google", url: "https://google.example/feed.ics" }];
	const plan = await buildSyncPlan(feeds, WINDOW, [], [], async () => icsWith(vevent("a@example.com", "FW: Budget review")));
	assert.equal(plan.toProcess[0].summary, "FW: Budget review");
});

function timedEvent(uid: string, summary: string, start: string, end: string, extra = ""): string {
	return `BEGIN:VEVENT
UID:${uid}
DTSTAMP:20260101T000000Z
DTSTART:${start}
DTEND:${end}
SUMMARY:${summary}
${extra}END:VEVENT
`;
}

const MIRROR_FEEDS: FeedConfig[] = [
	{ name: "Work", url: "https://work.example/feed.ics" },
	{ name: "Home", url: "https://home.example/feed.ics" },
];

function mirrorFetch(work: string, home: string) {
	return async (url: string) => (url.includes("work") ? work : home);
}

test("merging duplicates is off by default and changes nothing", async () => {
	const fetchFeed = mirrorFetch(
		icsWith(vevent("w-1@example.com", "Budget review")),
		icsWith(vevent("h-1@example.com", "Budget review")),
	);
	const plan = await buildSyncPlan(MIRROR_FEEDS, WINDOW, [], [], fetchFeed);
	assert.deepEqual(plan.toProcess.map((e) => e.uid), ["w-1@example.com", "h-1@example.com"]);
	assert.equal(plan.skipped.length, 0);
});

test("merging keeps the earlier calendar's event and lists the other copy as skipped", async () => {
	const fetchFeed = mirrorFetch(
		icsWith(vevent("w-1@example.com", "Budget review")),
		icsWith(vevent("h-1@example.com", "Budget review")),
	);
	const plan = await buildSyncPlan(MIRROR_FEEDS, WINDOW, [], [], fetchFeed, false, [], true);
	assert.deepEqual(plan.toProcess.map((e) => [e.uid, e.source]), [["w-1@example.com", "Work"]]);
	assert.deepEqual(plan.skipped.map((s) => [s.event.uid, s.reason]), [["h-1@example.com", "Duplicate of Budget review from Work"]]);
});

test("merging compares times as instants across time zones", async () => {
	const fetchFeed = mirrorFetch(
		icsWith(timedEvent("w-1@example.com", "Budget review", "20260901T140000Z", "20260901T143000Z")),
		icsWith(timedEvent("h-1@example.com", "Budget review", "TZID=America/New_York:20260901T100000", "TZID=America/New_York:20260901T103000")),
	);
	const plan = await buildSyncPlan(MIRROR_FEEDS, WINDOW, [], [], fetchFeed, false, [], true);
	assert.deepEqual(plan.toProcess.map((e) => e.uid), ["w-1@example.com"]);
});

test("merging matches recurring occurrences one at a time", async () => {
	const weekly = "RRULE:FREQ=WEEKLY;COUNT=3\n";
	const home = timedEvent("h-1@example.com", "Weekly sync", "20260901T140000Z", "20260901T143000Z", weekly)
		+ timedEvent("h-1@example.com", "Weekly sync moved", "20260909T150000Z", "20260909T153000Z", "RECURRENCE-ID:20260908T140000Z\n");
	const fetchFeed = mirrorFetch(
		icsWith(timedEvent("w-1@example.com", "Weekly sync", "20260901T140000Z", "20260901T143000Z", weekly)),
		icsWith(home),
	);
	const plan = await buildSyncPlan(MIRROR_FEEDS, WINDOW, [], [], fetchFeed, false, [], true);
	assert.deepEqual(plan.toProcess.filter((e) => e.source === "Work").length, 3);
	assert.deepEqual(plan.toProcess.filter((e) => e.source === "Home").map((e) => e.summary), ["Weekly sync moved"]);
	assert.equal(plan.skipped.length, 2);
});

test("a Busy block skipped by a title rule never wins over the full-detail copy", async () => {
	const fetchFeed = mirrorFetch(
		icsWith(vevent("w-1@example.com", "Busy")),
		icsWith(vevent("h-1@example.com", "Budget review")),
	);
	const plan = await buildSyncPlan(MIRROR_FEEDS, WINDOW, [{ mode: "exact", value: "busy" }], [], fetchFeed, false, [], true);
	assert.deepEqual(plan.toProcess.map((e) => e.uid), ["h-1@example.com"]);
	assert.deepEqual(plan.skipped.map((s) => s.reason), ['title matched exact "busy"']);
});

test("a declined copy is dropped by accepted-only before merging, so it cannot win", async () => {
	const feeds: FeedConfig[] = [
		{ name: "Work", url: "https://work.example/feed.ics", invitedAs: "alex.tester@example.com" },
		{ name: "Home", url: "https://home.example/feed.ics" },
	];
	const declined = "ATTENDEE;PARTSTAT=DECLINED:mailto:alex.tester@example.com\n";
	const fetchFeed = mirrorFetch(
		icsWith(timedEvent("w-1@example.com", "Budget review", "20260901T140000Z", "20260901T143000Z", declined)),
		icsWith(vevent("h-1@example.com", "Budget review")),
	);
	const plan = await buildSyncPlan(feeds, WINDOW, [], [], fetchFeed, true, [], true);
	assert.deepEqual(plan.toProcess.map((e) => e.uid), ["h-1@example.com"]);
});
