# Releasing

Maintainers only. Nothing here is automated, and nothing publishes to the Chrome Web Store.

1. Bump `version` in `manifest.json`, `package.json` and `package-lock.json`, and the README badge; add a dated CHANGELOG section. `npm run check:version` verifies they agree.
2. `npm ci && npm run verify && npm run audit:deps`.
3. `npm run package` writes `dist/myticker-<version>.zip` (deterministic; prints size and sha256). `dist/` is git-ignored.
4. Load the zip contents unpacked and smoke test: import `test_fixtures/sample_holdings_zerodha.csv`, confirm the strip and popup.
5. Capture screenshots (see `STORE_LISTING.md`), then upload the zip in the Chrome Web Store dashboard yourself.
6. Tag the release in git after the store accepts it.
