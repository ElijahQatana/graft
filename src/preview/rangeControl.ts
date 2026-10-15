import { MAX_RANGE_DAYS, rangeDays, rangeProblem, type SyncRange } from "../sync/range.ts";

/** Held as text so a half-typed field survives a redraw. */
export interface RangeDraft {
	daysBack: string;
	daysAhead: string;
}

export function draftOf({ daysBack, daysAhead }: SyncRange): RangeDraft {
	return { daysBack: String(daysBack), daysAhead: String(daysAhead) };
}

/** An empty field becomes NaN, which `rangeProblem` rejects. */
function parse(draft: RangeDraft): SyncRange {
	const number = (text: string) => text.trim() === "" ? NaN : Number(text);
	return { daysBack: number(draft.daysBack), daysAhead: number(draft.daysAhead) };
}

/** `custom` adds a button that returns to the settings range. */
export function addRangeControl(parent: HTMLElement, draft: RangeDraft, custom: boolean, load: (range?: SyncRange) => void) {
	const box = parent.createEl("div", { cls: "graft-range" });
	const fields = box.createEl("div", { cls: "graft-range-fields" });
	const inputs: Record<keyof RangeDraft, HTMLInputElement> = {} as never;
	for (const [key, label] of [["daysBack", "Days back"], ["daysAhead", "Days ahead"]] as const) {
		const field = fields.createEl("label", { cls: "graft-range-field" });
		field.createEl("span", { text: label });
		const input = field.createEl("input", { attr: { type: "number", min: "0", max: String(MAX_RANGE_DAYS - 1), step: "1" } });
		input.value = draft[key];
		inputs[key] = input;
	}
	const buttons = box.createEl("div", { cls: "graft-range-buttons" });
	const run = buttons.createEl("button", { text: "Load range", cls: "mod-cta", attr: { type: "button" } });
	const note = box.createEl("p", { cls: "graft-muted graft-range-note" });
	const check = () => {
		draft.daysBack = inputs.daysBack.value;
		draft.daysAhead = inputs.daysAhead.value;
		const range = parse(draft);
		const problem = rangeProblem(range);
		run.disabled = problem !== undefined;
		note.setText(problem ?? `${rangeDays(range)} of ${MAX_RANGE_DAYS} days. This range is for this preview only. Calendars are read again.`);
	};
	for (const input of Object.values(inputs)) input.addEventListener("input", check);
	run.addEventListener("click", () => { if (!run.disabled) load(parse(draft)); });
	if (custom) {
		const reset = buttons.createEl("button", { text: "Use settings range", attr: { type: "button" } });
		reset.addEventListener("click", () => { load(undefined); });
	}
	check();
}
