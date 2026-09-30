# Getting started

Graft is still in development. The core calendar parsing, filtering, matching, and note-generation modules are present, but the full settings and sync flow are not connected yet.

## Local development

Install the dependencies and run the checks:

```sh
npm install
npm test
npm run build
```

Use `npm run dev` to rebuild `main.js` while editing. To load the plugin in a development vault, place `manifest.json` and the generated `main.js` in `.obsidian/plugins/graft/`, then enable Graft in Obsidian.

The current plugin UI contains a placeholder settings tab. Feed setup and end-to-end sync instructions will be added when those features are wired into the plugin.
