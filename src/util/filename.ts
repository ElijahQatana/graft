/** Replaces slash and pipe in filenames with a hyphen. The note title stays unchanged. */
export function sanitizeFilename(name: string): string {
	return name.replace(/[/|]/g, "-");
}
