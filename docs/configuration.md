# Settings

Open Graft in Obsidian's settings. Text fields and toggles save automatically. Rule rows use **Add** and **Save**; save a row before moving or adding another. Invalid edits show a message and leave the saved value unchanged.

These settings do not start a sync yet. Preview and sync commands are still being connected.

- **Feeds:** Google and Outlook ICS URLs and an `invited_as` identity for each. Blank URLs leave a feed unconfigured. URLs are masked on screen but saved as plain text in the vault's plugin settings. Prefer HTTPS.
- **Folders:** Meeting, Person, Series, and Company folders. Defaults are `Meetings`, `People`, `Series`, and `Companies`. Company notes are maintained manually.
- **Templates:** optional Markdown file paths for Meeting, Person, and Series bodies. Blank selects the built-in body once sync is connected. Graft uses `{{name}}` placeholders; it does not run Templater scripts.
- **Meeting filenames:** default to `{{title}} {{date}}`. Unknown placeholders remain visible.
- **Filters:** an optional ignore-list JSON path and ordered title skip rules. Title rules support exact, prefix, suffix, and contains, with optional case sensitivity. The first match wins. A blank or missing ignore list ignores nothing.
- **Person filenames:** ordered domain rules for full name, first name, or initial and last name. The first match wins; unlisted domains use full names.
- **Window:** whole days back and ahead, including zero. Defaults are 7 and 30, with UTC as the timezone.
- **Behavior:** Person and Series stubs, strict Company links, and preview default to on. Startup sync defaults to off. These options take effect once sync is connected.

Paths are relative to the vault root and cannot contain parent traversal. Templates must exist when selected; folders can be created later.

Keep feed URLs and real calendar data out of shared notes, screenshots, logs, and vault copies.
