import { AbstractInputSuggest, TFile, TFolder, type App } from "obsidian";
import { pathChoices } from "../util/pathChoices.ts";

export type PathKind = "folder" | "markdown" | "json";

function vaultPaths(app: App, kind: PathKind): string[] {
	if (kind === "folder") {
		return app.vault.getAllLoadedFiles().filter((file): file is TFolder => file instanceof TFolder && file.path !== "/").map((folder) => folder.path);
	}
	const extension = kind === "markdown" ? "md" : "json";
	return app.vault.getFiles().filter((file: TFile) => file.extension === extension).map((file) => file.path);
}

/** Adds vault path suggestions to a text input. Picking a suggestion fires the input event, so it saves
 * like typing. The typeof check keeps a build that runs where the class is missing from throwing. */
export function attachPathSuggest(app: App, inputEl: HTMLInputElement, kind: PathKind): void {
	if (typeof AbstractInputSuggest !== "function") return;
	class PathSuggest extends AbstractInputSuggest<string> {
		getSuggestions(query: string): string[] {
			return pathChoices(vaultPaths(app, kind), query);
		}
		renderSuggestion(path: string, el: HTMLElement): void {
			el.setText(path);
		}
		selectSuggestion(path: string): void {
			this.setValue(path);
			inputEl.dispatchEvent(new Event("input"));
			this.close();
		}
	}
	new PathSuggest(app, inputEl);
}
