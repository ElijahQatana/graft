import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	{ ignores: ["main.js", "node_modules/**", "dev-vault/**", "notes/**", "test/**", "esbuild.config.mjs"] },
	...obsidianmd.configs.recommended,
	{
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: ["eslint.config.*"],
				},
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			// Graft and ICS are names. Meeting is the note type's name, and Work is an example calendar name.
			"obsidianmd/ui/sentence-case": ["warn", { brands: ["Graft", "ICS", "Meeting", "Work"] }],
			// The declarative settings API (getSettingDefinitions) needs Obsidian 1.13, but Graft supports 1.4.4 and
			// later, so the settings tab keeps display(). Revisit when minAppVersion reaches 1.13.
			"obsidianmd/settings-tab/prefer-setting-definitions": "off",
			"@typescript-eslint/no-deprecated": "off",
			// createEl("div") and createDiv() are equivalent; the settings and preview code reads consistently with createEl.
			"obsidianmd/prefer-create-el": "off",
		},
	},
]);
