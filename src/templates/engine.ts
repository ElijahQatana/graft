/** Replaces known placeholders in body text and filename patterns.
 * Unknown placeholders stay visible. Frontmatter is serialized separately. */
export function renderTemplate(template: string, data: Record<string, string>): string {
	return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
		return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : match;
	});
}
