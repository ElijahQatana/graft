# Settings

Open Graft in Obsidian's settings. Text fields and toggles save automatically. Rule rows use **Add** and **Save**; save a row before moving or adding another. Invalid edits show a message and leave the saved value unchanged.

Use **Graft: Preview sync** to review changes. **Graft: Sync now** follows the preview toggle; with preview off, it writes immediately.

- **Feeds:** Google and Outlook ICS URLs and an `invited_as` identity for each. Blank URLs leave a feed unconfigured. URLs are masked on screen but saved as plain text in the vault's plugin settings. Prefer HTTPS.
- **Folders:** Meeting, Person, Series, and Company folders. Defaults are `Meetings`, `People`, `Series`, and `Companies`. Company notes are maintained manually.
- **Templates:** optional Markdown file paths for new Meeting, Person, and Series bodies. Blank selects the built-in body. Template frontmatter is ignored; Graft keeps its note fields. Graft uses `{{name}}` placeholders; it does not run Templater scripts. Meeting bodies can use `{{invite_agenda}}` and `{{series_agenda}}`.
- **Meeting filenames:** default to `{{title}} {{date}}`. Unknown placeholders remain visible.
- **Filters:** an optional ignore-list JSON path and ordered title skip rules. Title rules support exact, prefix, suffix, and contains, with optional case sensitivity. The first match wins. A blank or missing ignore list ignores nothing.
- **Person filenames:** ordered domain rules for full name, first name, or initial and last name. The first match wins; unlisted domains use full names.
- **Window:** whole days back and ahead, including zero. Defaults are 7 and 30, with UTC as the timezone.
- **Behavior:** Person and Series stubs, strict Company links, and preview default to on. Strict Company links omits unresolved links from Meeting notes; with it off, links from existing Person notes are kept. Startup sync defaults to off.

## Note schema

The **Note schema (advanced)** section sets the note types, property names, and headings Graft reads and writes, so it can work with a vault laid out differently from the defaults. Everything here has a default; most vaults only change a few names. Property names cannot be empty (except where noted), contain colons, or repeat within one note type.

- **Presets:** **Use minimal** is the default for new installs. **Use original** restores the schema used before these settings existed; settings saved by an earlier version load with it, so existing notes keep matching. A preset replaces every schema setting.
- **Note types:** the property that holds the note type (`type`) and the value for Meeting, Person, Series, and Company notes.
- **Meeting properties:** names for title, date, scheduled start and end, organizer, invited, series link, invited as, invite updated, event UID, recurrence ID, and occurrence status. Invite updated and occurrence status can be left blank to skip them. Date and event UID are also read from existing notes, so changing a name does not rename it in notes you already have.
- **Person, Series, and Company properties:** the email, aliases, and company link properties on Person notes, the name properties on new Person stubs, the event UID and title on Series notes, and the domain on Company notes. The Series event UID defaults to `ics_uid`; the original schema uses `google_recurring_event_id`.
- **Headings:** the invite agenda heading Graft keeps up to date, the Series agenda heading used in new Meeting bodies, and the standing agenda heading it copies from Series notes. Use a Markdown heading such as `## Invite Agenda`. If an existing Meeting note has no invite agenda heading, its agenda is not updated and the preview warns about it; add the heading to the note or to your Meeting template.
- **Built-in Meeting body:** used when no Meeting template is set. `{{invite_section}}` is required; `{{series_section}}` adds the Series agenda when there is one.
- **Extra Meeting properties:** additional properties written to new Meeting notes, each with a name and a value. Values can use `{{title}}`, `{{date}}`, `{{week}}`, `{{month}}`, `{{year}}`, `{{weekday}}`, `{{recurrence}}` (`RegularSync` with a Series note, otherwise `OneOff`), and `{{companies}}`. A value of exactly `{{companies}}` becomes a list of Company links. Write a list as `["a", "b"]`. **Update** refreshes the property on every sync; other extras are written once and then left to you. To link Companies in Meeting notes, add `companies` with the value `{{companies}}` and turn on Update.

An edit that would give two properties the same name, or leave a required name empty, shows a message and is not saved.

Paths are relative to the vault root and cannot contain parent traversal. Templates must exist when selected; folders can be created later.

Keep feed URLs and real calendar data out of shared notes, screenshots, logs, and vault copies.
