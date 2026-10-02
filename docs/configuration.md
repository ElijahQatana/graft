# Configuration

Open Graft in Obsidian's settings. Valid text edits and toggles save automatically; use **Add** or **Save** for rule rows. Invalid edits show a message and leave the saved value unchanged. Save a rule before adding or moving another row.

The settings are available now. Preview and sync commands are not connected yet, so changing these settings does not fetch calendars or write notes.

- **Calendar feeds:** Google and Outlook or Microsoft 365 ICS URLs, each with its `invited_as` identity. Blank URLs leave feeds unconfigured. URLs are masked on screen but stored as plain text in the vault's local plugin settings. Use HTTPS where possible.
- **Folders:** Meeting, Person, Series, and Company folders, relative to the vault root. Defaults are `Meetings`, `People`, `Series`, and `Companies`. Company notes remain manually maintained.
- **Templates:** optional paths to existing Markdown files for Meeting, Person, and Series bodies. Blank selects built-in content. Graft uses `{{name}}` placeholders and does not execute Templater scripts. Template application belongs to the upcoming sync flow.
- **Meeting filenames:** defaults to `{{title}} {{date}}`. Unknown placeholders remain visible.
- **Filters:** an optional ignore-list JSON path and ordered title skip rules. Title modes are exact, prefix, suffix, and contains, with optional case sensitivity. The first matching rule skips the event. Blank ignore-list paths disable that filter; missing files ignore nothing.
- **Person filenames:** ordered domain-to-style rules: full name, first name, or initial and last name. The first matching domain wins; unlisted domains use full names.
- **Sync window:** non-negative whole days back and ahead, defaulting to 7 and 30. Meeting dates and times use the selected timezone, defaulting to UTC.
- **Behavior:** Person and Series stubs, strict Company links, and preview before apply default to on. Startup sync defaults to off. These toggles take effect once the sync flow is connected.

Folder and file paths cannot be absolute or contain parent traversal. Folders do not need to exist yet; template files must exist when selected. Existing settings retain their valid fields when new defaults are added.

Calendar feeds remain read-only. Keep private feed URLs and real calendar data out of source files, fixtures, issues, logs, and shared vault copies.
