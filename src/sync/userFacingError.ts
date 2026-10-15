/** An error whose message is safe to show in a notice: it never holds a feed URL or note text. */
export class UserFacingError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "UserFacingError";
	}
}

/** Apply stopped because notes changed after the plan was made. Planning again is safe, so a scheduled run retries quietly. */
export class VaultChangedError extends UserFacingError {
	constructor(message: string) {
		super(message);
		this.name = "VaultChangedError";
	}
}
