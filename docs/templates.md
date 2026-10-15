# Custom templates

Graft writes a built-in body into every new note. If you want a different layout, point Graft at your own Markdown templates. You can set one each for Meeting, Person and Series notes in the folders and templates settings. A blank path uses the built-in body.

Templates only apply to notes Graft creates. Existing notes are never given a new body.

## Rules

- The path is relative to the vault root, for example `Templates/Meeting.md`. The file must exist when you run a sync, or the sync stops with a notice.
- Only the body of the template is used. If the template starts with frontmatter between `---` lines, Graft ignores it. Graft builds the note's properties itself, from the note schema settings.
- Placeholders look like `{{name}}`. Graft fills in the ones it knows and leaves any other `{{...}}` in the text exactly as written, so a typo is easy to spot in the preview.
- Templater is not run. Template tags such as `<% tp.date.now() %>` stay as plain text. Core Templates placeholders such as `{{date}}` are also read as Graft placeholders, so a template shared with another plugin may not give the result you expect.
- A list value, such as the invited people, is written as its items joined with a comma and a space.
- Placeholder names use the property names from your note schema settings. The names below are the defaults. If you rename a property, use the new name.

## Meeting templates

These placeholders are available in a Meeting template:

| Placeholder | Value |
| --- | --- |
| `{{title}}` | The event title. |
| `{{date}}` | The event date, in the sync timezone. |
| `{{scheduled_start}}`, `{{scheduled_end}}` | Start and end times. |
| `{{organizer}}` | A link to the organizer's Person note, or empty. |
| `{{invited}}` | Links to the invited people's Person notes. |
| `{{series}}` | A link to the Series note, or empty for a one-off event. |
| `{{invited_as}}` | The Invited as text of the calendar the event came from. |
| `{{invite_updated}}` | When the invite was last changed, if the calendar says. |
| `{{ics_uid}}`, `{{ics_recurrence_id}}` | The event's UID and, for a single occurrence of a series, its recurrence ID. |
| `{{occurrence_status}}` | `Scheduled`, or `Cancelled` if the calendar marks the event cancelled. |
| `{{type}}` | The note type value, `Meeting`. |
| `{{invite_agenda}}` | The event's description text, or the empty agenda placeholder (`No agenda provided` unless you changed it). |
| `{{series_agenda}}` | The standing agenda copied from the Series note, or empty. |

Any extra Meeting property you define in the note schema settings is also available by its name, for example `{{week}}` if you added a `week` property. An extra whose value is a list of Company links is joined with commas.

Keep the invite agenda heading in the template, followed by `{{invite_agenda}}`. Graft keeps that section up to date on later syncs. If an existing note has no such heading, the preview warns that its agenda will not be updated. The default heading is `## Invite Agenda`; you can change it in the headings settings.

Example:

```markdown
# Agenda
{{series_agenda}}

## Invite Agenda

{{invite_agenda}}

# Notes

Meeting with {{invited}} on {{date}}.
```

### Built-in Meeting body

When no Meeting template is set, Graft uses the body from the Built-in Meeting body setting. The default is:

```markdown
# Agenda
{{series_section}}{{invite_section}}


# Notes
```

`{{invite_section}}` is required. It becomes the invite agenda heading followed by the event description. `{{series_section}}` becomes the Series agenda heading followed by the standing agenda, and is empty when the event has no Series agenda. Those two placeholders belong to the built-in body setting and are not available in template files.

## Person templates

A Person template sets the body of a new Person stub. Without one, the stub has properties only. Available placeholders:

| Placeholder | Value |
| --- | --- |
| `{{type}}` | `Person`. |
| `{{full_name}}`, `{{first_name}}`, `{{last_name}}` | Taken from the attendee's name in the invite. With no name, the first name is the part of the email before the `@`. |
| `{{email}}` | The attendee's email address. |
| `{{company}}` | Company links, only when Company linking is on. |

## Series templates

A Series template sets the body of a new Series stub. Available placeholders:

| Placeholder | Value |
| --- | --- |
| `{{type}}` | `Series`. |
| `{{series_title}}` | The event title. |
| `{{ics_uid}}` | The recurring event's UID. |

Graft copies the content under the standing agenda heading of a Series note into new Meeting notes, so write your recurring agenda there. The default heading is `## Standing Agenda`.

## Filenames

The Meeting filename pattern is separate from the templates and has its own placeholders: `{{title}}` and `{{date}}`. See [Settings](configuration.md).

## Checking a template

Run **Graft: Preview sync** and open a new note in the preview. It shows the body Graft will write, so you can check the placeholders before anything is created. See [Getting started](getting-started.md).

## How the Series agenda and the invite agenda combine

A recurring occurrence can carry two agendas, and Graft keeps them in separate sections:

- **Standing Agenda** is the text you write under the standing agenda heading of the Series note. A new Meeting note gets a copy under the Series agenda heading (or in `{{series_agenda}}`). Graft never writes to the Series note, and it never touches the copy again after the note is created, so edit it in the Meeting note freely.
- **Invite agenda** is the event's description. It goes under the invite agenda heading, below the Series agenda. When an occurrence has no description of its own, that section holds the empty agenda placeholder.

Later syncs rewrite only the invite agenda section, and only when the description changed. A section holding the placeholder stays as it is when the invite is still empty, even if you changed the placeholder setting since. Every other section, including the copied Standing Agenda, is yours.
