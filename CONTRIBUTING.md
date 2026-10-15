# Contributing

Start with an issue in a milestone and keep the change small. Link the issue from the pull request with `Closes #123`.

Use synthetic notes and calendar data, with domains such as `example.com`. Keep private feeds, personal information, credentials, and raw logs out of commits and shared output. Use a GitHub noreply email for commits.

Before committing, review the staged files and diff, then run:

```sh
Scripts/check-public-content.sh
git diff --cached --check
```

Run `npm run lint`, `npm test` and `npm run build` before opening a pull request. `npm run lint` checks the code against Obsidian's plugin guidelines. Say what changed and how you checked it. Mention anything that still needs testing in Obsidian.

## Continuous integration

The CI workflow (`.github/workflows/ci.yml`) runs lint, tests and the build on Node 22. For now it only runs when started by hand from the Actions tab, to save Actions minutes. The `pull_request` and push-to-`main` triggers are written in a comment at the top of the file; uncomment them when you want CI on every change.

## Cutting a release

Releases are made from `main` once it is green. Tags are bare versions with no `v` prefix, such as `0.1.0`.

1. Run `npm version <new version>` (for example `npm version 0.2.0`). It updates `package.json` and `package-lock.json`, copies the version into `manifest.json` and `versions.json` (using the `minAppVersion` already in `manifest.json`), commits the change and creates the tag.
2. Push the commit, then review it.
3. Push the tag with `git push origin <new version>`. This is deliberate: the release workflow (`.github/workflows/release.yml`) starts on any pushed tag that looks like a version, so nothing is released until you push one.

The workflow stops if the tag differs from the version in `manifest.json` or has no entry in `versions.json`. Otherwise it runs lint, tests and the build, then publishes a GitHub release with generated notes and `main.js`, `manifest.json` and `styles.css` attached.
