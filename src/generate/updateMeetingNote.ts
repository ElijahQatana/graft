import type { App, TFile } from "obsidian";
import { buildMeetingFrontmatterUpdate, type MeetingUpdateInput } from "./meetingUpdate.ts";
import { replaceSection } from "../util/markdownSections.ts";
import type { CompanyRecord } from "../match/companyMatch.ts";

/** Updates calendar-owned frontmatter and Invite Agenda. Other body sections stay unchanged. */
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
