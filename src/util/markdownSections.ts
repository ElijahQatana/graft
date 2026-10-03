/** Gets content up to the next heading of the same or shallower level.
 * Returns undefined when the heading is missing. */
export function extractSection(markdown: string, heading: string): string | undefined {
	const lines = markdown.split("\n");
	const headingLevel = heading.match(/^#+/)?.[0].length ?? 0;
	const startIndex = lines.findIndex((line) => line.trim() === heading.trim());
	if (startIndex === -1) return undefined;

	const content: string[] = [];
	for (let i = startIndex + 1; i < lines.length; i++) {
		const level = lines[i].match(/^#+/)?.[0].length;
		if (level !== undefined && level <= headingLevel) break;
		content.push(lines[i]);
	}
	return content.join("\n").trim();
}

/** Replaces section content and keeps the rest of the document unchanged.
 * A missing heading leaves the document unchanged. */
export function replaceSection(markdown: string, heading: string, newContent: string): string {
	const lines = markdown.split("\n");
	const headingLevel = heading.match(/^#+/)?.[0].length ?? 0;
	const startIndex = lines.findIndex((line) => line.trim() === heading.trim());
	if (startIndex === -1) return markdown;

	let endIndex = lines.length;
	for (let i = startIndex + 1; i < lines.length; i++) {
		const level = lines[i].match(/^#+/)?.[0].length;
		if (level !== undefined && level <= headingLevel) {
			endIndex = i;
			break;
		}
	}

	const before = lines.slice(0, startIndex + 1);
	const after = lines.slice(endIndex);
	return [...before, "", newContent, "", ...after].join("\n");
}
