# Getting started

Graft is still in development. The core calendar parsing, filtering, matching, and note-generation modules are present, but the sync flow is not connected yet.

## Local development

Install the dependencies and run the checks:

```sh
npm install
npm test
npm run build
```

Use `npm run dev` to rebuild `main.js` while editing. To load the plugin in a development vault, place `manifest.json` and the generated `main.js` in `.obsidian/plugins/graft/`, then enable Graft in Obsidian.

The settings tab supports feeds, folders, templates, filters, and sync preferences. See [Configuration](configuration.md) for the available fields. Sync commands and end-to-end instructions will be added when the apply flow is connected.
