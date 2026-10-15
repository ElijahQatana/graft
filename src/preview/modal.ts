import { Modal, type App } from "obsidian";
import type { SyncPreview } from "./plan.ts";
import { buildRangeText, buildSummary, buildWindowLabel, count } from "./summary.ts";
import { MAX_RANGE_DAYS, rangeDays, type SyncRange } from "../sync/range.ts";
import { addRangeControl, draftOf, type RangeDraft } from "./rangeControl.ts";
import { addSegmented, initialCalendarState, renderCalendar, type CalendarState } from "./calendarView.ts";

const warningText = {
	"unresolved-company": "Unresolved Company link. The link will be omitted.",
	"ambiguous-person": "Ambiguous Person match. Check the matching notes before syncing.",
	"possible-duplicate-person": "Possible duplicate Person. If they are the same person, add the new address as an alias on the existing note and preview again.",
	"vanished-event": "Event missing from the feed. This does not mark it cancelled.",
	"missing-invite-heading": "No invite agenda heading in this note, so its agenda is not updated. Add the heading or check the Headings setting.",
};

export interface LoadedPreview {
	preview: SyncPreview;
	apply?: () => Promise<void>;
}

/** Displays a prepared plan. Applying never fetches the feeds again. Loading another range does. */
export class SyncPreviewModal extends Modal {
	private applying = false;
	private consumed = false;
	private loading = false;
	private closed = false;
	private oneOff = false;
	private message?: string;
	private view: "list" | "calendar" = "list";
	private calendar: CalendarState;
	private draft: RangeDraft;
	private switcher?: HTMLElement;
	private body?: HTMLElement;
	/** `reload` is called with no range to return to the settings range. */
	constructor(app: App, private preview: SyncPreview,
		private apply?: () => Promise<void>, private done?: () => void,
		private reload?: (range?: SyncRange) => Promise<LoadedPreview>) {
		super(app);
		this.calendar = initialCalendarState(preview);
		this.draft = draftOf(preview.window);
	}

	onOpen() {
		this.modalEl?.classList?.add("graft-preview-modal");
		this.setTitle("Graft sync preview");
		this.render();
	}

	private render() {
		this.contentEl.empty();
		const root = this.contentEl.createEl("div", { cls: "graft-preview" });
		this.switcher = root.createEl("div", { cls: "graft-preview-views" });
		const head = root.createEl("div", { cls: "graft-preview-head" });
		head.createEl("p", { text: "Dry run. No notes have been written.", cls: "graft-muted" });
		if (!this.loading) head.createEl("p", { text: buildWindowLabel(this.preview.window), cls: "graft-muted graft-window" });
		if (this.message) head.createEl("p", { text: this.message, cls: this.loading ? "graft-muted graft-window graft-loading" : "graft-note graft-note-warning", attr: { role: "status" } });
		this.body = root.createEl("div", { cls: "graft-preview-body" });
		this.renderView();
		const { newMeetings, personStubs, seriesStubs, updates } = this.preview;
		if (this.loading) {
			// The old plan is not shown or applied while the new range is read.
			const actions = root.createEl("div", { cls: "graft-actions" });
			actions.createEl("button", { text: "Close", attr: { type: "button" } }).addEventListener("click", () => { if (!this.applying) this.close(); });
			return;
		}
		const hasWrites = newMeetings.length > 0 || personStubs.length > 0 || seriesStubs.length > 0 || updates.some((update) => update.changes.length > 0);
		const actions = root.createEl("div", { cls: "graft-actions" });
		if (this.apply && hasWrites) {
			const range = `${buildRangeText(this.preview.window)}${this.oneOff ? ", a one-off range that is not saved to settings" : ""}`;
			actions.createEl("p", { text: `Apply writes the notes for ${range}.`, cls: "graft-muted graft-blocked graft-apply-range" });
			const button = actions.createEl("button", { text: "Apply", attr: { type: "button" }, cls: "mod-cta" });
			button.addEventListener("click", () => { void this.runApply(button); });
		} else if (this.apply) actions.createEl("p", { text: "Nothing to apply. No notes would be created or changed.", cls: "graft-muted graft-blocked" });
		else actions.createEl("p", { text: "Apply is unavailable for this incomplete or ambiguous plan.", cls: "graft-muted graft-blocked" });
		actions.createEl("button", { text: "Close", attr: { type: "button" } }).addEventListener("click", () => { if (!this.applying) this.close(); });
	}

