import type { App } from "obsidian";
import type { GraftSettings } from "./settings.ts";

/** The part of Obsidian's secret storage that Graft uses. It has no delete: an empty secret clears one. */
export interface SecretStore {
	getSecret(id: string): string | null;
	setSecret(id: string, secret: string): void;
}

/** Obsidian before 1.11.4 has no secret storage, so this is undefined there. */
export function secretStoreOf(app: App): SecretStore | undefined {
	const store = (app as unknown as { secretStorage?: Partial<SecretStore> } | undefined)?.secretStorage;
	return store && typeof store.getSecret === "function" && typeof store.setSecret === "function" ? store as SecretStore : undefined;
}

export function secretIdFor(calendarId: string): string {
	return `graft-calendar-${calendarId}`;
}

/** Fills each calendar's `url` from secret storage. A plain-text URL left in the saved data is moved
 * into storage once, and `moved` counts those so the caller can save without them. A calendar whose
 * storage call throws keeps what it had, and `failed` counts it. */
export function hydrateSecrets(settings: GraftSettings, store: SecretStore | undefined): { moved: number; failed: number } {
	let moved = 0;
	let failed = 0;
	if (!store) return { moved, failed };
	for (const calendar of settings.calendars) {
		try {
			if (calendar.url) {
				store.setSecret(secretIdFor(calendar.id), calendar.url);
				moved++;
			} else {
				calendar.url = store.getSecret(secretIdFor(calendar.id)) ?? "";
			}
		} catch {
			failed++;
		}
	}
	return { moved, failed };
}

/** Returns a copy of `settings` that is safe to write to data.json, after putting each URL into secret
 * storage and clearing the secrets of calendars in `removedIds`. With no storage the copy is unchanged.
 * A URL that cannot be stored stays in the copy so it is never lost, and `failed` counts it. */
export function prepareForSave(settings: GraftSettings, store: SecretStore | undefined, removedIds: string[] = []): { data: GraftSettings; failed: number } {
	const data = JSON.parse(JSON.stringify(settings)) as GraftSettings;
	let failed = 0;
	if (!store) return { data, failed };
	for (const id of removedIds) {
		try { store.setSecret(secretIdFor(id), ""); } catch { failed++; }
	}
	for (const calendar of data.calendars) {
		if (!calendar.url) continue;
		try {
			store.setSecret(secretIdFor(calendar.id), calendar.url);
			calendar.url = "";
		} catch {
			failed++;
		}
	}
	return { data, failed };
}
