# Troubleshooting

## Notices

Graft shows a short notice when a sync cannot start or stops. The preview window lists problems with individual events and calendars. None of the notices include your calendar addresses.

| Notice | What to do |
| --- | --- |
| Add a calendar in Graft settings. | Add at least one calendar in the Calendars section. |
| A Graft sync or preview is already open. | Close the open preview window first. Only one runs at a time. |
| The ignore list is not valid JSON. Fix the file or clear the ignore list setting. | Open the ignore-list file and fix the JSON, or clear the setting. See the ignore list format below. |
| The ignore list is not valid. Each ignored entry needs a uid and a recurrenceId, and may have a note. | Check each entry has `uid` and `recurrenceId` (use `null` for a whole event or series). |
| A template file set in Graft settings was not found. | Fix the Meeting, Person or Series template path, or clear it. Paths start at the vault root. |
| A planned note filename is not valid. | Change the Meeting filename pattern or a folder setting. |
| Two notes would get the same name, or a note with that name already exists. | Two events would produce the same filename, or a note with that name is already there. Add `{{date}}` to the filename pattern, or change the folders. |
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

### Filename conflicts

Filenames are made from the Meeting filename pattern, `{{title}} {{date}}` by default. Characters Obsidian does not allow are replaced with a hyphen, so two titles that differ only in those characters can collide. The note's title property keeps the original text. Person and Series files are named in the same way.

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
- The same event in an earlier calendar takes priority. The other copy is listed as skipped.
- An event you declined or have tentatively accepted is still included. Graft does not use RSVP status.

### Ambiguous Person match

Two or more Person notes share an email or alias with an attendee. Fix the duplicate and preview again. Apply stays unavailable until you do.

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

<!-- Storage: update this paragraph when GFT-042 changes where feed URLs are stored. -->
Graft currently stores the addresses as plain text in the plugin's `data.json`, in `.obsidian/plugins/graft/` inside your vault. The settings field masks them on screen, but the file itself is not encrypted. Anything that copies your vault, such as a sync service, a backup or a shared folder, also copies them. Storage may change in a later version.

Practical steps:

- Do not share your `.obsidian` folder or `data.json`, and keep them out of public repositories.
- Do not paste addresses into notes, screenshots, issues or logs.
- If an address leaks, reset or unpublish it in Google Calendar or Outlook, then add the new one in Graft.

Graft sends the address only to the calendar provider, to download the feed. It does not contact any other service.
