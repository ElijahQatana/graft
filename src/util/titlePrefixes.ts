/** Removes leading forward and reply markers such as "FW:" from an event title.
 * Matching is case-insensitive and repeats, so "Fwd: RE: Standup" becomes "Standup".
 * A title that would end up empty is returned unchanged. */
export function stripTitlePrefixes(title: string, prefixes: string[]): string {
	const wanted = prefixes.map((prefix) => prefix.trim().toLowerCase()).filter(Boolean);
	let result = title.trim();
	for (let stripped = true; stripped;) {
		stripped = false;
		const lower = result.toLowerCase();
		const hit = wanted.find((prefix) => lower.startsWith(prefix));
		if (hit) {
			result = result.slice(hit.length).trim();
			stripped = true;
		}
	}
	return result || title;
}
