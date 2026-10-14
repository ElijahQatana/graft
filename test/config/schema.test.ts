import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
	MINIMAL_SCHEMA, ORIGINAL_SCHEMA, cloneSchema, evaluateExtras, isExtraField, isFieldName, isHeading,
	loadSchema, schemaConflict,
} from "../../src/config/schema.ts";
import { DEFAULT_SETTINGS, loadGraftSettings } from "../../src/config/settings.ts";

test("new installs get the minimal schema and saved settings without a schema keep the original", () => {
	assert.deepEqual(loadGraftSettings({}).schema, MINIMAL_SCHEMA);
	assert.deepEqual(loadGraftSettings(null).schema, MINIMAL_SCHEMA);
	assert.deepEqual(DEFAULT_SETTINGS.schema, MINIMAL_SCHEMA);
	assert.deepEqual(loadGraftSettings({ daysBack: 3 }).schema, ORIGINAL_SCHEMA);
	assert.deepEqual(loadGraftSettings({ daysBack: 3, schema: {} }).schema, MINIMAL_SCHEMA);
});

test("the minimal schema is small and the original schema keeps its vault-specific properties", () => {
	assert.deepEqual(MINIMAL_SCHEMA.meetingExtras, []);
	assert.equal(MINIMAL_SCHEMA.series.uid, "ics_uid");
	assert.equal(ORIGINAL_SCHEMA.series.uid, "google_recurring_event_id");
	const keys = ORIGINAL_SCHEMA.meetingExtras.map((field) => field.key);
	for (const key of ["subtype", "status", "week", "companies", "Tags", "transcript"]) assert.ok(keys.includes(key), key);
	assert.equal(schemaConflict(MINIMAL_SCHEMA), undefined);
	assert.equal(schemaConflict(ORIGINAL_SCHEMA), undefined);
});

test("schema settings survive JSON persistence and do not share objects", () => {
	const saved = cloneSchema(MINIMAL_SCHEMA);
	saved.typeField = "kind";
	saved.meeting.uid = "cal_uid";
	saved.meeting.occurrenceStatus = "";
	saved.headings.inviteAgenda = "### Invite";
	saved.meetingExtras = [{ key: "tags", value: ["Meeting"], updateOnSync: false }];
	const loaded = loadSchema(JSON.parse(JSON.stringify(saved)), MINIMAL_SCHEMA);
	assert.deepEqual(loaded, saved);
	loaded.meetingExtras[0].value = ["Changed"];
	assert.deepEqual(saved.meetingExtras[0].value, ["Meeting"]);
});

test("invalid saved values fall back one at a time", () => {
	const loaded = loadSchema({
		typeField: "", types: { meeting: " Call", person: "Contact" },
		meeting: { title: "a:b", uid: "cal_uid", date: "" },
		headings: { inviteAgenda: "Invite", seriesAgenda: "## Mine" },
		meetingBody: "  ", meetingExtras: [{ key: "x", value: 5, updateOnSync: false }],
	}, MINIMAL_SCHEMA);
	assert.equal(loaded.typeField, "type");
	assert.equal(loaded.types.meeting, "Meeting");
	assert.equal(loaded.types.person, "Contact");
	assert.equal(loaded.meeting.title, "title");
	assert.equal(loaded.meeting.uid, "cal_uid");
	assert.equal(loaded.meeting.date, "date");
	assert.equal(loaded.headings.inviteAgenda, "## Invite Agenda");
	assert.equal(loaded.headings.seriesAgenda, "## Mine");
	assert.equal(loaded.meetingBody, MINIMAL_SCHEMA.meetingBody);
	assert.deepEqual(loaded.meetingExtras, []);
});

test("only optional Meeting properties may be blank", () => {
	const loaded = loadSchema({ meeting: { inviteUpdated: "", occurrenceStatus: "", title: "" } }, MINIMAL_SCHEMA);
	assert.equal(loaded.meeting.inviteUpdated, "");
	assert.equal(loaded.meeting.occurrenceStatus, "");
	assert.equal(loaded.meeting.title, "title");
});

test("duplicate property names within a note type revert the whole schema", () => {
	const clash = cloneSchema(MINIMAL_SCHEMA);
	clash.meeting.title = "date";
	assert.match(schemaConflict(clash) ?? "", /meeting/);
	assert.deepEqual(loadSchema(clash, MINIMAL_SCHEMA), MINIMAL_SCHEMA);
	const extra = cloneSchema(MINIMAL_SCHEMA);
	extra.meetingExtras = [{ key: "title", value: "", updateOnSync: false }];
	assert.ok(schemaConflict(extra));
	const type = cloneSchema(MINIMAL_SCHEMA);
	type.typeField = "email";
	assert.ok(schemaConflict(type));
	const same = cloneSchema(MINIMAL_SCHEMA);
	same.series.uid = "ics_uid";
	assert.equal(schemaConflict(same), undefined);
});

test("validators reject unsafe names, headings, and extra fields", () => {
	for (const name of ["", " a", "a ", "a:b", "a\nb", "__proto__", "constructor", "x".repeat(101)]) assert.equal(isFieldName(name), false, name);
	assert.equal(isFieldName("Tags"), true);
	for (const heading of ["Title", "#Title", "####### Title", "## ", "## A\nB", " ## A"]) assert.equal(isHeading(heading), false, heading);
	assert.equal(isHeading("### Notes & More"), true);
	assert.equal(isExtraField({ key: "a", value: ["x"], updateOnSync: true }), true);
	for (const field of [null, [], { key: "a", value: 1, updateOnSync: true }, { key: "a", value: "x" }, { key: "a:b", value: "x", updateOnSync: false }, { key: "a", value: [1], updateOnSync: false }]) assert.equal(isExtraField(field), false);
});

