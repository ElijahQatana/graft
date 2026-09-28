import { test } from "node:test";
import { strict as assert } from "node:assert";
import { extractSection } from "../../src/util/markdownSections.ts";

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
