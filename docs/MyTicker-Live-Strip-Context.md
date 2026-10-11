# MyTicker — Live Price Strip: Full Context & Expected Behavior

**Audience:** Coding agents and engineers debugging “the strip is not showing.”  
**Product:** MyTicker Chrome MV3 extension  
**Repo (canonical):** `~/Documents/Projects/MyTicker`  
**Unpacked load path users often use:** `<local-path>` (rsync from repo)  
**Current version at write time:** `0.4.1`  
**Brand:** Obsidian Gold (`--accent: #d4c08a`)

This document describes **how the live strip is supposed to work in the product as implemented today**, how that compares to a common external “ticker strip blueprint,” why the strip often fails to appear, and what an agent should change or debug without rewriting architecture blindly.

---

## 1. What the user should see (product intent)

When MyTicker is **enabled** and has **at least one priced holding**, every normal web page (`http:` / `https:`) should show a **fixed bar at the very top of the viewport**:

| Region | Content |
| --- | --- |
| Left aggregate | Portfolio **day P&L** e.g. `Today +₹1,234.50 (0.82%)` — green up / red down / neutral flat |
| Optional stale chip | `⚠ Stale` if quotes have not refreshed successfully for a while |
| Right marquee | Scrolling (or static under reduced motion) **per-holding chips**: initials icon · display name · **5‑minute window P&L** amount + % |

**Visual specs (implemented in `ticker.css`):**

- Height: **28px** (not 40px)
- `position: fixed; top: 0; left: 0; right: 0`
- High z-index: `2147483000` (near max, intentionally below true `2147483647` only by a small margin)
- Semi-transparent bar + blur (dark/light via `prefers-color-scheme`)
- Host page body is pushed down by **~28px** (`margin-top`) so the strip does not permanently cover the site’s nav
- Enter animation: slide down + fade in (skipped if `prefers-reduced-motion`)
- Hover on bar: pause-friendly UX (items have hover highlight; scroll is continuous marquee)

**The strip is not the popup.** The popup is a temporary dropdown for holdings/P&L summary and toggles. The strip is ambient chrome on every page.

---

## 2. End-to-end data pipeline (as built — authoritative)

```
Broker CSV (options)
        │
        ▼
chrome.storage.local  key: pts_holdings
        │
        │  chrome.alarms "price-poll" (service worker)
        ▼
background.js  →  priceProviders.js
        │            ├─ Yahoo Finance for *.NS / *.BO (India, no API key)
        │            └─ Finnhub for US symbols + BINANCE:* crypto (optional key)
        ▼
merge snapshots → pts_price_history
compute P&L    → pts_positions_state   (local storage)
        │
        │  chrome.storage.onChanged  (NOT chrome.tabs.sendMessage)
        ▼
contentScript.js
        │  if pts_settings.enabled
        ▼
#pts-ticker-container on documentElement
        └── closed ShadowRoot
              ├── link → ticker.css (extension URL)
              └── .pts-ticker-bar  (aggregate + marquee items)
```

### 2.1 Components and Chrome contexts

| File | Context | Role |
| --- | --- | --- |
| `manifest.json` | Browser | MV3; `storage`, `alarms`; host permissions for Yahoo + Finnhub; content script on `<all_urls>`; `all_frames: false`; `options_page`; `action.default_popup` |
| `background.js` | Service worker (ephemeral) | Alarms, price poll, writes `pts_positions_state` / history / metrics |
| `priceProviders.js` | Service worker | Concurrent multi-provider quotes → unified array |
| `shared.js` | Shared module | `STORAGE_KEYS`, `DEFAULT_SETTINGS`, P&L math, activation predicate |
| `contentScript.js` | Page isolated world | Mounts strip, listens to **storage**, renders DOM inside **closed shadow** |
| `ticker.css` | Loaded into shadow via `chrome.runtime.getURL` | Strip-only styles (never inject `brand.css` into host pages) |
| `popup.html/js` | Extension page | Toggle `enabled`, open options, show holdings summary, trigger `poll-now` |
| `options.html/js` | Extension page | Import CSV, providers, appearance, tabs UI |

### 2.2 Storage keys that matter for the strip

| Key | Area | Meaning for strip |
| --- | --- | --- |
| `pts_settings` | **sync** | Must include `enabled: true` or strip is **removed** |
| `pts_holdings` | local | Imported positions; poll builds quotes from these |
| `pts_positions_state` | local | **Only payload the strip renders** (positions + aggregate P&L + optional stale) |
| `pts_price_history` | local | Snapshots for 5m / day P&L math |
| `pts_price_api_key` | local | Finnhub only; **not required** for pure India (Yahoo) |
| `pts_poll_health` | local | Failure counters for stale warning |

