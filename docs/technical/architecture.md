# Architecture

Graft is an Obsidian plugin written in TypeScript. Its sync pipeline is split into small modules:

- `src/ics/` fetches and normalizes calendar events.
- `src/filters/` applies title rules and the ignore list.
- `src/sync/` builds a plan without writing to the vault.
- `src/match/` resolves existing Meeting, Person, Series, and Company notes.
- `src/generate/` and `src/templates/` prepare note content and updates.
- `src/main.ts` and `src/settings.ts` contain the current Obsidian integration shell.

The intended flow is:

```text
ICS feeds -> parse -> filter -> plan -> resolve notes -> preview -> apply
```

Calendar access is one-way. The plugin reads calendar feeds and writes only to the configured Obsidian vault.
