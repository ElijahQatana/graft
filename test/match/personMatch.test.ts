import { test } from "node:test";
import { strict as assert } from "node:assert";
import { matchPerson, type PersonRecord } from "../../src/match/personMatch.ts";

const directory: PersonRecord[] = [
	{ path: "6entities/1people/Sam Example.md", email: "sam@example.com" },
	{
		path: "6entities/1people/Alex Consultant.md",
		email: "alex@vendor.example",
		emailAliases: ["alex@client.example"],
	},
];

test("matches on the primary email, case-insensitively", () => {
	const match = matchPerson({ email: "SAM@Example.com" }, directory);
	assert.equal(match?.path, "6entities/1people/Sam Example.md");
});

test("matches on an email_aliases entry, not just the primary email", () => {
	const match = matchPerson({ email: "alex@client.example" }, directory);
	assert.equal(match?.path, "6entities/1people/Alex Consultant.md");
});

test("returns undefined for an attendee nothing matches", () => {
	const match = matchPerson({ email: "nobody@example.org" }, directory);
	assert.equal(match, undefined);
});