`DEFAULT_SETTINGS.enabled` is **`true`**. Users can turn the strip off via popup toggle or `Ctrl/⌘+Shift+Y`.

### 2.3 When the content script mounts the strip

From `contentScript.js` `init()`:

1. Read `chrome.storage.sync` → `pts_settings`
2. **If `settings.enabled` is truthy** → `ensureTickerContainer(false)`
3. Subscribe to `chrome.storage.onChanged`:
   - sync `pts_settings`: enable → mount; disable → `removeTickerContainer()`
   - local `pts_positions_state` → `renderTicker(state)`
4. On load, also read last `pts_positions_state` and render immediately (avoid empty flash after mount)

**Critical:** `renderTicker` **returns early if `tickerBar` is null.**  
So if the bar was never mounted (`enabled` false, or body not ready and path failed), **storage updates alone will not show a strip.** Mount is gated on `enabled`; data is gated on `positionsState`.

### 2.4 Shadow DOM mount details (defensive CSS)

Implemented (not open DOM):

```text
div#pts-ticker-container[data-myticker="1"]
  style: all:initial; position:fixed; top:0; left:0; width:0; height:0;
         overflow:visible; z-index:2147483000; pointer-events:none
  shadowRoot (mode: "closed")
    link[rel=stylesheet][href=chrome-extension://…/ticker.css]
    div.pts-ticker-bar  (pointer-events:auto)
```

Reasons:

- **Closed shadow** so host pages (and simple scrapers) cannot walk holdings DOM
- `all: initial` on host mount to avoid inheriting site CSS onto the container
- Styles come only from extension-packaged `ticker.css` (CSP-safe; no remote CSS)
- Host push-down: `document.body.style.marginTop` increased by **28px** with original top offset remembered in `data-pts-original-margin-top`

### 2.5 Rendering rules inside the bar

`renderTicker(state)`:

- If `!state?.positions?.length` → clear items; aggregate shows  
  **`No holdings — import CSV in Settings`**
- Else:
  - Aggregate: day P&L via `formatSignedCurrency` + day %
  - Each item: **5‑minute window P&L** (`window5mPnl` / `window5mPnlPct`), not last price text alone
  - Marquee: positions duplicated ×2 for seamless loop unless reduced motion → static horizontal list
  - Crypto items get `.pts-crypto`

There is **no** “show last traded price as primary text” mode in current UI; P&L is the product language.

### 2.6 Price poll (service worker)

`chrome.alarms` name: **`price-poll`**

- Created on install and on SW startup if missing
- Period from `settings.priceProviderConfig.refreshMinutes` (default **1** minute)
- On alarm → `handlePricePoll()`
- Early exit if `!settings.enabled`
- Early exit if no holdings after filters → sets `pts_positions_state` to **`null`** (strip can mount empty)
- Quotes: `getAllQuotes(symbols, { apiKey, baseUrl })`
  - **India:** Yahoo for `.NS` / `.BO`
  - **US/crypto:** Finnhub when key present
- Successful quotes → merge history → `computePositionsState` → write local storage
- Message API: `{ action: "poll-now" }` forces an immediate poll (popup/options use this)

**There is no `chrome.tabs.sendMessage` broadcast of prices.**  
The strip updates exclusively via **storage change events**. This is intentional for MV3 simplicity and survives SW sleep.

### 2.7 Activation (metrics, not strip visibility)

`isActivated` ≈  
`holdings_count >= 1 AND ticker_enabled AND ≥1 successful refresh`  
Finnhub key is **not** required for India-only activation.

---

## 3. External blueprint vs this codebase (do not “fix” blindly)

An external agent / blueprint often describes a classic MV3 ticker as:

| Blueprint claim | MyTicker reality |
| --- | --- |
| Content script listens to `chrome.runtime.onMessage` for price payloads | **No.** Listens to `chrome.storage.onChanged` on `pts_positions_state` |
| SW does `chrome.tabs.query` + `tabs.sendMessage` after fetch | **No.** SW only writes storage; tabs react themselves |
| Container height **40px**, full-width host div | Host is **0×0** mount; bar is **28px** inside shadow |
| Apply `margin-top: 40px !important` on `html`/`body` + MutationObserver for SPAs | Body margin **+28px**; original offset stored; **no MutationObserver** today |
| `host_permissions: <all_urls>` | **Restricted** to Yahoo + Finnhub hosts (content script still matches `<all_urls>`) |
| Finnhub-only or multi-API concurrent for all symbols | **Yahoo (India) + Finnhub (US/crypto)** split |
| Always inject strip | Only if **`pts_settings.enabled`** |

