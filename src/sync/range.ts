/** The most days a one-off preview range may cover, counting today and both ends. */
export const MAX_RANGE_DAYS = 30;

export interface SyncRange {
	daysBack: number;
	daysAhead: number;
}

export function rangeDays({ daysBack, daysAhead }: SyncRange): number {
	return daysBack + 1 + daysAhead;
}

export function rangeProblem(range: SyncRange): string | undefined {
	for (const value of [range.daysBack, range.daysAhead]) {
		if (!Number.isInteger(value) || value < 0) return "Enter whole numbers of days, 0 or more.";
	}
	if (rangeDays(range) > MAX_RANGE_DAYS) return `A one-off range can cover at most ${MAX_RANGE_DAYS} days, counting today.`;
	return undefined;
}
