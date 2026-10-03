/** Company filename and domain used for matching. */
export interface CompanyRecord {
	path: string;
	name: string;
	domain?: string;
}

/** Matches the email domain to an existing Company note. No match means no link. */
export function matchCompanyByDomain(
	email: string,
	directory: CompanyRecord[],
): CompanyRecord | undefined {
	const domain = email.split("@")[1]?.toLowerCase();
	if (!domain) return undefined;
	return directory.find((company) => company.domain?.toLowerCase() === domain);
}

/** Keeps links that match existing Company filenames. */
export function validateCompanyLinks(links: string[], directory: CompanyRecord[]): string[] {
	const validNames = new Set(directory.map((company) => `[[${company.name}]]`));
	return links.filter((link) => validNames.has(link));
}
