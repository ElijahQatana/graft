import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
	matchCompanyByDomain,
	validateCompanyLinks,
	type CompanyRecord,
} from "../../src/match/companyMatch.ts";

const directory: CompanyRecord[] = [
	{ path: "companies/Acme.md", name: "Acme", domain: "acme.example" },
	{ path: "companies/Beta Corp.md", name: "Beta Corp", domain: "beta.example" },
];

test("matches an attendee's email domain against a Company note's domain field", () => {
	const match = matchCompanyByDomain("sam@ACME.example", directory);
	assert.equal(match?.name, "Acme");
});

test("returns undefined for a domain with no matching Company note", () => {
	assert.equal(matchCompanyByDomain("sam@unknown.example", directory), undefined);
});

test("validateCompanyLinks keeps only links that match an existing Company note's filename", () => {
	const result = validateCompanyLinks(["[[Acme]]", "[[Ghost Company]]", "[[Beta Corp]]"], directory);
	assert.deepEqual(result, ["[[Acme]]", "[[Beta Corp]]"]);
});

test("validateCompanyLinks drops a stale link even if it once looked plausible", () => {
	const result = validateCompanyLinks(["[[Old Renamed Co]]"], directory);
	assert.deepEqual(result, []);
});
