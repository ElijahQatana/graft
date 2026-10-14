/** Characters Obsidian rejects in a note name, plus the ones that break wikilinks. */
const UNSAFE = /[\\/:*?"<>|#^[\]\x00-\x1f]+/g;

/**
 * Makes a title safe to use as a note name. Each run of unsafe characters becomes one hyphen,
 * whitespace collapses, and leading or trailing dots and spaces are dropped.
 * The note title and frontmatter keep the original text. An empty result becomes "Untitled".
 */
export function sanitizeFilename(name: string): string {
	const cleaned = name.replace(UNSAFE, "-").replace(/\s+/g, " ").replace(/^[. ]+|[. ]+$/g, "");
	return cleaned || "Untitled";
}
