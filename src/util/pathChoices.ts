/** Picks vault paths that match what has been typed, best matches first. Matching ignores case.
 * Paths that start with the query come before paths that only contain it. */
export function pathChoices(paths: string[], query: string, limit = 50): string[] {
	const needle = query.trim().toLowerCase();
	const hits = paths.filter((path) => path.toLowerCase().includes(needle));
	const starts = (path: string) => (path.toLowerCase().startsWith(needle) ? 0 : 1);
	hits.sort((a, b) => starts(a) - starts(b) || a.length - b.length || a.localeCompare(b));
	return hits.slice(0, limit);
}
