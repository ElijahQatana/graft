/** A weekday number with 0 for Sunday through 6 for Saturday. */
export type WeekDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;
/** "auto" follows the locale. */
export type WeekStartSetting = "auto" | WeekDay;

export const WEEK_DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

function isWeekDay(value: unknown): value is WeekDay {
	return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6;
}

export function isWeekStartSetting(value: unknown): value is WeekStartSetting {
	return value === "auto" || isWeekDay(value);
}

/** The first day of the week for a locale, from Intl when the runtime offers it. Undefined when it does not. */
export function intlFirstDay(locale?: string): WeekDay | undefined {
	try {
		const tag = new Intl.Locale(locale ?? new Intl.DateTimeFormat().resolvedOptions().locale) as Intl.Locale & {
			weekInfo?: { firstDay: number };
			getWeekInfo?: () => { firstDay: number };
		};
		const first = tag.getWeekInfo?.().firstDay ?? tag.weekInfo?.firstDay;
		return typeof first === "number" ? (first % 7) as WeekDay : undefined;
	} catch {
		return undefined;
	}
}

/** The day a week begins on. `localeFirstDay` is the app's own answer, such as moment's first day of the week. Without one the system locale is used, then Sunday. */
export function resolveWeekStart(setting: WeekStartSetting, localeFirstDay?: number): WeekDay {
	if (setting !== "auto") return setting;
	if (isWeekDay(localeFirstDay)) return localeFirstDay;
	return intlFirstDay() ?? 0;
}
