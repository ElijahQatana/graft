import { requestUrl } from "obsidian";

/** A feed request failed or returned content that is not an ICS calendar. */
export class IcsFetchError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "IcsFetchError";
	}
}

/** How long one feed request may run before it is treated as failed. */
export const FEED_TIMEOUT_MS = 30_000;

/** Uses Obsidian's requestUrl to avoid browser CORS restrictions. */
export async function fetchIcs(url: string, timeoutMs = FEED_TIMEOUT_MS): Promise<string> {
	let response;
	let timer: number | undefined;
	try {
		const timeout = new Promise<never>((_, reject) => {
			timer = window.setTimeout(() => reject(new IcsFetchError("The calendar feed took too long to answer.")), timeoutMs);
		});
		response = await Promise.race([requestUrl({ url, throw: false }), timeout]);
	} catch (error) {
		if (error instanceof IcsFetchError) throw error;
		throw new IcsFetchError("Could not reach the calendar feed.");
	} finally {
		window.clearTimeout(timer);
	}

	if (response.status < 200 || response.status >= 300) {
		throw new IcsFetchError(`Calendar feed returned HTTP ${response.status}`);
	}

	const text = response.text;
	if (!text.includes("BEGIN:VCALENDAR")) {
		throw new IcsFetchError(
			"Response doesn't look like an ICS calendar (no BEGIN:VCALENDAR)",
		);
	}

	return text;
}
