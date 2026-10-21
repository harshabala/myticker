# Contributing

Thanks for helping. MyTicker has no build step and no runtime dependencies; dev tools (ESLint) are the only npm packages.

## Setup

```bash
nvm use            # or any Node >= 20.19 (.nvmrc pins the CI version)
npm ci
npm run verify     # syntax, lint, version consistency, sensitive-content scan, tests
```

Load the repo root as an unpacked extension at `chrome://extensions` to try changes.

For UI changes, also run the browser smoke test. It loads the unpacked extension in a headless Chromium-based browser with a throwaway profile and all outside hosts blocked, serves provider responses from `test_fixtures/providers/`, imports the sample Zerodha CSV through Settings, and checks Settings, the popup and the Ticker Tape on a local page: no uncaught errors, P&L rendered, no layout jump, no `[hidden]` element shown. Branded Google Chrome 137+ ignores `--load-extension`, so point `CHROME_PATH` at Chromium, Chrome for Testing or Brave:

```bash
CHROME_PATH="/Applications/Chromium.app/Contents/MacOS/Chromium" npm run smoke
```

It exits 0 with a skip message when no browser is found, so it is not part of `npm run verify`. Screenshots go to `SMOKE_OUT` (default: a temp folder).

## Rules

- Tests must never call real provider APIs; use `test_fixtures/providers/`.
- No telemetry and no new outbound hosts. Adding a host means updating `host_permissions`, `PRIVACY.md`, `STORE_LISTING.md` and the network-boundary test, and needs maintainer sign-off.
- Never mix INR and USD in totals; no FX conversion.
- Never log or commit keys, holdings, symbols with quantities, or personal paths. This repo is public. `npm run scan` checks tracked files.
- Keep the manifest version, `package.json`, the README badge and `CHANGELOG.md` in step (`npm run check:version`).
- Small, focused commits; add or update tests for behaviour changes.

## Pull requests

Run `npm run verify` and `npm run audit:deps` first, describe the user-visible change, and note any permission or privacy impact. Security issues: see [SECURITY.md](SECURITY.md) instead of opening an issue.
