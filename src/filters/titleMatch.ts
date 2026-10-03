import type { CalendarEvent } from "../types.ts";

export type TitleMatchMode = "exact" | "prefix" | "suffix" | "contains";

export interface TitleMatchRule {
	mode: TitleMatchMode;
	value: string;
	caseSensitive?: boolean;
}

export interface FilterResult {
	kept: CalendarEvent[];
	skipped: Array<{ event: CalendarEvent; reason: string }>;
}

/** The first matching rule skips the event. An empty list keeps everything. */
export function filterByTitle(events: CalendarEvent[], rules: TitleMatchRule[]): FilterResult {
	const kept: CalendarEvent[] = [];
	const skipped: FilterResult["skipped"] = [];

	for (const event of events) {
		const rule = rules.find((r) => matches(event.summary, r));
		if (rule) {
			skipped.push({ event, reason: `title matched ${describeRule(rule)}` });
		} else {
			kept.push(event);
		}
	}

	return { kept, skipped };
}

function matches(title: string, rule: TitleMatchRule): boolean {
	const haystack = rule.caseSensitive ? title : title.toLowerCase();
	const needle = rule.caseSensitive ? rule.value : rule.value.toLowerCase();

	switch (rule.mode) {
		case "exact":
			return haystack === needle;
		case "prefix":
			return haystack.startsWith(needle);
		case "suffix":
			return haystack.endsWith(needle);
		case "contains":
			return haystack.includes(needle);
	}
}

function describeRule(rule: TitleMatchRule): string {
	return `${rule.mode} "${rule.value}"`;
}
