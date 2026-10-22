import type { TFile } from "obsidian";

/** True if a file's path is inside the given vault folder (or is the folder note itself). */
export function isInFolder(file: TFile, folder: string): boolean {
	return file.path === folder || file.path.startsWith(`${folder}/`);
}

/** Returns `base`, or `base 2`, `base 3` and so on, using the first name that `isTaken` rejects as taken. */
export function uniqueName(base: string, isTaken: (name: string) => boolean): string {
	let name = base;
	for (let count = 2; isTaken(name); count++) name = `${base} ${count}`;
	return name;
}

/** The note's file name without its folder and `.md` extension, for display. */
export function noteTitle(path: string): string {
	const name = path.slice(path.lastIndexOf("/") + 1);
	return name.endsWith(".md") ? name.slice(0, -3) : name;
}
