# Project Guidelines

## Architecture

- This repository is a Manifest V3 browser extension for hh.ru.
- Core runtime files are `content.js`, `content.css`, `background.js`, `popup.js`, `popup.html`, `letters.js`, and `manifest.json`.
- Gemini rewrite behavior depends on `prompts/gemini-rewrite.json`; keep prompt, model, and preset changes aligned with the UI and background worker behavior.
- Cross-browser packaging is built from the root manifest plus overrides in `manifests/` and emitted into `dist/chromium` and `dist/firefox`.

## Build And Verification

- For repository changes, run `npm run build:packages` after edits so `dist/chromium` and `dist/firefox` match the current source tree.
- If a task changes icons, also run `npm run build:icons` before the package build.
- Keep `manifest.json` version aligned with the intended release tag; `.github/workflows/release-zip.yml` validates this strictly.

## Conventions

- Prefer minimal, targeted changes and preserve the existing plain JavaScript style.
- Treat hh.ru selectors and DOM hooks as brittle integration points: add fallbacks instead of replacing working selectors aggressively.
- Update README or store docs when user-visible behavior or release workflow changes.

## Release Workflow

- Unless the user explicitly says otherwise, every repository change completes the full release cycle.
- Always use the full `X.Y.Z` semantic version format.
- Choose the bump type by change scope: `major` for breaking or behavior-changing releases, `minor` for backward-compatible features or visible capability expansions, and `patch` for fixes, polish, metadata-only updates, or other small backward-compatible changes.
- Choose a semantic version bump in `manifest.json`.
- Commit and push the change to `main`.
- Create and push the matching `vX.Y.Z` tag.
- Publish GitHub Release notes using `CHANGELOG_TEMPLATE.md` as the structure.
- Run the release workflow through `gh` when needed and verify that release assets are published.
