import { test } from "node:test";
import { strict as assert } from "node:assert";
import { extractSection, replaceSection } from "../../src/util/markdownSections.ts";

const doc = `# Series Overview

Some overview text.

# Standing Agenda

- Item one
- Item two

# Occurrences

Nothing here yet.
`;

test("extracts the content between a heading and the next same-level heading", () => {
	assert.equal(extractSection(doc, "# Standing Agenda"), "- Item one\n- Item two");
});

test("extracts content up to a shallower heading too", () => {
	const nested = `## Series Agenda

Nested content.

# Next section
More.
`;
	assert.equal(extractSection(nested, "## Series Agenda"), "Nested content.");
});

test("stops at the next heading of the same level but not a deeper one", () => {
	const withSubheading = `## Series Agenda

Intro text.

### A sub-point

Still part of the section.

## Next section
`;
	assert.equal(
		extractSection(withSubheading, "## Series Agenda"),
		"Intro text.\n\n### A sub-point\n\nStill part of the section.",
	);
});

test("returns undefined when the heading isn't present", () => {
	assert.equal(extractSection(doc, "# Missing Heading"), undefined);
});

test("returns an empty string for a heading with nothing under it", () => {
	const empty = `# Standing Agenda

# Occurrences
`;
	assert.equal(extractSection(empty, "# Standing Agenda"), "");
});

test("replaceSection swaps the content and leaves everything else untouched", () => {
	const body = `# Agenda
## Invite Agenda

Old description

# Context
## Pre Reads

Human-written pre-read notes, must survive.

## Pre Notes
`;
	const updated = replaceSection(body, "## Invite Agenda", "New description from the invite");

	assert.match(updated, /## Invite Agenda\n\nNew description from the invite\n/);
	assert.match(updated, /Human-written pre-read notes, must survive\./);
	assert.doesNotMatch(updated, /Old description/);
});

test("replaceSection stops at a heading of the same level, not a deeper one", () => {
	const body = `# Agenda
## Invite Agenda

Old content

### A note someone added under it

## Series Agenda

Untouched
`;
	const updated = replaceSection(body, "## Invite Agenda", "New content");

	assert.match(updated, /## Invite Agenda\n\nNew content\n/);
	// The whole old subsection, including the human's own sub-heading, is replaced.
	assert.doesNotMatch(updated, /A note someone added/);
	assert.match(updated, /## Series Agenda\n\nUntouched/);
});

test("replaceSection leaves the document unchanged when the heading isn't found", () => {
	const body = "# Agenda\n## Something Else\n\ncontent\n";
	assert.equal(replaceSection(body, "## Invite Agenda", "New content"), body);
});

test("replaceSection is idempotent: replacing twice with the same content gives the same result", () => {
	const body = "# Agenda\n## Invite Agenda\n\nOld\n\n# Context\n";
	const once = replaceSection(body, "## Invite Agenda", "New content");
	const twice = replaceSection(once, "## Invite Agenda", "New content");
	assert.equal(once, twice);
});
