import { test } from "node:test";
import { strict as assert } from "node:assert";
import { buildPersonStub, type FilenameConventionRule } from "../../src/generate/personStub.ts";
import type { CompanyRecord } from "../../src/match/companyMatch.ts";

const rules: FilenameConventionRule[] = [
	{ domain: "solo.example", style: "firstOnly" },
	{ domain: "vendor.example", style: "initialLast" },
];

const companies: CompanyRecord[] = [{ path: "companies/Acme.md", name: "Acme", domain: "solo.example" }];

test("firstOnly style uses just the first name", () => {
	const stub = buildPersonStub(
		{ email: "charlie@solo.example", name: "Charlie Example" },
		rules,
		companies,
	);
	assert.equal(stub.filename, "Charlie");
	assert.equal(stub.frontmatter.full_name, "Charlie Example");
	assert.equal(stub.frontmatter.first_name, "Charlie");
	assert.equal(stub.frontmatter.last_name, "Example");
});

test("initialLast style abbreviates the first name", () => {
	const stub = buildPersonStub(
		{ email: "f.delduca@vendor.example", name: "Frank Delduca" },
		rules,
		companies,
	);
	assert.equal(stub.filename, "F. Delduca");
});

test("an unlisted domain falls back to the full-name style", () => {
	const stub = buildPersonStub({ email: "lara@other.example", name: "Lara Example" }, rules, companies);
	assert.equal(stub.filename, "Lara Example");
});

test("a missing CN falls back to the email's local part rather than being blank", () => {
	const stub = buildPersonStub({ email: "j.doe@other.example" }, rules, companies);
	assert.equal(stub.frontmatter.first_name, "j.doe");
	assert.equal(stub.frontmatter.last_name, "");
	assert.equal(stub.filename, "j.doe");
});

test("a slash or pipe in the name doesn't break the filename", () => {
	const withSlash = buildPersonStub({ email: "x@other.example", name: "A/B Example" }, rules, companies);
	assert.doesNotMatch(withSlash.filename, /\//);

	const withPipe = buildPersonStub({ email: "y@other.example", name: "A|B Example" }, rules, companies);
	assert.doesNotMatch(withPipe.filename, /\|/);
});

test("sets a company link when the attendee's domain matches an existing Company note", () => {
	const stub = buildPersonStub(
		{ email: "charlie@solo.example", name: "Charlie Example" },
		rules,
		companies,
	);
	assert.deepEqual(stub.frontmatter.company, ["[[Acme]]"]);
});

test("leaves company empty when nothing matches, rather than inventing one", () => {
	const stub = buildPersonStub({ email: "lara@other.example", name: "Lara Example" }, rules, companies);
	assert.deepEqual(stub.frontmatter.company, []);
});
