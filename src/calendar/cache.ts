import type { SyncPreview } from "../preview/plan.ts";

/** A plan to draw, or the error that prevented one. */
export interface CachedBrowse {
	preview?: SyncPreview;
	/** Only when nothing could be planned. Per-feed problems are in `preview.errors`. */
	error?: string;
	at: Date;
}

/** Keeps the last result so reopening the view does not fetch every feed again. */
export class BrowseCache {
	private current?: CachedBrowse;
	private pending?: Promise<CachedBrowse>;
	private generation = 0;

	private readonly load: () => Promise<SyncPreview>;
	private readonly describeError: (error: unknown) => string;
	private readonly now: () => Date;

	constructor(load: () => Promise<SyncPreview>, describeError: (error: unknown) => string, now: () => Date = () => new Date()) {
		this.load = load;
		this.describeError = describeError;
		this.now = now;
	}

	get(): Promise<CachedBrowse> {
		if (this.current) return Promise.resolve(this.current);
		return this.refresh();
	}

	peek(): CachedBrowse | undefined {
		return this.current;
	}

	get loading(): boolean {
		return this.pending !== undefined;
	}

	/** Calls made while a load runs share it. */
	refresh(): Promise<CachedBrowse> {
		if (this.pending) return this.pending;
		const generation = this.generation;
		const run = (async (): Promise<CachedBrowse> => {
			let result: CachedBrowse;
			try {
				result = { preview: await this.load(), at: this.now() };
			} catch (error) {
				result = { error: this.describeError(error), at: this.now() };
			}
			// A clear during the load means this result is already out of date.
			if (generation === this.generation) this.current = result;
			return result;
		})().finally(() => { if (this.pending === run) this.pending = undefined; });
		this.pending = run;
		return run;
	}

	clear() {
		this.generation++;
		this.current = undefined;
		this.pending = undefined;
	}
}

export function updatedLabel(at: Date | undefined, zone: string): string {
	if (!at) return "Not loaded yet";
	return `Updated ${new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: zone }).format(at)}`;
}
