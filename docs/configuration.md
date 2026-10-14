# Settings

Open Graft in Obsidian's settings. Text fields and toggles save automatically. Rule rows use **Add** and **Save**; save a row before moving or adding another. Invalid edits show a message and leave the saved value unchanged.

Use **Graft: Preview sync** to review changes. **Graft: Sync now** follows the preview toggle; with preview off, it writes immediately.

- **Feeds:** Google and Outlook ICS URLs and an `invited_as` identity for each. Blank URLs leave a feed unconfigured. URLs are masked on screen but saved as plain text in the vault's plugin settings. Prefer HTTPS.
- **Folders:** Meeting, Person, and Series folders, plus the Company folder when Company linking is on. Defaults are `Meetings`, `People`, `Series`, and `Companies`. Company notes are maintained manually.
- **Templates:** optional Markdown file paths for new Meeting, Person, and Series bodies. Blank selects the built-in body. Template frontmatter is ignored; Graft keeps its note fields. Graft uses `{{name}}` placeholders; it does not run Templater scripts. Meeting bodies can use `{{invite_agenda}}` and `{{series_agenda}}`.
- **Meeting filenames:** default to `{{title}} {{date}}`. Unknown placeholders remain visible.
- **Filters:** an optional ignore-list JSON path and ordered title skip rules. Title rules support exact, prefix, suffix, and contains, with optional case sensitivity. The first match wins. A blank or missing ignore list ignores nothing.
- **Person filenames:** ordered domain rules for full name, first name, or initial and last name. The first match wins; unlisted domains use full names.
- **Window:** whole days back and ahead, including zero. Defaults are 7 and 30, with UTC as the timezone.
- **Behavior:** Person and Series stubs and preview default to on. Startup sync and Company linking default to off.
- **Company linking:** off on a new install, so a vault without Company notes sees no Company settings or warnings. While it is off, new Person stubs have no company property, Graft does not read Company notes or match attendee domains, Meeting notes get no Company links (an existing `companies` value on a Meeting note is left as it is), and the preview raises no unresolved-Company warnings. The Company folder, Company type, Company domain property, Person company property, and Strict Company links settings are hidden; their values are kept for when linking is turned on again. Settings saved before this option existed load with it on, so existing vaults behave as before.
- **Strict Company links:** shown when Company linking is on, and on by default. It omits unresolved links from Meeting notes and warns in the preview; with it off, links from existing Person notes are kept.

## Note schema

The **Note schema (advanced)** section sets the note types, property names, and headings Graft reads and writes, so it can work with a vault laid out differently from the defaults. Everything here has a default; most vaults only change a few names. Property names cannot be empty (except where noted), contain colons, or repeat within one note type.

- **Presets:** **Use minimal** is the default for new installs. **Use original** restores the schema used before these settings existed; settings saved by an earlier version load with it, so existing notes keep matching. A preset replaces every schema setting.
- **Note types:** the property that holds the note type (`type`) and the value for Meeting, Person, Series, and, with Company linking on, Company notes.
- **Meeting properties:** names for title, date, scheduled start and end, organizer, invited, series link, invited as, invite updated, event UID, recurrence ID, and occurrence status. Invite updated and occurrence status can be left blank to skip them. Date and event UID are also read from existing notes, so changing a name does not rename it in notes you already have.
- **Person, Series, and Company properties:** the email and aliases properties on Person notes, the company link property on Person notes and the domain on Company notes (both shown only with Company linking on), the name properties on new Person stubs, and the event UID and title on Series notes. The Series event UID defaults to `ics_uid`; the original schema uses `google_recurring_event_id`.
- **Headings:** the invite agenda heading Graft keeps up to date, the Series agenda heading used in new Meeting bodies, and the standing agenda heading it copies from Series notes. Use a Markdown heading such as `## Invite Agenda`. If an existing Meeting note has no invite agenda heading, its agenda is not updated and the preview warns about it; add the heading to the note or to your Meeting template.
- **Status and recurrence values:** the occurrence status written to Meeting notes (`Scheduled`, or `Cancelled` when the calendar marks the occurrence cancelled) and the `{{recurrence}}` value (`RegularSync` with a Series note, otherwise `OneOff`). Each value must be non-empty, and the two status values must differ, as must the two recurrence values. An update sets the cancelled status only on an explicit cancellation; a live event leaves the existing status alone. Changing a value does not rewrite notes you already have.
- **Built-in Meeting body:** used when no Meeting template is set. `{{invite_section}}` is required; `{{series_section}}` adds the Series agenda when there is one.
- **Extra Meeting properties:** additional properties written to new Meeting notes, each with a name and a value. Values can use `{{title}}`, `{{date}}`, `{{week}}`, `{{month}}`, `{{year}}`, `{{weekday}}`, `{{recurrence}}` (the series or one-off recurrence value), and `{{companies}}`. A value of exactly `{{companies}}` becomes a list of Company links. Write a list as `["a", "b"]`. **Update** refreshes the property on every sync; other extras are written once and then left to you. To link Companies in Meeting notes, turn on Company linking, add `companies` with the value `{{companies}}`, and turn on Update. With Company linking off, extras whose value is `{{companies}}` are not written.

An edit that would give two properties the same name, or leave a required name empty, shows a message and is not saved.

Paths are relative to the vault root and cannot contain parent traversal. Templates must exist when selected; folders can be created later.

Keep feed URLs and real calendar data out of shared notes, screenshots, logs, and vault copies.
