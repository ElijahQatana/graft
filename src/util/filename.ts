/** Characters Obsidian rejects in a note name, plus the ones that break wikilinks. */
const UNSAFE_CHARS = "\\\\/:*?\"<>|#^\\[\\]\\x00-\\x1f";
/** Whitespace that is not itself a control character (those count as unsafe). */
const SPACE = "[^\\S\\x00-\\x1f]";
const HAS_SPACE = new RegExp(SPACE);
const UNSAFE_RUN = new RegExp(
	`${SPACE}*[${UNSAFE_CHARS}]+(?:${SPACE}+[${UNSAFE_CHARS}]+)*${SPACE}*`,
	"g",
);

/**
 * Makes a title safe to use as a note name. A run of unsafe characters becomes " - " when it
 * contains or touches whitespace ("Roadmap sync: milestones" gives "Roadmap sync - milestones"),
 * and a plain hyphen otherwise ("A*B" gives "A-B"). Unsafe characters separated only by spaces
 * count as one run. A run at the very start or end is dropped. Whitespace collapses, and leading
 * or trailing dots and spaces are removed.
 * The note title and frontmatter keep the original text. An empty result becomes "Untitled".
 */
export function sanitizeFilename(name: string): string {
	const trimmed = name.replace(/^[. ]+|[. ]+$/g, "");
	const cleaned = trimmed
		.replace(UNSAFE_RUN, (run, offset: number) => {
			if (offset === 0 || offset + run.length === trimmed.length) return "";
			return HAS_SPACE.test(run) ? " - " : "-";
		})
		.replace(/\s+/g, " ")
		.replace(/^[. ]+|[. ]+$/g, "");
	return cleaned || "Untitled";
}
