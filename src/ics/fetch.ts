import { requestUrl } from "obsidian";

/** A feed request failed or returned content that is not an ICS calendar. */
export class IcsFetchError extends Error {
	constructor(message: string, readonly url: string, readonly cause?: unknown) {
		super(message);
		this.name = "IcsFetchError";
	}
}

/** Uses Obsidian's requestUrl to avoid browser CORS restrictions. */
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
