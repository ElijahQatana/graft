import type { App } from "obsidian";
import type { MeetingRecord } from "./meetingMatch.ts";
import { isInFolder } from "../util/vaultPath.ts";

/** Reads Meeting join keys from metadataCache. */
export function buildMeetingDirectory(app: App, folder: string): MeetingRecord[] {
	const directory: MeetingRecord[] = [];

	for (const file of app.vault.getMarkdownFiles()) {
		if (!isInFolder(file, folder)) continue;

		const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
		if (!frontmatter || frontmatter.type !== "Meeting") continue;

		directory.push({
			path: file.path,
			icsUid: typeof frontmatter.ics_uid === "string" ? frontmatter.ics_uid : undefined,
			icsRecurrenceId:
				typeof frontmatter.ics_recurrence_id === "string" ? frontmatter.ics_recurrence_id : undefined,
		});
	}

	return directory;
}
