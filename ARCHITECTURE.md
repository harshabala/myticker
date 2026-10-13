# Architecture

MyTicker is a Manifest V3 Chrome extension with no build step and no runtime dependencies. Everything runs in the browser; there is no MyTicker server.

## Components

| File | Context | Responsibility |
|------|---------|----------------|
| `background.js` | Service worker (module) | Polls providers on a `chrome.alarms` alarm, merges quotes, writes state, handles messages from extension pages |
| `contentScript.js`, `contentShared.js` | Content script, all pages, top frame only | Renders the strip inside a closed Shadow DOM; reads state from storage; never reads page content |
| `popup.*`, `onboarding.js` | Extension page | P&L scoreboard and setup checklist |
| `options.*`, `csvParser.js` | Extension page | Key vault, CSV import, settings, diagnostics copy button |
| `shared.js` | Shared | Storage keys, settings migration, P&L maths, freshness and activation rules |
| `priceProviders.js` | Service worker | Yahoo, Finnhub, CoinGecko and Binance fetchers and response parsers |
| `vault.js` | Extension contexts | AES-GCM vault for the optional Finnhub key (PBKDF2-SHA-256) |
| `metrics.js` | Extension contexts | Local-only counters (`pts_metrics`) |

## Data flow

1. The user imports a CSV in Options. `csvParser.js` validates it (size, row, column and holding caps) and holdings land in `chrome.storage.local` (`pts_holdings`).
2. An alarm wakes `background.js`. It reads holdings, asks `priceProviders.js` for quotes, and writes `pts_positions_state` and `pts_price_history` (last 15 minutes).
3. The content script, popup and options page read that state from storage and render it. They never call providers.

## Network boundary

Only `background.js` makes outbound requests, and only to the four hosts in `host_permissions`: `finnhub.io`, `query1.finance.yahoo.com`, `api.coingecko.com`, `data-api.binance.vision`. A test (`tests/network-boundary.test.mjs`) keeps the manifest hosts equal to the hosts the code contacts. Requests carry a ticker symbol or public crypto id, plus the Finnhub key for Finnhub only. No holdings, quantities or P&L leave the browser.

## Failure handling

- Every request has a 12 second timeout.
- HTTP 429 and 5xx pause that provider with exponential backoff (1 to 30 minutes, honouring `Retry-After`). The pause is persisted in `pts_provider_backoff`, so a restarted worker keeps it.
- Malformed responses and provider errors give partial results, never a failed refresh. Missing quotes are marked stale in the strip and popup.
- A 30 second cache avoids duplicate fetches. Malformed stored holdings are ignored rather than failing every refresh.
- Settings carry `pts_settings_schema_version` and are migrated on read.

## Storage

| Key | Area | Contents |
|-----|------|----------|
| `pts_holdings`, `pts_watchlist` | local | Imported holdings and crypto watchlist |
| `pts_finnhub_vault` | local | Encrypted Finnhub key record |
| `pts_positions_state`, `pts_price_history`, `pts_poll_health`, `pts_provider_backoff` | local | Derived state and provider health |
| `pts_metrics`, `pts_diagnostics_log` | local | Counts and dates only; bounded, allowlisted log with no symbols or amounts |
| `pts_settings`, `pts_settings_schema_version` | sync | Preferences only |
| Vault unlock material | session | Derived key for the current browser session; trusted extension contexts only |

Portfolio data is never written to `chrome.storage.sync`.

## Content script isolation

The strip lives in a closed Shadow DOM host with its own stylesheet (`ticker.css`, the only web-accessible resource), so page CSS cannot restyle it and it adds no globals to the page. It runs in the isolated world, in the top frame only, and reserves a fixed strip of layout space at `document_start` to avoid layout shift. See `docs/PRODUCTION_READINESS.md` for the verification status.

## Packaging

`npm run package` builds `dist/myticker-<version>.zip` deterministically from the files the manifest actually loads. See [RELEASING.md](RELEASING.md).