If another agent “makes the strip work like the blueprint,” they must either:

1. **Stay on the storage-driven design** (recommended — already production path), or  
2. **Add dual-path messaging** carefully without breaking storage consumers (popup also reads `pts_positions_state`).

Do **not** remove closed shadow or reintroduce open DOM that exposes holdings to the host page without an explicit product decision.

---

## 4. When the strip is *supposed* to appear (checklist)

All of the following must be true:

1. Extension is **loaded and enabled** in `chrome://extensions` (unpacked or store build).
2. User is on a **normal webpage** (`https://…` / `http://…`).  
   **Never injects** into: `chrome://*`, `chrome-extension://*`, Chrome Web Store, PDF viewer, some `file://` cases, DevTools, New Tab (depends on Chrome version/policies), iframes (`all_frames: false`).
3. **`pts_settings.enabled === true`** (popup “Show strip” / keyboard toggle).
4. Content script ran (`document_start` / module) without a hard error.
5. Prefer also: **holdings imported** and **at least one successful poll** so `pts_positions_state.positions.length > 0`.  
   Without positions, user may still see a thin bar with “No holdings…” **only if** the container was mounted and `renderTicker` ran with empty/null handling after parts exist.

### 4.1 Common reasons it is “definitely not showing”

| Symptom / cause | Where to look |
| --- | --- |
| Strip toggle off | Popup → strip toggle; or command `toggle-myticker`; inspect sync `pts_settings.enabled` |
| Never imported holdings | Options → Portfolio; local `pts_holdings` empty → poll clears state |
| Poll never succeeded | SW console; Yahoo/Finnhub network; alarm missing after SW death |
| Looking at chrome:// or extension pages | Open `https://example.com` or news site instead |
| Old Desktop folder not reloaded | Reload unpacked extension after rsync from repo |
| `enabled` true but bar opacity 0 | `.pts-ticker-visible` not applied; reduced-motion path; CSS failed to load from `web_accessible_resources` |
| `ticker.css` blocked | Manifest `web_accessible_resources` must include `ticker.css` for `<all_urls>` |
| Host site covers everything | Rare extreme z-index / fullscreen (fullscreen hide not fully blueprint-complete; check `fullscreenchange`) |
| SW not polling because disabled | `handlePricePoll` returns immediately if `!settings.enabled` |
| Only US symbols, no Finnhub key | Quotes empty → failures / stale / empty positions |
| Content script error on import | Module import failure in CS console — strip never inits |

### 4.2 Manual debug steps (agent or human)

1. Open `chrome://extensions` → MyTicker → **service worker** “Inspect”.  
   - Trigger: `chrome.runtime.sendMessage({ action: "poll-now" })` from popup or options.  
   - Watch errors from `handlePricePoll` / `getAllQuotes`.
2. On a normal tab → Inspect page → Console (content script context may need extension filter).  
   - Search DOM for `#pts-ticker-container`. If missing → enabled false or CS not running.
3. Application → Extension storage (or `chrome.storage` from SW):

```js
// Run in service worker console
chrome.storage.sync.get(null, console.log);
chrome.storage.local.get(null, console.log);
chrome.alarms.getAll(console.log);
```

Expect:

- `pts_settings.enabled === true`
- `pts_holdings` array length ≥ 1
- `pts_positions_state.positions` array length ≥ 1 after a good poll
- Alarm `price-poll` present

4. Confirm content script is listed for that tab under chrome://extensions → “Inspect views” / frame details if available.
5. Hard reload the tab after enabling the strip (storage listener should also remount without reload).

---

## 5. Intended UX states for the strip

| State | Bar visible? | Content |
| --- | --- | --- |
| First install, options open, no holdings yet | Only on web pages if enabled | Empty / no holdings message if mounted |
| Holdings imported, poll pending | Yes if enabled | May show empty or previous state until poll writes |
| Healthy live | Yes | Aggregate day P&L + scrolling chips with 5m P&L |
| Stale data | Yes | Amber `⚠ Stale` + last known numbers |
| User disables strip | No | Container removed; body margin restored |
| Fullscreen video | **Desired:** hide; **code today:** check if `fullscreenchange` listener exists — may be incomplete vs blueprint |

