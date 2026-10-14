# Settings

Open Graft in Obsidian's settings. Text fields and toggles save automatically. Rows in lists use **Add** (or **Add calendar**) and **Save**; save a row before moving or adding another. Invalid edits show a message and leave the saved value unchanged.

Each group of settings is a collapsible section: Calendars, Folders and templates, Filters, Sync window, Sync behavior, and Note schema, which has collapsible sub-groups of its own. Select a heading, or tab to it and press Enter or Space, to open or close it. Sections stay open or closed when you save, move, or remove a row, and when you close and reopen the settings in the same session. Note schema and its sub-groups start closed.

The search box at the top filters rows by name and description as you type. Every word you type must appear in a row. Sections with no match are hidden, sections with a match open, and an empty result shows a short message. Clear the box, select **Clear**, or press Escape to go back to the normal view, with your sections as you left them. A row that is showing an error message stays visible during a search, and a section holding one cannot be collapsed until the problem is fixed. Searching and collapsing never change a saved value.

For a first-run walk-through, see [Getting started](getting-started.md).

Use **Graft: Preview sync** to review changes. **Graft: Sync now** follows the preview toggle; with preview off, it writes immediately.

- **Calendars:** the list of calendars to sync, empty on a new install. Use **Add calendar** to add one, then **Save**, **Up**, **Down**, and **Remove** on its row. Each calendar has:
  - a **name**, which is required and must be unique (case is ignored). Previews use it to say which calendar had a problem.
  - a **type**, Google or Outlook / Microsoft 365.
  - the calendar's private **ICS URL**, which is required and must be an HTTP or HTTPS address without a username or password. URLs are masked on screen but saved as plain text in the vault's plugin settings. Prefer HTTPS. Errors never repeat the URL.
  - an **invited as** identity, written to each Meeting note's `invited_as` property for events from that calendar.

  Sync needs at least one calendar. Removing a calendar does not change existing notes. Settings saved before this list existed carry over: the old Google and Outlook feeds that had a URL become calendars named `Google` and `Outlook`, and blank ones are dropped.

  If the same event appears in more than one calendar, such as an invite you received on two accounts, Graft writes one Meeting note, using the calendar that is higher in the list. The copies from the other calendars show up under **Skipped events** in the preview. Move a calendar up to make its `invited_as` and details win. Recurring events are matched one occurrence at a time.
- **Folders:** Meeting, Person, and Series folders, plus the Company folder when Company linking is on. Defaults are `Meetings`, `People`, `Series`, and `Companies`. Company notes are maintained manually.
- **Templates:** optional Markdown file paths for new Meeting, Person, and Series bodies. Blank selects the built-in body. Template frontmatter is ignored; Graft keeps its note fields. Graft uses `{{name}}` placeholders; it does not run Templater scripts. Meeting bodies can use `{{invite_agenda}}` and `{{series_agenda}}`. See [Custom templates](templates.md) for every placeholder.
- **Meeting filenames:** default to `{{title}} {{date}}`. Unknown placeholders remain visible. In every Meeting, Person, and Series filename, characters Obsidian does not allow (`\ / : * ? " < > |`) and ones that break links (`# ^ [ ]`) become a hyphen. The note title and properties keep the original text. If two names become the same, the preview reports a filename conflict.
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

Keep feed URLs and real calendar data out of shared notes, screenshots, logs, and vault copies. See [Troubleshooting](troubleshooting.md) for notices and the privacy note.