	/** The old plan is dropped first so Apply cannot run on a range that is no longer shown. */
	private async loadRange(range?: SyncRange) {
		if (!this.reload || this.loading || this.applying || this.consumed) return;
		const previous = { preview: this.preview, apply: this.apply };
		this.loading = true;
		this.message = "Reading calendars for the new range.";
		this.apply = undefined;
		this.render();
		try {
			const loaded = await this.reload(range);
			if (this.closed) return;
			this.preview = loaded.preview;
			this.apply = loaded.apply;
			this.oneOff = range !== undefined;
			this.message = undefined;
			this.calendar = { ...initialCalendarState(loaded.preview), span: this.calendar.span };
			this.draft = draftOf(loaded.preview.window);
		} catch {
			if (this.closed) return;
			// The plan before the request still matches the range its label shows, so it stays usable.
			this.preview = previous.preview;
			this.apply = previous.apply;
			this.message = "That range could not be loaded. The previous preview is shown again.";
		} finally {
			this.loading = false;
		}
		if (!this.closed) this.render();
	}

	private renderView() {
		this.switcher!.empty();
		addSegmented(this.switcher!, "Preview view", [["list", "List"], ["calendar", "Calendar"]], this.view, (view) => { this.view = view; this.renderView(); });
		const body = this.body!;
		body.empty();
		if (this.loading) return;
		body.createEl("p", { text: buildSummary(this.preview), cls: "graft-summary" });
		if (this.view === "calendar") {
			const container = body.createEl("div", { cls: "graft-cal" });
			if (this.reload) addRangeControl(container, this.draft, this.oneOff, rangeDays(this.preview.window) > MAX_RANGE_DAYS, (range) => { void this.loadRange(range); });
			renderCalendar(container, this.preview, this.calendar, () => this.renderView());
		}
		else this.renderList(body);
	}

	private renderList(body: HTMLElement) {
		const { newMeetings, updates, personStubs, seriesStubs, skipped, errors, warnings } = this.preview;
		if (!newMeetings.length && !updates.length && !personStubs.length && !seriesStubs.length) {
			body.createEl("p", { text: "No note changes planned.", cls: "graft-empty" });
		}
		if (newMeetings.length) {
			const section = addSection(body, "New Meeting notes", newMeetings.length, true);
			for (const { path, note } of newMeetings) {
				const details = section.createEl("details", { cls: "graft-item" });
				details.createEl("summary", { text: path });
				const content = details.createEl("div", { cls: "graft-item-body" });
				showFields(content, note.frontmatter);
				content.createEl("pre", { text: note.body, cls: "graft-note-body" });
			}
		}
		const changed = updates.filter((update) => update.changes.length > 0);
		const unchanged = updates.filter((update) => update.changes.length === 0);
		for (const [title, items, open] of [["Existing Meeting notes with changes", changed, true], ["Unchanged Meeting notes", unchanged, false]] as const) {
			if (!items.length) continue;
			const section = addSection(body, title, items.length, open);
			for (const { path, changes } of items) {
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
			const section = addSection(body, label, stubs.length, true);
			for (const { path, stub, body: stubBody } of stubs) {
				const details = section.createEl("details", { cls: "graft-item" });
				details.createEl("summary", { text: path });
				const content = details.createEl("div", { cls: "graft-item-body" });
				showFields(content, stub.frontmatter);
				if (stubBody) content.createEl("pre", { text: stubBody, cls: "graft-note-body" });
			}
		}
		if (skipped.length) {
			const section = addSection(body, "Skipped events", skipped.length, false);
			for (const { event, reason } of skipped) section.createEl("p", { text: `${event.summary}: ${reason}`, cls: "graft-note graft-note-skipped" });
		}
		if (warnings.length) {
			const section = addSection(body, "Warnings", warnings.length, true);
			for (const warning of warnings) section.createEl("p", { text: `${warning.subject}: ${warningText[warning.kind]}`, cls: "graft-note graft-note-warning" });
		}
		if (errors.length) {
			const section = addSection(body, "Calendar errors", errors.length, true);
			section.createEl("p", { text: "Some calendars could not be read. This preview is incomplete.", cls: "graft-note graft-note-error" });
			for (const error of errors) section.createEl("p", { text: `${error.feed}: Calendar feed could not be fetched or parsed.`, cls: "graft-note graft-note-error" });
		}
	}

	private async runApply(button: HTMLButtonElement) {
		if (this.applying || this.consumed || this.loading) return;
		this.consumed = true;
		this.applying = true;
		button.disabled = true;
		try { await this.apply!(); }
		finally { this.applying = false; this.close(); }
	}

	onClose() {
		this.consumed = true;
		this.closed = true;
		this.contentEl.empty();
		if (!this.applying) this.done?.();
	}
}

/** A collapsible section with its count in the heading. Returns the element to fill. */
function addSection(parent: HTMLElement, title: string, total: number, open: boolean): HTMLElement {
	const details = parent.createEl("details", { cls: "graft-section" });
	details.open = open;
	details.createEl("summary", { text: `${title} (${total})` });
	return details.createEl("div", { cls: "graft-section-body" });
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
