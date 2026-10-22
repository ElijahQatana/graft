# Code layout

Graft is an Obsidian plugin written in TypeScript. Its sync pipeline is split into small modules:

| Path | Role |
| --- | --- |
| `src/ics/` | Fetches and normalizes calendar events. |
| `src/filters/` | Applies title rules, the ignore list and the optional accepted-only RSVP filter. |
| `src/sync/` | Builds a plan without writing to the vault. Fetches each calendar in list order and keeps one copy of an event that appears in several. |
| `src/match/` | Resolves existing Meeting, Person, Series and Company notes. |
| `src/generate/`, `src/templates/` | Prepare note content and updates. |
| `src/config/` | Settings defaults, validation and loading. See below. |
| `src/preview/` | Builds a read-only preview from resolved plan inputs and shows it in a modal. Uses the same Meeting generators as the write helpers. |
| `src/main.ts` | Commands, startup sync and ordered settings saves. |
| `src/settings.ts` | The settings tab. |

Inside `src/config/`:

- `schema.ts` holds the note schema (types, property names, headings, extra Meeting properties) with its minimal and original presets. Matchers, generators and the preview read names from it instead of using literals.
- `secrets.ts` moves feed URLs between the settings and Obsidian's secret storage when it exists (Obsidian 1.11.4 and later). `main.ts` calls it on load and save.

The intended flow is:

```text
ICS feeds -> parse -> filter -> plan -> resolve notes -> preview -> apply
```

`src/sync/flow.ts` resolves the filtered plan against note snapshots. Preview and Apply share those inputs. Apply checks snapshots and destination paths before writing, and repeat sync skips unchanged notes.

The preview shows new notes, field diffs, stubs, skips, and warnings. Calendar failures and ambiguous Person matches block Apply. Missing events are warnings, not inferred cancellations, unless Cancel vanished events is on: then a future occurrence dropped from the feeds is marked cancelled, and only its status changes. Real-feed preview/apply comparison is pending.
