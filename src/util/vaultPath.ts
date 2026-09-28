import type { TFile } from "obsidian";

/** True if a file's path is inside the given vault folder (or is the folder note itself). */
export function isInFolder(file: TFile, folder: string): boolean {
	return file.path === folder || file.path.startsWith(`${folder}/`);
}
