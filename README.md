# Graft

*One schedule, grafted into the notes you already keep.*

Graft is an Obsidian plugin that reads two calendars, a Google Calendar and an Outlook or Microsoft 365 calendar, and syncs them into notes matching a schema you already use by hand. It never writes back to either calendar. Read-only, one direction, always.

## The shape of it

- **Feeds** are the calendar sources: a Google Calendar and an Outlook/Microsoft 365 calendar, each read from its own private ICS address. No OAuth, no client secret, no external service.
- **Filters** decide what never becomes a note: an exact-match convention for your own calendar blocks, and a plain, manually-maintained ignore list for everything else.
- **Meetings** are one note per dated occurrence, keyed on the event's ICS `UID` (and `RECURRENCE-ID` for a single modified instance of a recurring series), so a reschedule or retitle updates the existing note instead of duplicating it.
- **Series** are the recurring-meeting definitions a Meeting note can link back to. A Series can also carry a standing agenda that new occurrences pick up automatically when they're created.
- **People** and **Companies** are the entity notes Graft matches calendar attendees against. An unmatched attendee gets a minimal stub note, never a guess at their title or department.

## Scope

What Graft does:
- Fetches both calendars on demand and parses their events.
- Filters out what you've told it to ignore, using the configured title rules and ignore list.
- Matches attendees and recurring series against your vault's existing notes.
- Creates or updates Meeting notes in place, preserving anything you've written by hand.
- Shows you a preview of what it would change before it writes anything.

What Graft doesn't do:
- Write, create, update, or delete anything on either calendar.
- Filter by RSVP or decline status.
- Automatically maintain the ignore list. Ignoring an event is always a deliberate, manual edit.
- Guess at Person or Company details beyond a minimal stub.

## Status

Private, pre-release. Work is tracked as GitHub issues against the milestones in this repo, starting with the M0 scaffold. Not yet on the Obsidian community plugin list.

## Development

Once the M0 scaffold lands:

```sh
npm install
npm run dev    # esbuild in watch mode
npm run build  # production build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.
