# Getting started

Graft is still in development. Preview and Apply are connected; testing against real Google and Outlook feeds is pending.

## Local development

Install the dependencies and run the checks:

```sh
npm install
npm test
npm run build
```

Use `npm run dev` to rebuild `main.js` while editing. To load the plugin in a development vault, place `manifest.json`, `styles.css`, and the generated `main.js` in `.obsidian/plugins/graft/`, then enable Graft in Obsidian.

Configure feeds and destination folders in Graft settings. See [Configuration](configuration.md) for the available fields.

1. Open the command palette and run **Graft: Preview sync**.
2. Expand the new notes and updates, then check skips and warnings. Preview writes nothing.
3. Click **Apply** to write the displayed plan, or **Close** to discard it.
4. Run Preview sync again to check the result.

Feed failures and ambiguous Person matches block Apply. Editing relevant vault files while a preview is open also requires a new preview. Apply can stop after partial writes if a vault operation fails; check the notes before trying again.
