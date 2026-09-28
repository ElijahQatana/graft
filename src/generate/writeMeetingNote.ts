import { stringifyYaml, type App, type TFile } from "obsidian";
import { buildMeetingNote, type MeetingNoteInput } from "./meetingNote.ts";
import { validateCompanyLinks, type CompanyRecord } from "../match/companyMatch.ts";

/**
 * Builds and writes a new Meeting note. Deliberately thin: all the
 * actual content decisions live in buildMeetingNote, which stays
 * testable without a vault; this just serializes and creates the
 * file, and does the one thing that genuinely needs a live vault to
 * check, whether the target path is already taken.
 */
export async function writeMeetingNote(
	app: App,
	folder: string,
	input: MeetingNoteInput,
	companies: CompanyRecord[],
	filenamePattern?: string,
): Promise<TFile> {
	const note = buildMeetingNote(input, filenamePattern);
	note.frontmatter.companies = validateCompanyLinks(
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
