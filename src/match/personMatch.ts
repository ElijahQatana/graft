import type { Attendee } from "../types.ts";

/**
 * The minimal shape read from a Person note's frontmatter via
 * Obsidian's metadataCache. Kept separate from the actual Obsidian
 * types so this matching logic stays testable without a running
 * vault; the adapter that builds this from metadataCache is the
 * only part that needs Obsidian itself.
 */
export interface PersonRecord {
	/** Vault-relative path, e.g. "6entities/1people/Bob Example.md". */
	path: string;
	email?: string;
	emailAliases?: string[];
}

/**
 * Matches an attendee's email against email or any email_aliases
 * entry, case-insensitively. Several real addresses can point at the
 * same person (a consultant with both an employer and a client
 * domain), which is exactly what email_aliases is for, so this never
 * assumes anything from the domain alone.
 */
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
