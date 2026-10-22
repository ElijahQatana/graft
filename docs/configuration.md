# Settings

Open Graft in Obsidian's settings. For a first-run walk-through, see [Getting started](getting-started.md).

## Contents

- [Using the settings tab](#using-the-settings-tab)
- [Commands](#commands)
- [Calendars](#calendars)
- [Folders, templates and filenames](#folders-templates-and-filenames)
- [Filters](#filters)
- [Sync window](#sync-window)
- [Sync behavior](#sync-behavior)
- [Scheduled sync](#scheduled-sync)
- [Sync log note](#sync-log-note)
- [Cancel vanished events](#cancel-vanished-events)
- [Company linking](#company-linking)
- [Note schema](#note-schema)
- [Where feed URLs are stored](#where-feed-urls-are-stored)

## Using the settings tab

**Saving.** Text fields and toggles save as you change them. Rows in lists use **Add** (or **Add calendar**) and **Save**; save a row before moving or adding another. An invalid edit shows a message and leaves the saved value unchanged. Folder, template and ignore-list fields suggest paths from your vault as you type. Pick one or type the path yourself.

**Sections.** Settings are grouped into collapsible sections: Calendars, Folders and templates, Filters, Sync window, Sync behavior, and Note schema, which has sub-groups of its own. Each heading shows a short summary at the right, such as the number of calendars. Select a heading, or tab to it and press Enter or Space, to open or close it. Sections keep their state when you save, move or remove a row, and when you close and reopen the settings in the same session. Every group starts closed, except Calendars while you have none.

**Search.** The box at the top filters rows by name and description. Every word you type must appear in a row. Sections with a match open, sections without one are hidden, and an empty result shows a short message. Clear the box, select **Clear**, or press Escape to return to the normal view. A row showing an error stays visible during a search, and a section holding one cannot be collapsed until the problem is fixed. Searching and collapsing never change a saved value.

## Commands

| Command | What it does |
| --- | --- |
| **Graft: Preview sync** | Reads the calendars and shows every planned change. Writes nothing. |
| **Graft: Sync now** | Follows the **Preview before apply** toggle. With preview off, it writes immediately. |
| **Graft: Open calendar** | Opens the calendar view. Also available from the Graft icon in the ribbon. |

While Graft reads calendars or writes notes, a spinner with a short label shows in the status bar on desktop, and as a notice on mobile, until the run ends.

### Calendar view

The view can be docked in a sidebar or a tab. It shows the 14 days before today and the 30 days after, whatever the sync window is, with 1-day, 3-day and week layouts. The week layout starts on the day set under **Week starts on** in the sync window settings.

- Calendars are read once and kept in memory. Press **Refresh** to read them again.
- A feed that fails shows an error in the view, and the others still show.
- The view never writes notes. Select an event and use **Open note** to open its Meeting note, when one exists.

## Calendars

The list of calendars to sync. It is empty on a new install, and sync needs at least one. Use **Add calendar** to add one.

A saved calendar shows as one line with its type, its Invited as value, and whether its address is on this device. Use **Edit** to change its fields, then **Save** or **Cancel**. **Up**, **Down** and **Remove** are on the line. Removing a calendar does not change existing notes.

| Field | Notes |
| --- | --- |
| Name | Required. Must be unique, ignoring case. Previews use it to say which calendar had a problem. |
| Type | Google, or Outlook / Microsoft 365. |
| ICS URL | Required. An HTTP or HTTPS address with no username or password. Prefer HTTPS. It is masked on screen, and errors never repeat it. See [Where feed URLs are stored](#where-feed-urls-are-stored). |
| Invited as | Written to the `invited_as` property of each Meeting note from that calendar. |

### The same event in several calendars

If an event appears in more than one calendar, such as an invite you received on two accounts, Graft writes one Meeting note, using the calendar higher in the list. The other copies are listed under **Skipped events** in the preview. Move a calendar up to make its `invited_as` and details win. Recurring events are matched one occurrence at a time.

## Folders, templates and filenames

### Folders

| Setting | Default | Notes |
| --- | --- | --- |
| Meeting folder | `Meetings` | |
| Person folder | `People` | |
| Series folder | `Series` | |
| Company folder | `Companies` | Shown only with [Company linking](#company-linking) on. Company notes are maintained by hand. |

Paths are relative to the vault root and cannot contain parent traversal. Folders can be created later.

### Templates

Optional Markdown file paths for the body of new Meeting, Person and Series notes. Blank uses the built-in body. Templates must exist when selected.

- Template frontmatter is ignored. Graft keeps its own note fields.
- Graft uses `{{name}}` placeholders. It does not run Templater scripts.
- Meeting bodies can use `{{invite_agenda}}` and `{{series_agenda}}`.

See [Custom templates](templates.md) for every placeholder.

### Filenames

Meeting filenames default to `{{title}} {{date}}`. Unknown placeholders stay visible.

In every Meeting, Person and Series filename, characters Obsidian does not allow (`\ / : * ? " < > |`) and ones that break links (`# ^ [ ]`) become a hyphen. Next to a space they become a spaced hyphen, and at the very start or end they are dropped.

| Title | Filename |
| --- | --- |
| `Roadmap sync: milestones` | `Roadmap sync - milestones` |
| `A*B` | `A-B` |

The note title and properties keep the original text. If two names become the same, the preview reports a filename conflict.

## Filters

| Setting | Default | Notes |
| --- | --- | --- |
| Ignore-list file | blank | Path to a JSON file. A blank or missing file ignores nothing. |
| Title skip rules | none | Ordered. Types are exact, prefix, suffix and contains, with optional case sensitivity. The first match wins. |
| Title prefixes to strip | `FW:`, `Fwd:`, `RE:` | See below. |
| Only events I have accepted | off | See below. |
| Merge duplicates across calendars | off | See below. |

**Title prefixes to strip.** Comma-separated text removed from the start of event titles, ignoring case. Repeated prefixes are all removed. Stripping happens as events are read, before title skip rules run, so those rules, Meeting filenames, Series names and the title property all use the cleaned title. Notes are still matched by event UID, so a forwarded invite does not create a duplicate. Existing note names are not changed. Clear the field to keep titles as they arrive.

**Only events I have accepted.** When on, Graft skips an event if your own response in the feed is declined, tentative or not yet given, and lists it under **Skipped events** with the reason. The filter runs after the title rules and the ignore list.

- Your entry in the guest list is found by comparing its email address, ignoring case, with the **Invited as** value of the calendar the event came from. Put your email address there. Without one, the filter has nothing to match and skips nothing.
- Events with no entry for you (you are the organizer, or there are no guests) are kept, and so are entries with no response recorded.
- Google feeds include responses. Outlook and Microsoft 365 published feeds may leave them out, in which case every event is kept. This has not been tested against real Outlook feeds yet.

**Busy blocks.** A calendar-mirroring tool may copy events between your calendars as placeholders titled `Busy`. There is no separate setting for them: a title skip rule already does the job. Add a rule of type **exact** with the value `Busy`. Exact rules ignore case unless you turn on case sensitivity, and they compare the whole title after the prefixes are stripped, so `Busy`, `busy` and `BUSY` are skipped but `Busy lunch` is not. Add one rule for each other placeholder title you see. Skipped Busy blocks are listed under **Skipped events** with the reason `title matched exact "Busy"`.

**Merge duplicates across calendars.** The same tool can also copy a meeting with its details, so one real meeting arrives from two calendars under different IDs. When this is on, Graft treats events from different calendars as one meeting if they have the same start, the same end (or the same all-day date) and the same title, ignoring case and outer spaces. Times are compared as moments, so calendars in different time zones still match.

- The copy from the calendar higher in the **Calendars** list is kept. If that does not decide it, the copy with a description or guests is kept. The kept event is not changed, so its note is matched by its event ID as before, and a reschedule updates the existing note.
- The other copies are listed under **Skipped events** with the reason `Duplicate of <title> from <calendar name>`.
- Events in the same calendar are never merged, and neither are events whose titles differ in any way other than case.
- Recurring events are compared one occurrence at a time, each by its own start and end.
- The check runs after the title rules, the ignore list and **Only events I have accepted**. A skipped Busy block or a declined copy therefore never takes the place of a full-detail copy.
- A note Graft already wrote for a copy that is now skipped is left as it is. Graft does not edit or delete it; remove it yourself if you do not want it.

The ignore list format is described in [Troubleshooting](troubleshooting.md#ignore-list-format).

## Sync window

| Setting | Default | Notes |
| --- | --- | --- |
| Days back | 7 | Whole days, zero allowed. |
| Days ahead | 30 | Whole days, zero allowed. |
| Timezone | UTC | |
| Week starts on | Follow Obsidian's language | The first column of the Week layout in the calendar view and the preview calendar. Choose Sunday to Saturday, or follow the first day of the week for the language Obsidian is set to, which is Sunday for English (US) and Monday for English (UK). Settings saved before this existed use the language default. |

## Sync behavior

| Setting | Default |
| --- | --- |
| Preview before apply | on |
| Create Person stubs | on |
| Create Series stubs | on |
| Invite text clean-up | on |
| Sync on startup | off |
| Company linking | off |
| Only events I have accepted | off |
| Cancel vanished events | off |
| Scheduled sync | off |

**Person filenames.** Ordered domain rules for full name, first name, or initial and last name. The first match wins. Unlisted domains use full names.

**Invite text clean-up.** Before the description is written under the invite agenda heading, Graft removes Teams, Google Meet and Zoom join links and labels, meeting IDs and passcodes, dial-in numbers, HTML tags and long separator lines, and collapses repeated blank lines. Other text is left as written, including ordinary links and numbers. If nothing is left, the section shows the empty agenda placeholder. The preview shows the cleaned text, and an existing note whose agenda still holds join text shows a change for it in the next preview. Turn the setting off to write the description as it arrives.

## Scheduled sync

Off by default. The **Sync interval** is 15 to 1440 minutes (default 60). The first check runs one interval after Obsidian starts, and a check is skipped while a sync or preview is open.

| Mode | What it does |
| --- | --- |
| Off | No background checks. |
| Notify | Checks for changes while Obsidian is open, planning exactly like Preview sync, and writes nothing. |
| Automatic | Does the same check, then applies the changes itself, as if you had read the preview and pressed Apply, with all your settings. |

### Notify

When something new is ready, a notice and a status bar item say how many changes. Clicking either opens a fresh Preview sync where you can read the changes and apply them. The same pending changes are announced once, and the status bar item clears when nothing is pending.

After three failed checks in a row, the status bar says the last check failed. Open Preview sync to see why. Mobile has no status bar, so only the notice appears, and the system may pause the timer in the background.

### Automatic

Use it only once you trust your setup. Set a **Sync log note** so you can see what each run wrote. Selecting Automatic without one shows a reminder. It includes Cancel vanished events if you turned that on.

- It never applies a plan blocked by a calendar error or an ambiguous Person.
- A plan of more than the **Automatic run limit** notes (default 25, 1 to 500) is left for you to review, and announced like Notify.
- If a note changed after the plan was made, the run tries again at the next interval without a message.
- Any other failure shows a notice, is written to the log, and counts towards the three-failure warning.

A manual Preview sync, Sync now and Sync on startup work as before.

## Sync log note

A vault path ending in `.md`. Blank by default. When set, Graft appends an entry after each Apply or Sync now that wrote notes or stopped with an error.

Each entry has:

- the time and how the run started,
- links to the Meeting notes it created or updated, with change counts, and to new Person and Series stubs,
- the number of warnings and skipped events,
- any error message.

Runs that change nothing are not logged. The newest 200 entries are kept, and feed addresses are never written. The note must be outside the Meeting, Person, Series and Company folders. A problem writing the log never stops a sync.

## Cancel vanished events

Off by default. With it off, a Meeting note whose event is missing from the feeds only gets a warning in the preview. The warning says when turning the setting on would mark the note.

When on, Graft sets the occurrence status property to the schema's cancelled value on a note that meets all of these:

- it belongs to a recurring event, so it has a recurrence ID,
- it is dated inside the sync window, whether that is in the past, today or the future,
- it belongs to one of your configured calendars,
- it is not already cancelled,
- either its event UID is still in the feeds for that window, so only this occurrence was dropped, or the UID is gone and at least two of its dates in the window are missing, so the whole series is gone.

Only the status of that occurrence note changes. The Series note is never touched, and handwritten text in the note is kept. A one-off event, an event without a UID, or a single missing date of a series that is also gone from the feeds only gets a warning.

Any date inside the sync window can be cancelled, and nothing outside it is touched. A feed that only publishes a short history can therefore cancel notes for days it no longer lists, so keep the window within what your feed covers. If you are unsure, leave this off.

Nothing changes when any feed failed to load. Notes are never deleted or moved. The change is listed in the preview like any other update. A missing event can be a feed or search artifact, so leave this off unless you want it.

## Company linking

Off on a new install, so a vault without Company notes sees no Company settings or warnings.

| Area | While it is off |
| --- | --- |
| Person stubs | No company property. |
| Company notes and attendee domains | Not read or matched. |
| Meeting notes | No Company links. An existing `companies` value is left as it is. |
| Preview | No unresolved-Company warnings. |
| Settings | Company folder, Company type, Company domain property, Person company property and Strict Company links are hidden. Their values are kept for when linking is turned on again. |

**Strict Company links** is shown when linking is on, and is on by default. It omits unresolved links from Meeting notes and warns in the preview. With it off, links from existing Person notes are kept.

## Note schema

The **Note schema (advanced)** section sets the note types, property names and headings Graft reads and writes, so it can work with a vault laid out differently from the defaults. Everything has a default, and most vaults change only a few names.

Property names cannot be empty (except where noted), contain colons, or repeat within one note type. An edit that would do either shows a message and is not saved.

| Group | What it sets |
| --- | --- |
| Presets | **Use minimal** is the default for new installs. **Use original** restores the schema of Graft's first design, for vaults that already follow it. A preset replaces every schema setting. |
| Note types | The property that holds the note type (`type`), and the value for Meeting, Person, Series and, with Company linking on, Company notes. |
| Meeting properties | See below. |
| Person, Series and Company properties | The email and aliases properties on Person notes. The company link property on Person notes and the domain on Company notes (both only with Company linking on). The name properties on new Person stubs. The event UID and title on Series notes. |
| Headings | See below. |
| Status and recurrence values | See below. |
| Empty agenda placeholder | See below. |
| Built-in Meeting body | Used when no Meeting template is set. |
| Extra Meeting properties | See below. |

### Meeting properties

Names for title, date, scheduled start and end, organizer, invited, series link, invited as, invite updated, event UID, recurrence ID, occurrence status and participants.

- Invite updated, occurrence status and participants can be left blank to skip them.
- Participants is blank by default, and the Original preset names it `participants`. When you name it, Graft writes it on new Meeting notes only, as a copy of the invited list, and never changes it on later syncs, so you can delete people who did not attend. The name must differ from your other Meeting properties, including extras.
- Date and event UID are also read from existing notes, so changing a name does not rename it in notes you already have.
- The Series event UID defaults to `ics_uid`. The original schema uses `google_recurring_event_id`.

### Headings

| Heading | Use |
| --- | --- |
| Invite agenda | The section Graft keeps up to date. |
| Series agenda | Used in new Meeting bodies. |
| Standing agenda | The heading Graft copies from Series notes. |

Use a Markdown heading such as `## Invite Agenda`. If an existing Meeting note has no invite agenda heading, its agenda is not updated and the preview warns about it. Add the heading to the note or to your Meeting template.

### Status and recurrence values

| Setting | Default | Notes |
| --- | --- | --- |
| Occurrence status | `Scheduled` | `Cancelled` is written when the calendar marks the occurrence cancelled. |
| Recurrence | `RegularSync` with a Series note, otherwise `OneOff` | This is the `{{recurrence}}` value. |

Each value must be non-empty, the two status values must differ, and so must the two recurrence values. Changing a value does not rewrite notes you already have.

An update sets the cancelled status only on an explicit cancellation. A live event leaves the existing status alone. A note marked cancelled, whether by the calendar or by Cancel vanished events, is not set back to scheduled if the event returns, because Graft cannot tell that status from one you set yourself. Change it back by hand.

### Empty agenda placeholder

The text written under the invite agenda heading when an invite has no description. The default is `No agenda provided`. Use `- ` if you prefer an empty bullet. A note that already holds the old default is not rewritten when you change this.

### Built-in Meeting body

`{{invite_section}}` is required. `{{series_section}}` adds the Series agenda when there is one.

### Extra Meeting properties

Additional properties written to new Meeting notes, each with a name and a value. Values can use these placeholders:

| Placeholder | Value |
| --- | --- |
| `{{title}}`, `{{date}}` | Event title and date. |
| `{{week}}`, `{{month}}`, `{{year}}`, `{{weekday}}` | Parts of the date. |
| `{{recurrence}}` | The series or one-off recurrence value. |
| `{{companies}}` | Company links. A value of exactly `{{companies}}` becomes a list. |

Write a list as `["a", "b"]`. **Update** refreshes the property on every sync. Other extras are written once and then left to you.

To link Companies in Meeting notes, turn on Company linking, add `companies` with the value `{{companies}}`, and turn on Update. With Company linking off, extras whose value is `{{companies}}` are not written.

## Where feed URLs are stored

A private feed URL works like a password for the calendar, so Graft keeps it out of the plugin's `data.json` when it can.

| Obsidian version | Where the URL lives |
| --- | --- |
| 1.11.4 and later | Obsidian's secret storage, under a name based on the calendar's id. `data.json` holds the id, name, type and Invited as, but no URL. |
| 1.4.10 to 1.11.3 | `data.json`, as plain text. There is no secret storage, and the Calendars section says so. |

On 1.11.4 and later:

- Settings, Preview sync and Sync now read the URL from secret storage.
- A URL found in plain text in `data.json`, for example one saved while secret storage was unavailable, is moved into secret storage the first time Graft loads, and removed from `data.json` at once.
- Removing a calendar clears its secret.
- If secret storage reports an error, Graft keeps the URL in `data.json` rather than lose it, and shows a notice.

Secret storage is local to the device and is not synced, while `data.json` can be. If the plugin settings reach a second device, its calendars show "No feed address on this device. Enter it again." Sync stops with the same message until you enter each URL there. Once you do, it is stored on that device only.

Keep feed URLs and real calendar data out of shared notes, screenshots, logs and vault copies. See [Troubleshooting](troubleshooting.md) for notices and the privacy note.
