/** An error whose message is safe to show in a notice: it never holds a feed URL or note text. */
export class UserFacingError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "UserFacingError";
	}
}
