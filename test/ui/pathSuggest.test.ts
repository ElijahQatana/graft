import { test } from "node:test";
import { strict as assert } from "node:assert";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";

class TFolder { path: string; constructor(path: string) { this.path = path; } }
class TFile { path: string; extension: string; constructor(path: string) { this.path = path; this.extension = path.split(".").at(-1)!; } }
const created: any[] = [];
class AbstractInputSuggest {
	[key: string]: any;
	constructor(app: any, inputEl: any) { this.app = app; this.inputEl = inputEl; created.push(this); }
	setValue(value: string) { this.inputEl.value = value; }
	close() { this.closed = true; }
}

async function load(withSuggest: boolean): Promise<any> {
	const result = await build({ entryPoints: ["src/ui/pathSuggest.ts"], bundle: true, write: false, platform: "node", format: "cjs", external: ["obsidian"] });
	const module: { exports: any } = { exports: {} };
	const obsidian: any = { TFile, TFolder };
	if (withSuggest) obsidian.AbstractInputSuggest = AbstractInputSuggest;
	runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require: () => obsidian, Event });
	return module.exports;
}

const app: any = {
	vault: {
		getAllLoadedFiles: () => [new TFolder("/"), new TFolder("Meetings"), new TFolder("Meetings/Work"), new TFile("Notes/a.md")],
		getFiles: () => [new TFile("Templates/Meeting.md"), new TFile("Config/ignore.json"), new TFile("Notes/a.md")],
	},
};

test("suggests folders, Markdown files or JSON files for the kind asked", async () => {
	const { attachPathSuggest } = await load(true);
	const input: any = { value: "", dispatchEvent() {} };
	for (const [kind, expected] of [["folder", ["Meetings", "Meetings/Work"]], ["markdown", ["Notes/a.md", "Templates/Meeting.md"]], ["json", ["Config/ignore.json"]]] as const) {
		created.length = 0;
		attachPathSuggest(app, input, kind);
		assert.deepEqual([...created[0].getSuggestions("")].sort(), expected);
	}
});

test("picking a suggestion fills the box, fires the input event and closes the list", async () => {
	const { attachPathSuggest } = await load(true);
	const events: string[] = [];
	const input: any = { value: "", dispatchEvent: (event: Event) => events.push(event.type) };
	created.length = 0;
	attachPathSuggest(app, input, "folder");
	created[0].selectSuggestion("Meetings/Work");
	assert.equal(input.value, "Meetings/Work");
	assert.deepEqual(events, ["input"]);
	assert.equal(created[0].closed, true);
});

test("does nothing where Obsidian has no input suggest", async () => {
	const { attachPathSuggest } = await load(false);
	created.length = 0;
	attachPathSuggest(app, { value: "", dispatchEvent() {} }, "folder");
	assert.equal(created.length, 0);
});
