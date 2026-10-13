# AGENTS.md

MyTicker: Manifest V3 Chrome extension (ticker strip with local portfolio P&L). No build step, no runtime dependencies, Node 20.19+ (dev-only ESLint).

## Commands
- `npm run check` - syntax-check shipped scripts and verify manifest file references
- `npm test` - `node --test` over `tests/*.test.mjs` and `test_fixtures/test_*.mjs`
- `npm run lint` - ESLint; `npm run scan` - secret/personal-path scan (repo is public)
- `npm run verify` - check, lint, version consistency, scan, tests
- `npm run package` - build `dist/myticker-<version>.zip` (never publish)
- Docs: ARCHITECTURE.md, CONTRIBUTING.md, SECURITY.md, RELEASING.md

## Layout
- `background.js` service worker (polling, state); `contentScript.js` strip UI; `popup.*` scoreboard; `options.*` setup/import
- `shared.js` P&L and activation logic; `priceProviders.js`, `csvParser.js`, `vault.js`
- `tests/`, `test_fixtures/` (sample CSVs, provider response fixtures)

## Rules
- Tests must never call real provider APIs; use `test_fixtures/providers/`.
- Never mix INR and USD in totals; no FX conversion.
- No telemetry. Holdings and the API key stay in the browser; do not log or commit keys, holdings or personal paths.
- Docs: `PRIVACY.md`, `CHANGELOG.md`, `docs/TASKS.md`. Keep manifest version, README badge and CHANGELOG in step.
