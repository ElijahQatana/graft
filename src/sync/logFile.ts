import { TFile, type App } from "obsidian";
import { appendLogEntry, type SyncLogEntry } from "./log.ts";

/** Adds an entry to the log note, creating it (and its folders) when it does not exist yet. */
export async function writeSyncLog(app: App, path: string, entry: SyncLogEntry): Promise<void> {
	const file = app.vault.getAbstractFileByPath(path);
	if (file instanceof TFile) {
		await app.vault.process(file, (text) => appendLogEntry(text, entry));
		return;
	}
	if (file) throw new Error("The sync log path is a folder.");
	const parts = path.split("/").slice(0, -1);
	for (let count = 1; count <= parts.length; count++) {
		const folder = parts.slice(0, count).join("/");
		if (!app.vault.getAbstractFileByPath(folder)) await app.vault.createFolder(folder);
	}
	await app.vault.create(path, appendLogEntry(undefined, entry));
}
