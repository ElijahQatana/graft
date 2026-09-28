/**
 * Placeholder substitution for user-editable text (custom body
 * templates, title formats), not for frontmatter: YAML has its own
 * quoting rules (a bare colon or wikilink can silently break parsing),
 * so frontmatter gets built as a plain object and serialized through
 * Obsidian's own stringifyYaml instead, not templated as text here.
 *
 * An unknown {{placeholder}} is left in the output untouched rather
 * than replaced with an empty string, so a typo in a user's own
 * template is visibly wrong instead of silently vanishing.
 */
export function renderTemplate(template: string, data: Record<string, string>): string {
	return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
		return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : match;
	});
}
