/**
 * Extracts a heading's own content: everything between that heading
 * line and the next heading of the same or shallower level (a ##
 * section stops at the next ## or #, not at a deeper ###). Returns
 * undefined if the heading isn't present at all. Used to copy a
 * Series note's Standing Agenda into a new Meeting note.
 */
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

/**
 * Replaces a heading's content with newContent, leaving everything
 * else in the document, including the heading line itself, byte for
 * byte untouched. Backs the Invite Agenda's live refresh on every
 * sync: only that one subsection is plugin-owned, nothing else in
 * the body should ever move. If the heading isn't found at all, the
 * document is returned unchanged rather than appending it somewhere
 * unexpected, that's a template-mismatch problem to surface as a
 * warning, not something to paper over silently.
 */
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
