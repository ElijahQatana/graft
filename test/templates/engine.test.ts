import { test } from "node:test";
import { strict as assert } from "node:assert";
import { renderTemplate } from "../../src/templates/engine.ts";

test("substitutes every known placeholder", () => {
	const result = renderTemplate("{{title}} with {{organizer}}", {
		title: "Weekly Sync",
		organizer: "Alex",
	});
	assert.equal(result, "Weekly Sync with Alex");
});

test("leaves an unknown placeholder visibly unresolved", () => {
	const result = renderTemplate("{{title}}: {{typo_field}}", { title: "Weekly Sync" });
	assert.equal(result, "Weekly Sync: {{typo_field}}");
});

test("an empty string value still substitutes, it's not treated as unknown", () => {
	const result = renderTemplate("[{{description}}]", { description: "" });
	assert.equal(result, "[]");
});

test("a template with no placeholders passes through unchanged", () => {
	assert.equal(renderTemplate("Plain text", {}), "Plain text");
});
