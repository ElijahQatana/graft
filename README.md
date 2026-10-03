# Graft

A small Obsidian plugin for bringing Google and Outlook or Microsoft 365 calendar events into Meeting notes. It uses ICS feeds and keeps calendar access read-only.

Still in development. The settings tab, note helpers, and dry-run preview modal are in place. Preview and sync commands are not connected yet, so the plugin does not sync notes from the UI.

The planned flow matches existing Person, Series, and Company notes, creates minimal Person and Series stubs when needed, and updates calendar fields while keeping handwritten notes.

## Development

```sh
npm install
npm test
npm run dev
npm run build
```

To try it locally, copy `main.js` and `manifest.json` into `.obsidian/plugins/graft/` in a test vault, then enable Graft.

- [Setup](docs/getting-started.md)
- [Settings](docs/configuration.md)
- [Code layout](docs/technical/architecture.md)
- [Contributing](CONTRIBUTING.md)
