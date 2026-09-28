import type { App, TFile } from "obsidian";
import { buildMeetingFrontmatterUpdate, type MeetingUpdateInput } from "./meetingUpdate.ts";
import { replaceSection } from "../util/markdownSections.ts";
import type { CompanyRecord } from "../match/companyMatch.ts";

/**
 * Updates an existing Meeting note in place: only the owned
 * frontmatter fields (via processFrontMatter, which merges rather
 * than overwrites) and the Invite Agenda body subsection specifically.
 * Everything else in the note, including hand-written body sections
 * and the Series Agenda after its one-time copy, is never read here
 * at all, let alone written.
 */
export async function updateMeetingNote(
	app: App,
	file: TFile,
	input: MeetingUpdateInput,
	companies: CompanyRecord[],
): Promise<void> {
	const frontmatterUpdate = buildMeetingFrontmatterUpdate(input, companies);

	await app.fileManager.processFrontMatter(file, (frontmatter) => {
		Object.assign(frontmatter, frontmatterUpdate);
	});

	const inviteAgenda =
		input.event.description && input.event.description.trim()
			? input.event.description.trim()
			: "No agenda provided";

	await app.vault.process(file, (data) => replaceSection(data, "## Invite Agenda", inviteAgenda));
}
