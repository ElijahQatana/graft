import type { GraftSettings } from "../config/settings.ts";

/** The dockable calendar has its own range and ignores the sync window. */
export const BROWSE_DAYS_BACK = 14;
export const BROWSE_DAYS_AHEAD = 30;

/** Nothing planned from this copy is ever applied. */
export function browseSettings(settings: GraftSettings): GraftSettings {
	return { ...structuredClone(settings), daysBack: BROWSE_DAYS_BACK, daysAhead: BROWSE_DAYS_AHEAD };
}