const context = { title: "Sync", date: "2026-09-01", week: "2026-W36", month: "2026-09", year: "2026", weekday: "Tuesday", recurrence: "OneOff", companies: ["[[Acme]]", "[[Beta]]"] };

test("extra fields fill placeholders and keep types", () => {
	const result = evaluateExtras([
		{ key: "week", value: "{{week}}", updateOnSync: false },
		{ key: "label", value: "{{weekday}}: {{title}} {{unknown}}", updateOnSync: false },
		{ key: "orgs", value: "{{companies}}", updateOnSync: true },
		{ key: "tags", value: ["Meeting", "{{year}}"], updateOnSync: false },
		{ key: "both", value: ["{{companies}}", "x"], updateOnSync: false },
		{ key: "blank", value: "", updateOnSync: false },
	], context);
	assert.deepEqual(result, {
		week: "2026-W36", label: "Tuesday: Sync {{unknown}}", orgs: ["[[Acme]]", "[[Beta]]"],
		tags: ["Meeting", "2026"], both: ["[[Acme]]", "[[Beta]]", "x"], blank: "",
	});
});

test("updates include only extras marked to update on every sync", () => {
	const extras = [
		{ key: "kept", value: "x", updateOnSync: false },
		{ key: "orgs", value: "{{companies}}", updateOnSync: true },
	];
	assert.deepEqual(evaluateExtras(extras, context, true), { orgs: ["[[Acme]]", "[[Beta]]"] });
	assert.deepEqual(Object.keys(evaluateExtras(extras, context)), ["kept", "orgs"]);
});

test("status and recurrence values default to the original output and load from saved settings", () => {
	for (const schema of [MINIMAL_SCHEMA, ORIGINAL_SCHEMA]) {
		assert.deepEqual(schema.statusValues, { scheduled: "Scheduled", cancelled: "Cancelled" });
		assert.deepEqual(schema.recurrenceValues, { series: "RegularSync", oneOff: "OneOff" });
	}
	const { statusValues, recurrenceValues, ...older } = cloneSchema(MINIMAL_SCHEMA);
	assert.deepEqual(loadSchema(older, MINIMAL_SCHEMA), MINIMAL_SCHEMA);
	assert.deepEqual(loadGraftSettings({ daysBack: 3 }).schema.statusValues, ORIGINAL_SCHEMA.statusValues);
	const saved = cloneSchema(MINIMAL_SCHEMA);
	saved.statusValues = { scheduled: "Planned", cancelled: "Called off" };
	saved.recurrenceValues = { series: "Recurring", oneOff: "Single" };
	assert.deepEqual(loadSchema(JSON.parse(JSON.stringify(saved)), MINIMAL_SCHEMA), saved);
});

test("invalid or clashing status and recurrence values fall back", () => {
	const loaded = loadSchema({ statusValues: { scheduled: " Planned", cancelled: "Dropped" }, recurrenceValues: { series: "", oneOff: 5 } }, MINIMAL_SCHEMA);
	assert.deepEqual(loaded.statusValues, { scheduled: "Scheduled", cancelled: "Dropped" });
	assert.deepEqual(loaded.recurrenceValues, MINIMAL_SCHEMA.recurrenceValues);
	assert.deepEqual(loadSchema({ statusValues: { scheduled: "Same", cancelled: "Same" } }, MINIMAL_SCHEMA), MINIMAL_SCHEMA);
	const clash = cloneSchema(MINIMAL_SCHEMA);
	clash.recurrenceValues.series = clash.recurrenceValues.oneOff;
	assert.ok(schemaConflict(clash));
});

test("the original schema does not refresh channel, and stored copies that did are corrected", () => {
	const channel = (schema: typeof ORIGINAL_SCHEMA) => schema.meetingExtras.find((field) => field.key === "channel");
	assert.equal(channel(ORIGINAL_SCHEMA)?.updateOnSync, false);
	const stale = cloneSchema(ORIGINAL_SCHEMA);
	stale.meetingExtras = stale.meetingExtras.map((field) => field.key === "channel" ? { ...field, updateOnSync: true } : field);
	const loaded = loadGraftSettings(JSON.parse(JSON.stringify({ daysBack: 3, schema: stale }))).schema;
	assert.equal(channel(loaded)?.updateOnSync, false);
	assert.equal(loaded.meetingExtras.find((field) => field.key === "companies")?.updateOnSync, true);
	const custom = cloneSchema(ORIGINAL_SCHEMA);
	custom.meetingExtras = [{ key: "channel", value: "#general", updateOnSync: true }];
	assert.equal(channel(loadSchema(custom, MINIMAL_SCHEMA))?.updateOnSync, true);
});

test("the original schema's new-note extras are unchanged", () => {
	const context = { title: "T", date: "2026-10-04", week: "W40", month: "October", year: "2026", weekday: "Sunday", recurrence: "OneOff", companies: ["[[Acme]]"] };
	const created = evaluateExtras(ORIGINAL_SCHEMA.meetingExtras, context);
	assert.equal(created.channel, "");
	assert.deepEqual(Object.keys(created), ORIGINAL_SCHEMA.meetingExtras.map((field) => field.key));
	assert.deepEqual(Object.keys(evaluateExtras(ORIGINAL_SCHEMA.meetingExtras, context, true)), ["companies"]);
});
