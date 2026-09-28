import { Plugin } from "obsidian";

/**
 * Graft syncs a Google Calendar and an Outlook/Microsoft 365 calendar,
 * read-only, into the Meeting/Series/Person/Company notes this vault
 * already uses. This is just the load/unload skeleton; settings and
 * the sync engine itself land in later milestones.
 */
export default class GraftPlugin extends Plugin {
	async onload() {}

	onunload() {}
}
