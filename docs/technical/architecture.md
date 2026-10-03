# Code layout

Graft is an Obsidian plugin written in TypeScript. Its sync pipeline is split into small modules:

- `src/ics/` fetches and normalizes calendar events.
- `src/filters/` applies title rules and the ignore list.
- `src/sync/` builds a plan without writing to the vault.
- `src/match/` resolves existing Meeting, Person, Series, and Company notes.
- `src/generate/` and `src/templates/` prepare note content and updates.
- `src/config/` defines settings defaults, validation, and loading.
- `src/main.ts` handles plugin loading and ordered settings saves; `src/settings.ts` provides the settings tab. Sync commands are not connected yet.

The intended flow is:

```text
ICS feeds -> parse -> filter -> plan -> resolve notes -> preview -> apply
```

The helpers read calendar feeds and prepare vault note changes. The plugin UI does not run this flow yet.
