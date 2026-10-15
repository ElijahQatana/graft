# Graft

A small Obsidian plugin for bringing Google and Outlook or Microsoft 365 calendar events into Meeting notes. It uses ICS feeds, with any number of calendars you add in settings, and keeps calendar access read-only. Feed URLs are private, so on Obsidian 1.11.4 and later they are kept in Obsidian's secret storage on your device rather than in the plugin's data file.

Still in development. The settings tab, Preview sync, Sync now, and Apply are connected. Testing against real Google and Outlook feeds is still pending.

The flow matches existing Person, Series, and Company notes, creates minimal Person and Series stubs when needed, and updates calendar fields while keeping handwritten notes.

## Development

```sh
npm install
npm test
npm run dev
npm run build
```

To try it locally, copy `main.js`, `manifest.json`, and `styles.css` into `.obsidian/plugins/graft/` in a test vault, then enable Graft.

- [Setup](docs/getting-started.md)
- [Settings](docs/configuration.md)
- [Code layout](docs/technical/architecture.md)
- [Contributing](CONTRIBUTING.md)
