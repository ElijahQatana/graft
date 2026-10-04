import type { App, TFile } from "obsidian";
import { buildMeetingFrontmatterUpdate, buildMeetingBodyUpdate, type MeetingUpdateInput } from "./meetingUpdate.ts";
import type { CompanyRecord } from "../match/companyMatch.ts";

/** Updates calendar-owned frontmatter and Invite Agenda. Other body sections stay unchanged. */
export async function updateMeetingNote(
	app: App,
	file: TFile,
	input: MeetingUpdateInput,
	companies: CompanyRecord[],
	strictCompanyLinks = true,
): Promise<void> {
	const frontmatterUpdate = buildMeetingFrontmatterUpdate(input, companies, strictCompanyLinks);

	await app.fileManager.processFrontMatter(file, (frontmatter) => {
		Object.assign(frontmatter, frontmatterUpdate);
	});

	await app.vault.process(file, (data) => buildMeetingBodyUpdate(data, input.event.description));
}
