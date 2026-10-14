import type { Attendee } from "../types.ts";
import { sanitizeFilename } from "../util/filename.ts";
import { matchCompanyByDomain, type CompanyRecord } from "../match/companyMatch.ts";
import type { NoteSchema } from "../config/schema.ts";

export type FilenameStyle = "full" | "firstOnly" | "initialLast";

/** Email-domain rules for naming new Person notes. */
export interface FilenameConventionRule {
	domain: string;
	style: FilenameStyle;
}

export interface PersonStub {
	/** Filename without its folder or extension. */
	filename: string;
	frontmatter: Record<string, unknown>;
	/** Company links written to the stub. */
	companyLinks: string[];
}

/** Builds a Person stub, with a company link when the domain matches an existing Company note.
 * With `linkCompanies` off the stub has no company property and no matching runs. */
export function buildPersonStub(
	attendee: Attendee,
	rules: FilenameConventionRule[],
	companies: CompanyRecord[],
	schema: NoteSchema,
	linkCompanies = true,
): PersonStub {
	const { first, last } = splitName(attendee);
	const fullName = last ? `${first} ${last}` : first;
	const company = linkCompanies ? matchCompanyByDomain(attendee.email, companies) : undefined;
	const names = schema.person;
	const companyLinks = company ? [`[[${company.name}]]`] : [];

	const frontmatter: Record<string, unknown> = {
		[schema.typeField]: schema.types.person,
		[names.fullName]: fullName,
		[names.firstName]: first,
		[names.lastName]: last,
	};
	if (linkCompanies) frontmatter[names.company] = companyLinks;
	frontmatter[names.email] = attendee.email;

	return {
		filename: sanitizeFilename(applyStyle(first, last, styleFor(attendee.email, rules))),
		companyLinks,
		frontmatter,
	};
}

function styleFor(email: string, rules: FilenameConventionRule[]): FilenameStyle {
	const domain = email.split("@")[1]?.toLowerCase() ?? "";
	return rules.find((rule) => rule.domain.toLowerCase() === domain)?.style ?? "full";
}

function applyStyle(first: string, last: string, style: FilenameStyle): string {
	switch (style) {
		case "firstOnly":
			return first;
		case "initialLast":
			return last ? `${first.charAt(0)}. ${last}` : first;
		case "full":
		default:
			return last ? `${first} ${last}` : first;
	}
}

function splitName(attendee: Attendee): { first: string; last: string } {
	if (attendee.name && attendee.name.trim()) {
		const parts = attendee.name.trim().split(/\s+/);
		return { first: parts[0], last: parts.slice(1).join(" ") };
	}
	// Fall back to the email local part when the attendee has no name.
	const local = attendee.email.split("@")[0] ?? attendee.email;
	return { first: local, last: "" };
}
