# Graft

A small Obsidian plugin for bringing Google and Outlook or Microsoft 365 calendar events into Meeting notes. It uses ICS feeds and keeps calendar access read-only.

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
