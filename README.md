# Graft

Graft is an Obsidian plugin that turns your calendar events into Meeting notes. It reads Google Calendar and Outlook or Microsoft 365 calendars through their private ICS feed addresses, then writes Meeting, Person and Series notes into your vault.

## Status

Graft is still in development. The settings tab, Preview sync, Sync now and Apply are all connected. Testing against real Google and Outlook feeds is still pending, so expect rough edges, and read every preview before you apply it.

## What it does

- Reads any number of Google and Outlook / Microsoft 365 calendars from their private ICS addresses.
- Creates one Meeting note per event and fills in the date, times, organizer, invitees and the invite's agenda text.
- Matches attendees to your existing Person notes by email, and creates a minimal Person note when there is no match.
- Links recurring events to a Series note, and creates a minimal Series note when there is none.
- Updates only the calendar fields of notes it already wrote. Anything you typed in a note stays as it is.
- Shows a read-only preview of every change before it writes anything.
- Skips events by title rule or by an ignore list you edit by hand, and can optionally skip events you have not accepted. It writes one note when the same event arrives from two calendars.
- Lets you point the plugin at your own property names, headings and note templates.

## What it does not do

- It never writes to your calendar. Access is read-only.
- It has no sign-in or OAuth. The private ICS address is the only credential. On Obsidian 1.11.4 and later, Graft keeps each address in Obsidian's secret storage on your device, not in the plugin's data file. See [Troubleshooting](docs/troubleshooting.md#privacy-and-feed-urls).
- It makes no AI or LLM calls. All filtering and matching is mechanical.
- It does not delete notes. If an event disappears from a feed, the preview shows a warning and the note stays.
- It does not filter by RSVP status unless you turn on **Only events I have accepted**, which is off by default. See [Configuration](docs/configuration.md).

## Quick start

1. Install Graft (see below) and turn it on under Settings, Community plugins.
2. Get a private ICS address from each calendar you want. [Getting started](docs/getting-started.md) shows where to find it in Google Calendar and in Outlook.
3. Open Settings, then Graft. Add each calendar with a name, its type and its ICS address.
4. Run **Graft: Preview sync** from the command palette. Read the preview. Nothing is written yet.
5. Select **Apply** if it looks right.

The full walk-through is in [Getting started](docs/getting-started.md).

## Install

Graft needs Obsidian 1.4.4 or later. The newest feature it uses before that is the frontmatter update API added in 1.4.4. Keeping feed addresses in secret storage needs 1.11.4; on older versions Graft still works and keeps them in the plugin's data file.

### From a release

No release is published yet. When one is, download `main.js`, `manifest.json` and `styles.css` from the release page and copy them as described in the next section.

### Manually

1. In your vault, create the folder `.obsidian/plugins/graft/`. It is a hidden folder, so use your file manager's option to show hidden files if you cannot see it.
2. Copy `main.js`, `manifest.json` and `styles.css` into it. To build `main.js` yourself, see Development below.
3. Restart Obsidian, or reload the plugin list, then enable Graft under Settings, Community plugins.

## Documentation

- [Getting started](docs/getting-started.md): a step-by-step first sync.
- [Settings](docs/configuration.md): every setting.
- [Custom templates](docs/templates.md): placeholders for Meeting, Person and Series templates.
- [Troubleshooting](docs/troubleshooting.md): notices, what they mean, and privacy of feed addresses.
- [Code layout](docs/technical/architecture.md)
- [Contributing](CONTRIBUTING.md)

## Development

You need Node.js and npm.

```sh
npm ci
npm test
npm run build
npm run dev
```

`npm run build` type-checks and writes a production `main.js` in the project root. `npm run dev` rebuilds it as you edit. To try a build, copy `main.js`, `manifest.json` and `styles.css` into `.obsidian/plugins/graft/` in a test vault and enable Graft. Use a test vault with made-up calendar data, not your real one.

## License

Graft is released under the [MIT License](LICENSE).
