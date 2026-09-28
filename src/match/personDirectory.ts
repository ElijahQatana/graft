import type { App, TFile } from "obsidian";
import type { PersonRecord } from "./personMatch.ts";

/**
 * Reads every Person note's email/email_aliases out of Obsidian's
 * metadataCache, not by parsing files manually. Deliberately thin:
 * all the actual matching logic lives in personMatch.ts, which
 * doesn't import Obsidian at all and can be tested without a vault.
 */
export function buildPersonDirectory(app: App, folder: string): PersonRecord[] {
	const directory: PersonRecord[] = [];

	for (const file of app.vault.getMarkdownFiles()) {
		if (!isInFolder(file, folder)) continue;

		const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
		if (!frontmatter || frontmatter.type !== "Person") continue;

		directory.push({
			path: file.path,
			email: typeof frontmatter.email === "string" ? frontmatter.email : undefined,
			emailAliases: Array.isArray(frontmatter.email_aliases)
				? frontmatter.email_aliases.filter((a: unknown): a is string => typeof a === "string")
				: undefined,
		});
	}

	return directory;
}

function isInFolder(file: TFile, folder: string): boolean {
	return file.path === folder || file.path.startsWith(`${folder}/`);
}
