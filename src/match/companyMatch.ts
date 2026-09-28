/**
 * The minimal shape read from a Company note's frontmatter. `name`
 * is the note's own filename (without folder or extension), since
 * that's what a companies: wikilink must match exactly, per the
 * vault schema's own gotcha ([[Example Company]], not [[example company]]).
 */
export interface CompanyRecord {
	path: string;
	name: string;
	domain?: string;
}

/**
 * Matches an attendee's email domain against an existing Company
 * note's domain field. New companies are never created here, that
 * stays a manual step per the design decisions: an unmatched domain
 * just means no company link gets set.
 */
export function matchCompanyByDomain(
	email: string,
	directory: CompanyRecord[],
): CompanyRecord | undefined {
	const domain = email.split("@")[1]?.toLowerCase();
	if (!domain) return undefined;
	return directory.find((company) => company.domain?.toLowerCase() === domain);
}
