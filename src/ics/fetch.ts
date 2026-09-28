import { requestUrl } from "obsidian";

/**
 * Thrown when an ICS feed can't be reached, or what comes back
 * doesn't look like calendar data. Callers catch this specifically
 * rather than a generic network error, so a bad feed URL surfaces
 * as a clear message instead of an unhandled rejection.
 */
export class IcsFetchError extends Error {
	constructor(message: string, readonly url: string, readonly cause?: unknown) {
		super(message);
		this.name = "IcsFetchError";
	}
}

/**
 * Fetches a single ICS feed and returns its raw text. Uses
 * Obsidian's requestUrl rather than fetch() so it works on mobile
 * and isn't subject to the feed host's CORS policy.
 */
export async function fetchIcs(url: string): Promise<string> {
	let response;
	try {
		response = await requestUrl({ url, throw: false });
	} catch (cause) {
		throw new IcsFetchError(
			`Could not reach the calendar feed: ${describeCause(cause)}`,
			url,
			cause,
		);
	}

	if (response.status < 200 || response.status >= 300) {
		throw new IcsFetchError(`Calendar feed returned HTTP ${response.status}`, url);
	}

	const text = response.text;
	if (!text.includes("BEGIN:VCALENDAR")) {
		throw new IcsFetchError(
			"Response doesn't look like an ICS calendar (no BEGIN:VCALENDAR)",
			url,
		);
	}

	return text;
}

function describeCause(cause: unknown): string {
	return cause instanceof Error ? cause.message : String(cause);
}
