import { Modal, type App } from "obsidian";
import type { SyncPreview } from "./plan.ts";

const warningText = {
	"unresolved-company": "Unresolved Company link. The link will be omitted.",
	"ambiguous-person": "Ambiguous Person match. Check the matching notes before syncing.",
	"vanished-event": "Event missing from the feed. This does not mark it cancelled.",
};

/** Read-only display. Command and Apply wiring belongs to the sync flow. */
export class SyncPreviewModal extends Modal {
	constructor(app: App, private preview: SyncPreview) {
		super(app);
	}

	onOpen() {
		const root = this.contentEl;
		root.empty();
		root.createEl("h2", { text: "Graft sync preview" });
		root.createEl("p", { text: "Dry run. No notes have been written." });
		const { newMeetings, updates, personStubs, seriesStubs, skipped, errors, warnings } = this.preview;
		root.createEl("p", { text: `${newMeetings.length} new Meetings, ${updates.length} existing Meetings, ${personStubs.length} Person stubs, ${seriesStubs.length} Series stubs, ${skipped.length} skipped.` });
		if (!newMeetings.length && !updates.length && !personStubs.length && !seriesStubs.length) {
			root.createEl("p", { text: "No note changes planned." });
		}
		if (newMeetings.length) {
			root.createEl("h3", { text: "New Meeting notes" });
			for (const { path, note } of newMeetings) {
				const details = root.createEl("details");
				details.createEl("summary", { text: path });
				showFields(details, note.frontmatter);
				details.createEl("pre", { text: note.body });
			}
		}
		if (updates.length) {
			root.createEl("h3", { text: "Existing Meeting notes" });
			for (const { path, changes } of updates) {
				const details = root.createEl("details");
				details.createEl("summary", { text: `${path} (${changes.length} changes)` });
				if (!changes.length) details.createEl("p", { text: "No field changes." });
				else {
					const table = details.createEl("table");
					const heading = table.createEl("tr");
					for (const text of ["Field", "Old", "New"]) heading.createEl("th", { text });
					for (const change of changes) {
						const row = table.createEl("tr");
						for (const text of [change.field, displayValue(change.before), displayValue(change.after)]) row.createEl("td", { text });
					}
				}
			}
		}
		for (const [label, stubs] of [["New Person stubs", personStubs], ["New Series stubs", seriesStubs]] as const) {
			if (!stubs.length) continue;
			root.createEl("h3", { text: label });
			for (const { path, stub } of stubs) {
				const details = root.createEl("details");
				details.createEl("summary", { text: path });
				showFields(details, stub.frontmatter);
			}
		}
		if (skipped.length) {
			root.createEl("h3", { text: "Skipped events" });
			for (const { event, reason } of skipped) root.createEl("p", { text: `${event.summary}: ${reason}` });
		}
		if (warnings.length) {
			root.createEl("h3", { text: "Warnings" });
			for (const warning of warnings) root.createEl("p", { text: `${warning.subject}: ${warningText[warning.kind]}` });
		}
		if (errors.length) {
			root.createEl("h3", { text: "Feed errors" });
			root.createEl("p", { text: "Some feeds could not be read. This preview is incomplete." });
			for (const error of errors) root.createEl("p", { text: `${error.feed}: Calendar feed could not be fetched or parsed.` });
		}
		root.createEl("button", { text: "Close", attr: { type: "button" } }).addEventListener("click", () => this.close());
	}

	onClose() {
		this.contentEl.empty();
	}
}

function showFields(container: HTMLElement, fields: Record<string, unknown>) {
	const list = container.createEl("dl");
	for (const [field, value] of Object.entries(fields)) {
		list.createEl("dt", { text: field });
		list.createEl("dd", { text: displayValue(value) });
	}
}

function displayValue(value: unknown): string {
	if (value === undefined) return "(missing)";
	return typeof value === "string" ? value || "(empty)" : JSON.stringify(value);
}
