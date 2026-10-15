# Contributing

Start with an issue in a milestone and keep the change small. Link the issue from the pull request with `Closes #123`.

Use synthetic notes and calendar data, with domains such as `example.com`. Keep private feeds, personal information, credentials, and raw logs out of commits and shared output. Use a GitHub noreply email for commits.

Before committing, review the staged files and diff, then run:

```sh
Scripts/check-public-content.sh
git diff --cached --check
```

Run `npm run lint`, `npm test` and `npm run build` before opening a pull request. `npm run lint` checks the code against Obsidian's plugin guidelines. Say what changed and how you checked it. Mention anything that still needs testing in Obsidian.
