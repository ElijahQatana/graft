import type { App } from "obsidian";
import type { PersonRecord } from "./personMatch.ts";
import { isInFolder } from "../util/vaultPath.ts";

/** Reads Person emails and aliases from metadataCache. */
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
