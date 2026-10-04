import type { Attendee } from "../types.ts";
import { sanitizeFilename } from "../util/filename.ts";
import { matchCompanyByDomain, type CompanyRecord } from "../match/companyMatch.ts";

export type FilenameStyle = "full" | "firstOnly" | "initialLast";

/** Email-domain rules for naming new Person notes. */
export interface FilenameConventionRule {
	domain: string;
	style: FilenameStyle;
}

export interface PersonStub {
	/** Filename without its folder or extension. */
	filename: string;
	frontmatter: {
		type: "Person";
		full_name: string;
		first_name: string;
		last_name: string;
		company: string[];
		email: string;
	};
}

/** Builds a Person stub, with a company link when the domain matches an existing Company note. */
export function buildPersonStub(
	attendee: Attendee,
	rules: FilenameConventionRule[],
	companies: CompanyRecord[],
): PersonStub {
	const { first, last } = splitName(attendee);
	const fullName = last ? `${first} ${last}` : first;
	const company = matchCompanyByDomain(attendee.email, companies);

	return {
		filename: sanitizeFilename(applyStyle(first, last, styleFor(attendee.email, rules))),
		frontmatter: {
			type: "Person",
			full_name: fullName,
			first_name: first,
			last_name: last,
			company: company ? [`[[${company.name}]]`] : [],
			email: attendee.email,
		},
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