---

## 6. Market data (feeds into the strip, not the strip itself)

| Market | Provider | Key |
| --- | --- | --- |
| India NSE/BSE (`.NS`, `.BO`) | Yahoo Finance `query1` / `query2` | None |
| US equities | Finnhub | Optional free key in local `pts_price_api_key` |
| Crypto | Finnhub `BINANCE:…` | Same key + Optional tab |

The strip does **not** call APIs. Only the service worker does.

---

## 7. Message-passing that *does* exist

| Direction | Mechanism | Purpose |
| --- | --- | --- |
| Popup/options → SW | `chrome.runtime.sendMessage({ action: "poll-now" })` | Force refresh |
| SW → content script | **Indirect:** write `pts_positions_state` | Refresh strip |
| Settings → content script | sync `pts_settings` change | Mount/unmount + ticker speed CSS var |
| Keyboard | command `toggle-myticker` | Flip `enabled` in settings |

Blueprint-style **tab broadcast** is **not** required for correctness if storage listeners work on all content-script pages. Adding broadcast is optional optimization for same-tick multi-tab push; storage already fans out.

---

## 8. Security / product constraints agents must not violate

1. **No remote code** (MV3).
2. Bundle CSS/fonts locally; strip uses `ticker.css` via `web_accessible_resources`.
3. **Closed shadow** for holdings UI on host pages.
4. Do not put API keys in `sync` storage (canonical: local `pts_price_api_key`).
5. Do not log full holdings or keys.
6. Content scripts: **`all_frames: false`** so YouTube/ad iframes do not get nested tickers.
7. Do not inject `brand.css` / options styles into host pages.

---

## 9. Related UI (settings tabs) — out of strip scope but product context

Options page uses top **tabs**: Setup · Portfolio · Market data · Optional · Appearance · Tips.  
That is separate from the live strip. Deep links: `options.html#portfolio`, etc.  
Wizard steps should jump to the matching tab (portfolio / market).

---

## 10. Recommended agent work if strip is broken (priority order)

1. **Verify storage gates** (`enabled`, holdings, positionsState) before rewriting architecture.
2. **Verify content script injection** on a real `https` page and presence of `#pts-ticker-container`.
3. **Verify `ticker.css` loads** inside shadow (link href, web accessible).
4. **Verify alarm + poll** produce non-empty quotes for the user’s symbol set (India path without key).
5. Only then consider robustness features from the blueprint:
   - `MutationObserver` if SPA resets body margin
   - `fullscreenchange` hide
   - Optional `tabs.sendMessage` dual-path **in addition to** storage
   - Explicit empty-state bar always visible when enabled (even before first poll)
6. Avoid changing height/tokens casually without design pass; 28px + Obsidian Gold is intentional.

### Suggested “always show when enabled” hardening (if product wants it)

Today mount happens on enable, but empty state only paints if `renderTicker` runs with a bar. An agent could:

- On `ensureTickerContainer`, always call `renderTicker` with last state or a synthetic empty state so the bar is never a blank invisible failure.
- On enable, send `poll-now` so first paint is fast.
- Log once to SW if holdings exist but last poll returned zero quotes.

---

## 11. File map (strip-critical)

```
manifest.json          permissions, content_scripts, web_accessible_resources
background.js          alarms, handlePricePoll, toggle command
priceProviders.js      Yahoo + Finnhub quote fetch
shared.js              keys, settings defaults, P&L compute
contentScript.js       mount, shadow, storage listeners, render
ticker.css             strip visuals + marquee
popup.js               enabled toggle, poll-now, open options
options.js             import holdings → pts_holdings
```

---

## 12. One-paragraph summary for another agent

MyTicker’s live strip is a **28px fixed top bar** injected by a **content script** into a **closed Shadow DOM**, styled by extension-local **`ticker.css`**. It appears only when **`pts_settings.enabled`** is true on a normal web page. Prices are **not** pushed via `tabs.sendMessage`; the **service worker** polls on **`chrome.alarms`**, writes **`pts_positions_state`**, and the content script re-renders on **`storage.onChanged`**. India symbols price via **Yahoo without a key**; US/crypto need **Finnhub**. If the user cannot see the strip, debug **enable flag → page type → container mount → positionsState → poll/alarms** in that order before adopting a different blueprint architecture.

---

*Generated for handoff / second-agent review. Prefer the repo over this doc if they diverge after further commits.*
