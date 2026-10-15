import { Modal, type App } from "obsidian";
import type { SyncPreview } from "./plan.ts";
import { buildSummary, count } from "./summary.ts";

const warningText = {
	"unresolved-company": "Unresolved Company link. The link will be omitted.",
	"ambiguous-person": "Ambiguous Person match. Check the matching notes before syncing.",
	"vanished-event": "Event missing from the feed. This does not mark it cancelled.",
	"missing-invite-heading": "No invite agenda heading in this note, so its agenda is not updated. Add the heading or check the Headings setting.",
};

/** Displays a prepared plan. Applying never fetches the feeds again. */
export class SyncPreviewModal extends Modal {
	private applying = false;
	private consumed = false;
	constructor(app: App, private preview: SyncPreview,
		private apply?: () => Promise<void>, private done?: () => void) {
		super(app);
	}

	onOpen() {
		this.modalEl?.classList?.add("graft-preview-modal");
		this.setTitle("Graft sync preview");
		this.contentEl.empty();
		const root = this.contentEl.createEl("div", { cls: "graft-preview" });
		const head = root.createEl("div", { cls: "graft-preview-head" });
		head.createEl("p", { text: "Dry run. No notes have been written.", cls: "graft-muted" });
		const body = root.createEl("div", { cls: "graft-preview-body" });
		const { newMeetings, updates, personStubs, seriesStubs, skipped, errors, warnings } = this.preview;
		body.createEl("p", { text: buildSummary(this.preview), cls: "graft-summary" });
		const hasWrites = newMeetings.length > 0 || personStubs.length > 0 || seriesStubs.length > 0 || updates.some((update) => update.changes.length > 0);
		if (!newMeetings.length && !updates.length && !personStubs.length && !seriesStubs.length) {
			body.createEl("p", { text: "No note changes planned.", cls: "graft-empty" });
		}
		if (newMeetings.length) {
			const section = body.createEl("div", { cls: "graft-section" });
			section.createEl("h3", { text: "New Meeting notes" });
			for (const { path, note } of newMeetings) {
				const details = section.createEl("details", { cls: "graft-item" });
				details.createEl("summary", { text: path });
				const content = details.createEl("div", { cls: "graft-item-body" });
				showFields(content, note.frontmatter);
				content.createEl("pre", { text: note.body, cls: "graft-note-body" });
			}
		}
		if (updates.length) {
			const section = body.createEl("div", { cls: "graft-section" });
			section.createEl("h3", { text: "Existing Meeting notes" });
			for (const { path, changes } of updates) {
				const details = section.createEl("details", { cls: changes.length ? "graft-item" : "graft-item graft-item-clean" });
				details.createEl("summary", { text: `${path} (${count(changes.length, "change")})` });
				const content = details.createEl("div", { cls: "graft-item-body" });
				if (!changes.length) content.createEl("p", { text: "No field changes.", cls: "graft-muted" });
				else {
					const table = content.createEl("div", { cls: "graft-scroll" }).createEl("table", { cls: "graft-changes" });
					const heading = table.createEl("tr");
					for (const text of ["Field", "Old", "New"]) heading.createEl("th", { text });
					for (const change of changes) {
						const row = table.createEl("tr");
						row.createEl("td", { text: change.field, cls: "graft-field" });
						row.createEl("td", { text: displayValue(change.before), cls: "graft-old" });
						row.createEl("td", { text: displayValue(change.after), cls: "graft-new" });
					}
				}
			}
		}
		for (const [label, stubs] of [["New Person stubs", personStubs], ["New Series stubs", seriesStubs]] as const) {
			if (!stubs.length) continue;
			const section = body.createEl("div", { cls: "graft-section" });
			section.createEl("h3", { text: label });
			for (const { path, stub, body: stubBody } of stubs) {
				const details = section.createEl("details", { cls: "graft-item" });
				details.createEl("summary", { text: path });
				const content = details.createEl("div", { cls: "graft-item-body" });
				showFields(content, stub.frontmatter);
				if (stubBody) content.createEl("pre", { text: stubBody, cls: "graft-note-body" });
			}
		}
		if (skipped.length) {
			const section = body.createEl("div", { cls: "graft-section" });
			section.createEl("h3", { text: "Skipped events" });
			for (const { event, reason } of skipped) section.createEl("p", { text: `${event.summary}: ${reason}`, cls: "graft-note graft-note-skipped" });
		}
		if (warnings.length) {
			const section = body.createEl("div", { cls: "graft-section" });
			section.createEl("h3", { text: "Warnings" });
			for (const warning of warnings) section.createEl("p", { text: `${warning.subject}: ${warningText[warning.kind]}`, cls: "graft-note graft-note-warning" });
		}
		if (errors.length) {
			const section = body.createEl("div", { cls: "graft-section" });
			section.createEl("h3", { text: "Calendar errors" });
			section.createEl("p", { text: "Some calendars could not be read. This preview is incomplete.", cls: "graft-note graft-note-error" });
			for (const error of errors) section.createEl("p", { text: `${error.feed}: Calendar feed could not be fetched or parsed.`, cls: "graft-note graft-note-error" });
		}
		const actions = root.createEl("div", { cls: "graft-actions" });
		if (this.apply && hasWrites) {
			const button = actions.createEl("button", { text: "Apply", attr: { type: "button" }, cls: "mod-cta" });
			button.addEventListener("click", () => { void this.runApply(button); });
		} else if (this.apply) actions.createEl("p", { text: "Nothing to apply. No notes would be created or changed.", cls: "graft-muted graft-blocked" });
		else actions.createEl("p", { text: "Apply is unavailable for this incomplete or ambiguous plan.", cls: "graft-muted graft-blocked" });
		actions.createEl("button", { text: "Close", attr: { type: "button" } }).addEventListener("click", () => { if (!this.applying) this.close(); });
	}

	private async runApply(button: HTMLButtonElement) {
		if (this.applying || this.consumed) return;
		this.consumed = true;
		this.applying = true;
		button.disabled = true;
		try { await this.apply!(); }
		finally { this.applying = false; this.close(); }
	}

	onClose() {
		this.consumed = true;
		this.contentEl.empty();
		if (!this.applying) this.done?.();
	}
}

function showFields(container: HTMLElement, fields: Record<string, unknown>) {
	const list = container.createEl("dl", { cls: "graft-fields" });
	for (const [field, value] of Object.entries(fields)) {
		list.createEl("dt", { text: field });
		list.createEl("dd", { text: displayValue(value) });
	}
}

function displayValue(value: unknown): string {
	if (value === undefined) return "(missing)";
	return typeof value === "string" ? value || "(empty)" : JSON.stringify(value);
}
