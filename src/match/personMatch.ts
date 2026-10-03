import type { Attendee } from "../types.ts";

/** Person fields used for matching. */
export interface PersonRecord {
	/** Vault-relative note path. */
	path: string;
	email?: string;
	emailAliases?: string[];
}

/** Matches email and email_aliases without regard to case. */
export function matchPerson(
	attendee: Attendee,
	directory: PersonRecord[],
): PersonRecord | undefined {
	const target = attendee.email.toLowerCase();
	return directory.find((person) => {
		if (person.email && person.email.toLowerCase() === target) return true;
		return (person.emailAliases ?? []).some((alias) => alias.toLowerCase() === target);
	});
}
