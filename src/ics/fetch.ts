import { requestUrl } from "obsidian";

/** A feed request failed or returned content that is not an ICS calendar. */
export class IcsFetchError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "IcsFetchError";
	}
}

/** Uses Obsidian's requestUrl to avoid browser CORS restrictions. */
export async function fetchIcs(url: string): Promise<string> {
	let response;
	try {
		response = await requestUrl({ url, throw: false });
	} catch {
		throw new IcsFetchError("Could not reach the calendar feed.");
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
