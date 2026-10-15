# Getting started

This guide takes you from a fresh install to a first sync. Graft is still in development and has not yet been tested against real Google and Outlook feeds, so use a test vault first if you can, and read each preview before applying it.

You need Graft installed and enabled. See the [README](../README.md#install).

## 1. Get a private ICS address

Graft reads a calendar through a private web address that ends in `.ics`. Anyone who has that address can read the whole calendar, so treat it like a password. Do not paste it into notes, screenshots or chats.

### Google Calendar

1. Open Google Calendar on the web, not in the phone app.
2. In the left sidebar, hover over the calendar you want, select the three dots, then **Settings and sharing**. If the calendar list is hidden, open the main menu first.
3. Scroll to **Integrate calendar**.
4. Copy the **Secret address in iCal format**. It looks like `https://calendar.google.com/calendar/ical/.../basic.ics`.

If the secret address is missing, your Google Workspace administrator may have turned it off. Ask them, or use a personal calendar.

### Outlook and Microsoft 365

1. Open Outlook on the web.
2. Go to **Settings**, then **Calendar**, then **Shared calendars**.
3. Under **Publish a calendar**, choose the calendar and set the permission to **Can view all details**. Details are needed for attendees and agenda text. **Can view when I'm busy** gives titles and times only.
4. Select **Publish**.
5. Copy the **ICS** link, not the HTML link.

If there is no Publish option, your organization has probably turned it off. Only an administrator can change that.

Menu names change from time to time. Look for the words "ICS", "publish" or "secret address" if yours differ.

## 2. Add calendars in Graft

1. Open Settings, then Graft.
2. In the Calendars section, fill in the empty row at the bottom:
   - **Name:** a short label such as `Work`. It must be unique. The preview uses it to tell you which calendar had a problem.
   - **Type:** Google, or Outlook / Microsoft 365.
   - **ICS URL:** paste the address. The field is masked.
   - **Invited as:** how you are known on that calendar, for example `Work`. Graft writes this text to the `invited_as` property of each Meeting note from that calendar.
3. Select **Add calendar**. A message appears if the name is missing or taken, or if the address is not an HTTP or HTTPS URL. Nothing is saved until the row passes.
4. Repeat for each calendar. If one event shows up in several calendars, the one higher in the list wins, so order them with **Up** and **Down**.

Other settings save as you change them. [Settings](configuration.md) describes all of them.

## 3. Pick folders

Check where notes go. The defaults are `Meetings`, `People` and `Series`. Graft matches existing Person and Series notes in those folders and creates new notes there. Folders that do not exist yet are created when you apply.

If your vault uses other names, change them now. Change the note properties and headings under the advanced note schema settings only if your notes use different names from the defaults.

For a first sync, a small window is safest. The defaults are 7 days back and 30 days ahead. Lower both if you have many events.

## 4. Run Preview sync

1. Open the command palette and run **Graft: Preview sync**.
2. Wait a moment while Graft fetches the calendars and reads your note folders. A preview window opens.

Preview sync never writes anything. Closing the window discards the preview.

## 5. Read the preview

The top line counts what Graft plans, for example `3 new Meetings, 1 existing Meeting, 2 Person stubs, 1 Series stub, 0 skipped.` The sections below it appear only when they have something in them. Each section is collapsible, with its count in the heading. Sections with something to review start open; Unchanged Meeting notes and Skipped events start closed.

- **New Meeting notes:** notes Graft will create. Select one to see its properties and body. Check the filename, date and invited people.
- **Existing Meeting notes with changes** and **Unchanged Meeting notes:** notes that already match an event, found by the event's UID (and its recurrence ID for a single occurrence). Each shows its number of changes, with the old and new value of every field. A rescheduled or retitled event edits the existing note rather than making a second one. If nothing changed it says so.
- **New Person stubs and New Series stubs:** minimal notes for attendees and recurring events with no match. You can turn these off in the sync behavior settings.
- **Skipped events:** events Graft will not write, each with a reason. This includes events skipped by a title rule or the ignore list, and duplicates. When the same event is in two calendars, the copy from the lower calendar is listed here with the reason `Same event as one in` followed by the winning calendar. Duplicates are skipped even when you have no filters.
- **Warnings:** things to look at that do not block Apply. They include a Company link that could not be resolved, an event that is in a note but missing from the feed (this does not mean it was cancelled), and an existing note that lacks the invite agenda heading, so its agenda is not updated. An ambiguous Person match is also a warning, but it does block Apply.
- **Calendar errors:** a calendar could not be fetched or read. The preview is incomplete.

If there is nothing to do, the preview says `No note changes planned.`

### When Apply is unavailable

The **Apply** button is replaced by a message when the plan cannot safely be written. This happens when:

- a calendar could not be fetched or parsed, or
- an attendee matches more than one Person note.

For a calendar error, check the address and your connection, then preview again. For an ambiguous Person, open the notes named in the warning and remove the duplicate email or alias, then preview again.

## 6. Apply

Select **Apply** to write exactly what the preview shows. Graft does not fetch the calendars again. A notice says `Graft sync finished.` when it is done.

Before it writes, Graft checks that the notes it read have not changed. If you edited a relevant note while the preview was open, it stops and asks you to preview again. If a vault operation fails halfway, some notes may already be written. Check them, then run Preview sync again.

Run Preview sync once more afterwards. A repeat sync of unchanged events should show no changes.

## 7. Sync now and startup sync

**Graft: Sync now** fetches the calendars and applies the plan. While **Preview before apply** is on, which is the default, it opens the preview and waits for you to select Apply. With that setting off it writes straight away and shows only a notice. If the plan has errors, it opens the preview even with the setting off.

**Sync on startup** runs Sync now when Obsidian starts, and follows the same preview setting. It is off by default. Leave it off until you trust the results.

## Next

- [Custom templates](templates.md) to shape the body of new notes.
- [Settings](configuration.md) for filters, the sync window and the note schema.
- [Troubleshooting](troubleshooting.md) if you get a notice you do not understand.
