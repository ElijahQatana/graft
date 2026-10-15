# Code layout

Graft is an Obsidian plugin written in TypeScript. Its sync pipeline is split into small modules:

- `src/ics/` fetches and normalizes calendar events.
- `src/filters/` applies title rules and the ignore list.
- `src/sync/` builds a plan without writing to the vault. It fetches each configured calendar in list order and keeps one copy of an event that appears in several.
- `src/match/` resolves existing Meeting, Person, Series, and Company notes.
- `src/generate/` and `src/templates/` prepare note content and updates.
- `src/config/` defines settings defaults, validation, and loading. `schema.ts` holds the note schema (types, property names, headings, extra Meeting properties) with its minimal and original presets; matchers, generators, and the preview read names from it instead of using literals. `secrets.ts` moves feed URLs between the settings and Obsidian's secret storage when it exists (Obsidian 1.11.4 and later); `main.ts` calls it on load and save.
- `src/preview/` builds a read-only preview from resolved plan inputs and displays it in a modal. It uses the same Meeting generators as the write helpers.
- `src/main.ts` handles commands, startup sync, and ordered settings saves; `src/settings.ts` provides the settings tab.

The intended flow is:

```text
ICS feeds -> parse -> filter -> plan -> resolve notes -> preview -> apply
```

`src/sync/flow.ts` resolves the filtered plan against note snapshots. Preview and Apply share those inputs. Apply checks snapshots and destination paths before writing, and repeat sync skips unchanged notes.

The preview shows new notes, field diffs, stubs, skips, and warnings. Calendar failures and ambiguous Person matches block Apply. Missing events are warnings, not inferred cancellations. Real-feed preview/apply comparison is pending.
