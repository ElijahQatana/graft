import type { App } from "obsidian";
import type { SeriesRecord } from "./seriesMatch.ts";
import { isInFolder } from "../util/vaultPath.ts";

/** Reads Series join keys from metadataCache. */
export function buildSeriesDirectory(app: App, folder: string): SeriesRecord[] {
	const directory: SeriesRecord[] = [];

	for (const file of app.vault.getMarkdownFiles()) {
		if (!isInFolder(file, folder)) continue;

		const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
		if (!frontmatter || frontmatter.type !== "Series") continue;

		directory.push({
			path: file.path,
			icsUid:
				typeof frontmatter.google_recurring_event_id === "string"
					? frontmatter.google_recurring_event_id
					: undefined,
		});
	}

	return directory;
}
