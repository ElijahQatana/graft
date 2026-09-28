/**
 * Extracts a heading's own content: everything between that heading
 * line and the next heading of the same or shallower level (a ##
 * section stops at the next ## or #, not at a deeper ###). Returns
 * undefined if the heading isn't present at all. Used to copy a
 * Series note's Standing Agenda into a new Meeting note, and will
 * also back the Invite Agenda's section-scoped replace in GFT-013.
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
