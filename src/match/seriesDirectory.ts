import type { App } from "obsidian";
import type { SeriesRecord } from "./seriesMatch.ts";
import { isInFolder } from "../util/vaultPath.ts";

/**
 * Reads every Series note's join key out of metadataCache. Same
 * shape and reasoning as personDirectory.ts: deliberately thin, all
 * the actual logic lives in seriesMatch.ts, which stays testable
 * without a real vault.
 */
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
