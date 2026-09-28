import type { App } from "obsidian";
import type { CompanyRecord } from "./companyMatch.ts";
import { isInFolder } from "../util/vaultPath.ts";

/** Reads every Company note's name and domain out of metadataCache. Same thin-adapter shape as the others. */
export function buildCompanyDirectory(app: App, folder: string): CompanyRecord[] {
	const directory: CompanyRecord[] = [];

	for (const file of app.vault.getMarkdownFiles()) {
		if (!isInFolder(file, folder)) continue;

		const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
		if (!frontmatter || frontmatter.type !== "Company") continue;

		directory.push({
			path: file.path,
			name: file.basename,
			domain: typeof frontmatter.domain === "string" ? frontmatter.domain : undefined,
		});
	}

	return directory;
}
