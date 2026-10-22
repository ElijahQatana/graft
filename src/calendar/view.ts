import { ItemView, type WorkspaceLeaf } from "obsidian";
import { initialCalendarState, renderCalendar, type CalendarState } from "../preview/calendarView.ts";
import { GRAFT_ICON_ID } from "../icon.ts";
import { updatedLabel, type BrowseCache } from "./cache.ts";

export const CALENDAR_VIEW_TYPE = "graft-calendar";

export interface CalendarHost {
	cache: BrowseCache;
	timezone(): string;
	now?(): Date;
	openNote(path: string): void;
}

/** Read-only: it draws a plan and never applies one. */
export class CalendarView extends ItemView {
	private state?: CalendarState;
	private disposed = false;

	constructor(leaf: WorkspaceLeaf, private host: CalendarHost) {
		super(leaf);
	}

	getViewType() { return CALENDAR_VIEW_TYPE; }
	getDisplayText() { return "Graft calendar"; }
	getIcon() { return GRAFT_ICON_ID; }

	async onOpen() {
		this.disposed = false;
		this.contentEl.addClass("graft-calendar-view");
		await this.show(false);
	}

	async onClose() {
		this.disposed = true;
		this.contentEl.empty();
	}

	/** Loads only when nothing is stored or when `force` is set. */
	private async show(force: boolean) {
		const { cache } = this.host;
		if (force || !cache.peek()) {
			this.draw(undefined, true);
			if (force) await cache.refresh(); else await cache.get();
		}
		if (!this.disposed) this.draw(cache.peek(), false);
	}

	private draw(result: ReturnType<BrowseCache["peek"]>, loading: boolean) {
		const root = this.contentEl;
		root.empty();
		const bar = root.createEl("div", { cls: "graft-cal-source" });
		const refresh = bar.createEl("button", { text: loading ? "Refreshing" : "Refresh", cls: "graft-cal-refresh", attr: { type: "button" } });
		refresh.disabled = loading;
		refresh.addEventListener("click", () => { void this.show(true); });
		bar.createEl("span", { text: loading ? "Reading calendars" : updatedLabel(result?.at, this.host.timezone()), cls: "graft-muted graft-cal-updated" });
		if (loading && !result) return;
		if (!result) return;
		if (result.error) {
			root.createEl("p", { text: result.error, cls: "graft-note graft-note-error" });
			return;
		}
		const preview = result.preview!;
		for (const error of preview.errors) root.createEl("p", { text: `${error.feed}: Calendar feed could not be fetched or parsed.`, cls: "graft-note graft-note-error" });
		const now = this.host.now?.() ?? new Date();
		this.state ??= initialCalendarState(preview, now);
		renderCalendar(root.createEl("div", { cls: "graft-cal" }), preview, this.state, () => this.draw(result, false), now, { openNote: (path) => this.host.openNote(path) });
	}
}
