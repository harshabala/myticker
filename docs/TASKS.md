# MyTicker — flow metrics tasks (MT-1 … MT-4)

Branch: `feat/flow-metrics-2026-07`  
Plan source: Desktop `MyTicker-task-list-plan.md`

| ID | Task | Status |
|----|------|--------|
| — | `fix(popup): define missing pts_watchlist storage key` | [x] Done |
| — | Foundation: `pts_metrics`, `ACTIVATION_EVENT`, `isActivated`, `recordActiveDay`, `metrics.js`, background wiring, tests | [x] Done |
| **MT-1** | Collapse setup to a single progress spine (popup + options, API → holdings → live) | [x] Done |
| **MT-2** | “Your day so far” scoreboard, top-3 movers, method + privacy copy, strip status | [x] Done |
| **MT-3** | Zerodha golden path + sample CSV + local import stats | [x] Done |
| **MT-4** | Privacy + market-data honesty footer; `PRIVACY.md` metrics row | [x] Done |
| — | README dual sections (Start here / For technical users) | [x] Done |
| — | Impeccable polish + critique fixes (a11y, quiet chrome, 5-min, typeset) | [x] Done |

## Activation definition

```
activated = api_ok AND holdings_count >= 1 AND ticker_enabled
            AND >= 1 successful price refresh
```

Constant: `ACTIVATION_EVENT = "myticker_activated"` in `shared.js`.

## Known limitation (resolved)

Watchlist-only symbols are now polled with holdings and crypto (`background.js` `handlePricePoll`); `tests/background-paths.test.mjs` covers it.

## Verify

```bash
npm run verify
CHROME_PATH=/path/to/chromium npm run smoke   # browser E2E, see CONTRIBUTING.md
```
