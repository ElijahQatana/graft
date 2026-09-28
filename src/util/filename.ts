/**
 * A note's title can contain characters a filename can't. The title
 * frontmatter field keeps the literal string; only the filename on
 * disk gets sanitized, per the vault schema's own convention (slash
 * and pipe both get swapped for a hyphen).
 */
export function sanitizeFilename(name: string): string {
	return name.replace(/[/|]/g, "-");
}
