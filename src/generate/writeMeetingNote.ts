import { stringifyYaml, type App, type TFile } from "obsidian";
import { buildMeetingNote, type MeetingNoteInput } from "./meetingNote.ts";
import { validateCompanyLinks, type CompanyRecord } from "../match/companyMatch.ts";

/** Serializes and creates a Meeting note, checking for an existing file first. */
export async function writeMeetingNote(
	app: App,
	folder: string,
	input: MeetingNoteInput,
	companies: CompanyRecord[],
	filenamePattern?: string,
	strictCompanyLinks = true,
): Promise<TFile> {
	const note = buildMeetingNote(input, filenamePattern);
	if (strictCompanyLinks) note.frontmatter.companies = validateCompanyLinks(
		note.frontmatter.companies as string[],
		companies,
	);

	const path = `${folder}/${note.filename}.md`;
	if (app.vault.getAbstractFileByPath(path)) {
		throw new Error(`A file already exists at ${path}`);
	}

	const content = `---\n${stringifyYaml(note.frontmatter)}---\n\n${note.body}`;
	return app.vault.create(path, content);
}
