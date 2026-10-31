# Troubleshooting

## Notices

Graft shows a short notice when a sync cannot start or stops. The preview window lists problems with individual events and calendars. None of the notices include your calendar addresses.

| Notice | What to do |
| --- | --- |
| No feed address on this device for the named calendars. | Open Graft settings and enter the address again. See [Privacy and feed URLs](#privacy-and-feed-urls). |
| Add a calendar in Graft settings. | Add at least one calendar in the Calendars section. |
| A Graft sync or preview is already open. | Close the open preview window first. Only one runs at a time. |
| The ignore list is not valid JSON. Fix the file or clear the ignore list setting. | Open the ignore-list file and fix the JSON, or clear the setting. See the ignore list format below. |
| The ignore list is not valid. Each ignored entry needs a uid and a recurrenceId, and may have a note. | Check each entry has `uid` and `recurrenceId` (use `null` for a whole event or series). |
| A template file set in Graft settings was not found. | Fix the Meeting, Person or Series template path, or clear it. Paths start at the vault root. |
| A planned note filename is not valid. | Change the Meeting filename pattern or a folder setting. |
| A note has the same path as a folder Graft needs to create. | Rename that note or change the folder settings. |
| More than one Meeting note has the same event UID. | Remove the duplicate from the Meeting folder. |
| More than one Series note matches the same event. | Remove the duplicate from the Series folder. |
| Two events from your calendars would update the same Meeting note. | Check that no calendar has been added twice. |
| A note in the configured folders has frontmatter that cannot be read. | Fix the properties of the note, then preview again. |
| The sync plan has errors, so nothing was written. | Run Preview sync and fix what it reports. |
| The vault changed. Run Preview sync again. | A note changed between the preview and Apply. Preview again and apply the new plan. |
| A planned note already exists. Run Preview sync again. | Same cause as above, usually a note created in the meantime. |
| A Meeting note is missing. Run Preview sync again. | A note was moved or deleted after the preview. Preview again. |
| Graft sync stopped. Check the vault and run Preview sync again. | A write failed. Some notes may already be written. Check them and preview again. |
| Graft could not prepare the sync. | A general failure. Check the calendar settings, folders, templates and ignore list. |
| Graft could not save settings. | Edit the setting again. |
| Graft could not read a feed address from secret storage. | Open Graft settings and check each calendar. Enter any address that is missing. |
| Graft could not use secret storage for a feed address. | The address stays in the plugin settings for now. Save the calendar again later. |
| Graft did not write the sync log, because it is inside a note folder. | Choose a sync log note outside the Meeting, Person, Series and Company folders. |
| Graft could not write the sync log. | The sync itself was not affected. Check that the sync log path is a valid note path. |
| Graft sync finished. | Nothing to do. The notes in the preview were written. |

### Filename conflicts

Filenames are made from the Meeting filename pattern, `{{title}} {{date}}` by default. Characters Obsidian does not allow are replaced with a hyphen, so two titles that differ only in those characters can collide. The note's title property keeps the original text. Person and Series files are named in the same way.

When a new note would take a name that another planned note or an existing note already has, Graft adds a number to the new one, such as `Standup 2026-10-04 2`. The preview shows the final names. Existing notes are never overwritten, and a repeat sync finds each note again by its event UID or email, so the numbers do not change.

### Frontmatter formatting after an update

When Graft updates a Meeting note it uses Obsidian's own frontmatter writer, so the values you wrote are kept but Obsidian may reformat the properties block. Comments inside the block, custom quote styles and blank lines between properties can be lost the first time a note is updated. The body outside the Invite Agenda section is not touched. If you keep comments in Meeting frontmatter, move them into the note body.

### Calendar errors in the preview

A calendar error means that calendar could not be fetched or understood. The preview names the calendar and Apply is unavailable. Check that:

- you copied the whole address, and the type matches,
- the address is the ICS one, and not the HTML or "view" link,
- the calendar is still published or shared, and the secret address has not been reset,
- you are online.

Google and Outlook both let you reset or unpublish an address. After a reset, paste the new address into the calendar's row and save it.

### Events missing from the preview

- The sync window only covers the days set in Days back and Days ahead, in the chosen timezone.
- The event may be skipped by a title rule or the ignore list. Skipped events are listed.
- The same event in an earlier calendar takes priority. The other copy is listed as skipped, and so is a copy dropped by **Merge duplicates across calendars**.
- Unless **Only events I have accepted** is on, an event you declined or have tentatively accepted is still included. With it on, such events are listed as skipped with the reason.

### Duplicates from calendar mirroring

If a tool copies events between your calendars, one meeting can reach Graft several times with different IDs: as plain `Busy` blocks and as copies with full details. That gives Meeting notes titled Busy and two notes for one meeting. To clean it up:

1. Add a title skip rule of type **exact** with the value `Busy`. Add another for any other placeholder title.
2. Turn on **Merge duplicates across calendars** and put the calendar whose details you prefer first in the Calendars list.
3. If the copies in one calendar show as declined, turn on **Only events I have accepted** and set that calendar's Invited as value.

Check the preview: the dropped events are under **Skipped events** with their reasons. Notes written before you changed these settings are not removed, so delete any leftover Busy notes by hand. See [Filters](configuration.md#filters).

### A note stays cancelled

Graft sets the occurrence status to cancelled when the calendar marks an event cancelled, or when Cancel vanished events is on and an occurrence inside the sync window, past or future, has dropped out of the feeds, or a whole series has. It never sets the status back, because it cannot tell that value from one you chose, for example for a meeting you skipped. If an event returns, change the status back by hand.

### Ambiguous Person match

Two or more Person notes share an email or alias with an attendee. Fix the duplicate and preview again. Apply stays unavailable until you do.

### Possible duplicate Person

A new Person stub would be created, but an existing Person note has the same name (compared by full name or note name, ignoring case). This usually means the person has a second email address. If they are the same person, add the new address to the existing note's email aliases and preview again. The warning does not block Apply, and Graft never merges notes for you. If they are different people, ignore it.

## Ignore list format

The ignore list is an optional JSON file in your vault, chosen in the filters settings. You edit it by hand. Deleting a note does not add it to the list.

```json
{
  "ignored": [
    { "uid": "abc123@example.com", "recurrenceId": null, "note": "Standing lunch" },
    { "uid": "def456@example.com", "recurrenceId": "20260115T100000Z" }
  ]
}
```

An entry with `"recurrenceId": null` skips the whole event or series. An entry with a recurrence ID skips only that occurrence. The `note` is optional and is shown as the skip reason. A blank or missing file ignores nothing. The values come from the event's `UID` and `RECURRENCE-ID` lines in the ICS feed.

## Privacy and feed URLs

The private ICS address gives read access to a whole calendar to anyone who has it.

On Obsidian 1.11.4 and later, Graft keeps each address in Obsidian's secret storage on your device. The plugin's `data.json` holds only the calendar's name, type and identity, not the address. Secret storage is not synced, so on a second device a calendar shows "No feed address on this device. Enter it again." until you paste the address there.

On older Obsidian there is no secret storage, so the addresses stay in `data.json` as plain text, in `.obsidian/plugins/graft/` inside your vault. The settings field masks them on screen, but the file is not encrypted, and anything that copies your vault, such as a sync service, a backup or a shared folder, copies them too. The Calendars section says which case applies. If secret storage reports an error, Graft keeps the address in `data.json` instead of losing it, and shows a notice.

Practical steps:

- Do not share your `.obsidian` folder or `data.json`, and keep them out of public repositories.
- Do not paste addresses into notes, screenshots, issues or logs.
- If an address leaks, reset or unpublish it in Google Calendar or Outlook, then add the new one in Graft.

Use an https:// address. Graft accepts http:// for feeds you host yourself and shows a warning, but the address, which works like a password, then travels unencrypted.

Graft sends the address only to the calendar provider, to download the feed. It does not contact any other service.
