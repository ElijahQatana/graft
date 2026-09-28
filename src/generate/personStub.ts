import type { Attendee } from "../types.ts";
import { sanitizeFilename } from "../util/filename.ts";

export type FilenameStyle = "full" | "firstOnly" | "initialLast";

/**
 * How to name a new Person note's file based on the attendee's email
 * domain. This table is settings-driven (GFT-014), never hardcoded:
 * a real vault's actual employer/client domains are the user's own
 * data, not something that belongs baked into this repo's source.
 */
export interface FilenameConventionRule {
	domain: string;
	style: FilenameStyle;
}

export interface PersonStub {
	/** Filename without extension or folder, e.g. "Charles" or "F. Example" or "Lara Example". */
	filename: string;
	frontmatter: {
		full_name: string;
		first_name: string;
		last_name: string;
		email: string;
	};
}

/**
 * Builds a minimal stub for an attendee with no matching Person note.
 * Only full_name/first_name/last_name/email get filled in; everything
 * else (title, department, seniority) stays blank for a human to add
 * later, per the vault schema's own convention.
 */
export function buildPersonStub(attendee: Attendee, rules: FilenameConventionRule[]): PersonStub {
	const { first, last } = splitName(attendee);
	const fullName = last ? `${first} ${last}` : first;

	return {
		filename: sanitizeFilename(applyStyle(first, last, styleFor(attendee.email, rules))),
		frontmatter: {
			full_name: fullName,
			first_name: first,
			last_name: last,
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
	// No CN on the ATTENDEE property to work with, fall back to the
	// email's local part rather than leaving the name blank.
	const local = attendee.email.split("@")[0] ?? attendee.email;
	return { first: local, last: "" };
}
