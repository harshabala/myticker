# MyTicker — Agent task list & implementation plan

> **Give this entire file to one agent (or one session). Work only on this product until ship criteria are met.**

| Field | Value |
|-------|--------|
| **Product** | MyTicker |
| **Priority** | P1 — strong secondary showcase |
| **GitHub** | https://github.com/harshabala/MyTicker |
| **Local clone (preferred)** | `~/Documents/Projects/MyTicker` |
| **If missing, clone to** | `~/Documents/Projects/MyTicker` via `gh repo clone harshabala/MyTicker` |
| **Default branch** | `main` |
| **Work branch** | `feat/flow-metrics-2026-07` (create from latest default if needed) |
| **Stack** | Chrome MV3 extension, vanilla JS, no package.json; tests via node test_fixtures |
| **Task IDs** | MT-1, MT-2, MT-3, MT-4 |
| **Fable plan status** | Complete Fable plan (100% included below) |
| **Work already done** | None of the flow-metrics code landed (0 commits on feat branch as of handoff) |

## Agent instructions (start here)

1. **Read this whole file** before editing.
2. **cd** to the local clone path above. If the path does not exist, clone the GitHub repo there.
3. `git fetch origin && git checkout -B feat/flow-metrics-2026-07 origin/main` (or continue existing feature branch if present).
4. Implement tasks in the **recommended commit sequence** at the bottom of the plan section.
5. After each commit: run the **verify commands** listed below.
6. Create/update **`docs/TASKS.md`** with every task ID and status.
7. Complete the **README dual-section rewrite**.
8. Run design + code + security self-review on the diff; fix critical/high issues.
9. Push branch and open a PR against `main`. Do **not** force-push. Do **not** merge unless the user asked for auto-merge.
10. Do **not** touch other portfolio repos in this session.

## What “done” means for this product

All task IDs listed above are implemented **or** explicitly documented as infeasible with a narrow alternative. Metrics are local-first, activation is a named constant, scoreboard is user-visible with method + privacy copy, README is dual-section, `docs/TASKS.md` is accurate, tests/build green, PR open.


## Global constraints (apply to ALL work)

Source: `<local-path>` and `<local-path>`.

1. **Local-first metrics** — counters/estimates on device or extension storage only. Nothing leaves unless user explicitly exports or opts in. **No cloud analytics in v1.**
2. **One activation event** — named constant in code (e.g. `ACTIVATION_EVENT = '...'`).
3. **User-visible scoreboard** on the natural success screen (ParseKit token-savings pattern), with **method + caveat microcopy**. Honest estimates; never fake precision.
4. **Privacy line on every stats surface:** e.g. *"Stored only on this device. Never uploaded."* (wording may adapt slightly per product).
5. **Zero-AI default** where relevant — core loop works without API keys; AI is optional upgrade.
6. **README rewrite required** in every repo (see below).
7. **`docs/TASKS.md`** committed checklist; update checkboxes as you finish task IDs.
8. **Ship path:** branch `feat/flow-metrics-2026-07` → push → open PR → (if user requested auto-merge and reviews pass) squash-merge to default branch and delete feature branch.

### README overhaul (mandatory for every product)

Rewrite `README.md` with **two top sections**:

#### Start here (novice)
Plain everyday words, zero jargon:
- What it is
- What problems it solves
- Step-by-step install and first use
- Edge cases and how to still use it when you hit them

#### For technical users
- Mermaid architecture diagram (GitHub-native render)
- How it works under the hood
- Metrics / activation definition
- Dev install, test commands, storage/privacy notes

### Ship checklist per repo

- [ ] All task IDs for this product implemented or honestly deferred with reason in PR
- [ ] `docs/TASKS.md` updated (checkboxes match reality)
- [ ] README novice + technical sections done
- [ ] Build/tests pass (commands in this file)
- [ ] Design pass (hierarchy, motion, empty states, reduced-motion)
- [ ] Code pass (edge cases, no regressions)
- [ ] Security pass (secrets, XSS, storage, permissions, no accidental egress)
- [ ] Branch pushed; PR opened with body mapping commits → task IDs → metrics
- [ ] Merge only if user wants auto-merge **or** explicitly asks

### Related docs (read if needed)

| File | Why |
|------|-----|
| `<local-path>` | Original product task specs + metrics definitions |
| `<local-path>` | Why these metrics matter (senior PM framing) |
| `<local-path>` | Multi-repo orchestration notes |
| `<local-path>` | What Fable completed (mostly plans only) |



## Work already completed

**None** for this initiative. Start from Fable plan + product spec. Create branch from `main`.

**Verify commands:**
```bash
node test_fixtures/test_shared.mjs
for f in background.js contentScript.js shared.js popup.js options.js onboarding.js csvParser.js priceProviders.js; do
  node --input-type=module --check < "$f" && echo "OK $f"
done
```

## Original product task spec

# P1 — MyTicker

## Product in one line

Chrome extension: live stock/crypto strip + portfolio P&L on every page.

## Current gap

Setup is the funnel. Until holdings are live, there is no product. Make **setup completion** and **daily glance** the whole game.

---

### Task MT-1 — Collapse setup to a single progress spine

| Field | Detail |
|-------|--------|
| **Flow change** | One checklist always visible in popup + options: (1) API connected ✓ (2) Holdings imported ✓ (3) Ticker live on a page ✓. Incomplete steps are primary CTAs; completed steps collapse. |
| **How it helps** | Activation = full checklist. No ambiguity. |
| **Metric: Activation** | `activated = api_ok AND holdings_count ≥ 1 AND ticker_enabled AND ≥1 successful price refresh` |
| **Privacy** | API key in extension storage only (already). Never log key. Holdings symbols only in local storage. |
| **Acceptance** | User always knows the next incomplete step. |

### Task MT-2 — First value: “Your day so far” after first successful refresh

| Field | Detail |
|-------|--------|
| **Flow change** | Immediately after first price pull: popup shows **Today’s P&L** (₹/%) big, top 3 movers, “Strip is on — open any tab.” |
| **How it helps** | Aha is money movement, not “settings saved.” |
| **Metric: Engagement** | Days with ≥1 price refresh while ticker enabled (local date stamps) |
| **Metric: User-visible** | Today P&L, 5-min P&L (already product features — surface as the scoreboard) |
| **Privacy** | Prices from Finnhub/etc.; portfolio math local. No upload of holdings. |
| **User understanding** | *“P&L uses your imported quantities × latest price. 5-min window is short-term move; Daily is since previous close (provider rules).”* One help link. |
| **Acceptance** | First success never lands on empty popup. |

### Task MT-3 — Broker import: one golden path + honest others

| Field | Detail |
|-------|--------|
| **Flow change** | Lead with **one** broker (recommend Zerodha *or* Groww based on your strongest parser). Others under “More formats.” Sample CSV download for the golden path. |
| **How it helps** | Setup completion rate; fewer support failures. |
| **Metric** | `import_success_rate` by preset (local) |
| **Acceptance** | Golden path succeeds on sample file in one try. |

### Task MT-4 — Privacy + market-data honesty

| Field | Detail |
|-------|--------|
| **Flow change** | Settings footer: *“Holdings and keys stay in this browser. Prices come from [provider]; we don’t send your portfolio to our servers (we don’t have servers).”* |
| **How it helps** | Trust for finance-adjacent tools. |
| **Acceptance** | Visible on options page. |

**MyTicker north star (for you):** % installs that reach activated in 24h.  
**User-facing north star:** Today’s P&L (and strip always-on).

---

## Full Fable implementation plan (100%)

# MyTicker — Implementation Plan (MT-1 … MT-4)

**Repo:** `scratchpad/portfolio/MyTicker` · **Branch:** `feat/flow-metrics-2026-07` · **Default branch:** `main`
**Stack:** Chrome extension MV3, vanilla ES modules. No bundler, no package.json.
**Verified build/test commands:**

```bash
# Unit tests (pure P&L engine) — verified: 40 passed, 0 failed
node test_fixtures/test_shared.mjs

# Syntax check every ES module (verified: all OK)
for f in background.js contentScript.js shared.js popup.js options.js onboarding.js csvParser.js priceProviders.js; do
  node --input-type=module --check < "$f" && echo "OK $f"
done
```

Manual E2E: `chrome://extensions` → Developer Mode → Load unpacked → repo root.

---

## Repo orientation (what exists, don't rewrite)

| File | Role |
|---|---|
| `shared.js` | Pure module: `STORAGE_KEYS` (all keys prefixed `pts_`), `DEFAULT_SETTINGS`, P&L engine (`computePositionsState`, `mergePriceSnapshots`), formatters. Imported by everything **and by the node test suite** — pure logic goes here. |
| `background.js` | MV3 service worker. `handlePricePoll()` polls Finnhub via alarm `price-poll`, writes `pts_price_history` + `pts_positions_state`, tracks poll health in `pts_poll_health` (`consecutiveFailures`, `lastSuccessfulFetch`). |
| `onboarding.js` | `getSetupStatus()` (hasApiKey / hasHoldings / hasLiveData / complete / wizardStep), `setOnboarding(patch)` on `pts_onboarding`, `markWizardStep`, `completeSetup`. |
| `popup.js` / `popup.html` | View-machine popup (`checklist` / `loading` / `pnl` / `empty`), renders Today's P&L, top movers (currently best+worst only), watchlist. Styles inline in popup.html. |
| `options.js` / `options.html` | Settings page: Setup Status pills + 3-step wizard (`1. API key`, `2. Import CSV`, `3. Go live`), CSV drag-drop import with broker auto-detect, connection tests, toast + error log. Styles inline in options.html. `page-footer` div at bottom. |
| `csvParser.js` | `BROKER_PRESETS` (generic/zerodha/groww/upstox), `parseCsv`, `mapRowsToHoldings`, `diagnoseCsvImport`. Zerodha is the strongest preset (has `defaults`, auto `.NS` suffix, dedicated diagnostics, sample fixture). |
| `test_fixtures/` | `test_shared.mjs` (node test runner, no Chrome APIs), `sample_holdings_zerodha.csv`, `sample_holdings_generic.csv`. |
| `myticker-v0.2.0-browser-test/` | Stale snapshot copy — **do not touch**. |

Loose storage keys outside `STORAGE_KEYS`: `pts_price_api_key` (local, canonical API key), `pts_setup_shimmered`.

### Pre-existing bug that blocks MT-2 (fix first)

`popup.js` references `STORAGE_KEYS.watchlist`, which **does not exist** in `shared.js`. `chrome.storage.local.get([STORAGE_KEYS.positionsState, STORAGE_KEYS.watchlist])` passes `undefined` in the keys array, which Chrome's argument validation rejects — `refreshPopup` throws and the popup can hang on "Loading…". Minimal fix (ship as its own commit before MT-2): add `watchlist: "pts_watchlist"` to `STORAGE_KEYS` in `shared.js`. (Separately, `background.js` never fetches watchlist quotes, so `state.watchlist` prices never populate — out of scope for this plan; noted honestly rather than faked.)

---

## Cross-cutting foundation (one commit, used by all four tasks)

### New storage key + schema — `pts_metrics` (chrome.storage.local)

Add to `STORAGE_KEYS` in `shared.js`: `metrics: "pts_metrics"`.

```js
{
  activatedAt: number | null,    // ms epoch when isActivated() first became true
  firstRefreshAt: number | null, // ms epoch of first successful quote fetch
  activeDays: string[],          // local "YYYY-MM-DD" dates with ≥1 successful refresh
                                 // while ticker enabled; capped at last 400 entries
  imports: {                     // MT-3: import outcomes per broker preset
    [presetKey]: { success: number, fail: number }
  }
}
```

Local-only. No symbols, no quantities, no prices, no URLs — dates and counts only. Nothing is ever transmitted.

### The ONE activation event — named constant in `shared.js` (pure, node-testable)

```js
/**
 * MT-1: MyTicker's single activation event.
 * activated = api_ok AND holdings_count >= 1 AND ticker_enabled
 *             AND >= 1 successful price refresh
 */
const ACTIVATION_EVENT = "myticker_activated";

function isActivated({ hasApiKey, holdingsCount, tickerEnabled, hasSuccessfulRefresh }) {
  return !!(hasApiKey && holdingsCount >= 1 && tickerEnabled && hasSuccessfulRefresh);
}
```

Also add pure helper `recordActiveDay(activeDays, now)` (returns new array, dedupes today's `YYYY-MM-DD`, caps at 400) to `shared.js`, and export all three.

### New file: `metrics.js` (mirrors `onboarding.js` style — thin chrome.storage wrapper)

```js
// Local-first metrics. Counts and dates only — never uploaded, no telemetry.
import { STORAGE_KEYS, recordActiveDay } from "./shared.js";

export async function getMetrics() { /* local.get → merged with defaults */ }
export async function updateMetrics(patch) { /* read-modify-write pts_metrics */ }
export async function recordSuccessfulRefresh(now) { /* firstRefreshAt ??= now; activeDays = recordActiveDay(...) */ }
export async function markActivated(now) { /* activatedAt ??= now */ }
export async function recordImportResult(presetKey, ok) { /* imports[presetKey].success/fail += 1 */ }
```

### Wire into `background.js`

In `handlePricePoll()`, inside the existing `if (quotes.length > 0)` success branch (settings already known to be `enabled` at that point): `await recordSuccessfulRefresh(now)`, then compute activation via `getSetupStatus()`-equivalent facts already in hand (apiKey present, `baseHoldings.length`, `settings.enabled`, success) and call `markActivated(now)` when `isActivated(...)` is true. Single writer = the worker; popup/options only read.

### Extend `onboarding.js` `getSetupStatus()`

Return additionally: `tickerEnabled` (from `settings.enabled`), `hasSuccessfulRefresh` (`pollHealth.lastSuccessfulFetch > 0`), and `activated: isActivated({...})`. Keep `complete` as-is for backward compatibility with existing UI code.

### Tests

Extend `test_fixtures/test_shared.mjs` with sections for `isActivated` (all four conjuncts flip the result) and `recordActiveDay` (dedupe, ordering, 400-cap). Run `node test_fixtures/test_shared.mjs`.

**Commit:** `feat(metrics): local-first pts_metrics store + isActivated activation constant`

---

## MT-1 — Collapse setup to a single progress spine

**Goal:** one checklist, same order, always visible in popup + options: (1) API connected (2) Holdings imported (3) Ticker live on a page. Incomplete steps are primary CTAs; completed steps collapse.

### Files to modify

**`popup.js`** — `renderSetupChecklist()` / `updateChecklistInPlace()`:
- Reorder steps to match the spec and the options wizard (currently popup shows CSV first, API second — options shows API first; unify on API → CSV → live):
  1. label **"Connect price data"**, hint *"Free Finnhub key — paste it in Settings"*
  2. label **"Import your holdings"**, hint *"Drop your Zerodha CSV (more formats supported)"*
  3. label **"See it live on any tab"**, hint *"Ticker strip + today's P&L appear automatically"*
- `updateChecklistInPlace` steps array becomes `[status.hasApiKey, status.hasHoldings, status.hasLiveData]` (order swap to match).
- **Incomplete steps are CTAs:** make each incomplete `.checklist-item` a `<button class="checklist-item">` that calls `markWizardStep(n)` (already imported module) then `chrome.runtime.openOptionsPage()`. Completed rows stay inert `<div>`s.
- **Completed steps collapse:** rely on CSS (below) — `.checklist-item.done .check-hint { display: none; }` and reduced padding.
- CTA button copy is the *next* incomplete step: `"Next: Connect price data →"` / `"Next: Import your holdings →"` / `"Next: Open any tab to go live →"` (replaces the current `"Start setup →"`/`"Continue setup in Settings →"` binary).

**`popup.html`** (inline `<style>`): add `.checklist-item.done` collapsed styles; button-reset styles for clickable checklist rows (keep Obsidian Gold restraint — no new colors).

**`options.js`** — `refreshSetupUI()`:
- Already computes `step = hasApiKey ? (hasHoldings ? 3 : 2) : 1` — keep. Add: set `wizardHintEl` to a "Next:" phrasing and give the active `.wizard-step` button the primary accent (CSS class `is-next`).
- When `status.activated` (new field), show the existing `setup-complete-shimmer` path; the completed wizard row collapses via existing `done` class + new CSS `.wizard-step.done { opacity: .55; }`.

**`options.html`**: minor CSS for `.wizard-step.is-next` emphasis and `.wizard-step.done` de-emphasis. No structural changes.

### Activation metric

Definition lives in `shared.js` (`isActivated`, doc-commented with the spec formula — see foundation section). Recorded once into `pts_metrics.activatedAt` by `background.js`. Note the old `status.complete` (api+holdings+live data) is *not* the activation event — activation additionally requires `settings.enabled`.

### Privacy

No new data classes. API key stays in `chrome.storage.local` (`pts_price_api_key`), never logged; holdings symbols stay local (already true).

### Acceptance verification

- Fresh profile → load unpacked → popup shows 3-step checklist with step 1 as CTA; each click deep-links to the matching options wizard step.
- Complete steps one at a time; after each, exactly one "Next: …" CTA remains — user always knows the next incomplete step.
- After key + CSV + one successful refresh with toggle ON: `chrome.storage.local.get('pts_metrics')` in the service-worker console shows `activatedAt` set. Toggle OFF before first refresh → `activatedAt` stays null (proves the 4th conjunct).
- `node test_fixtures/test_shared.mjs` green.

**Commit:** `feat(setup): unified 3-step progress spine in popup and options`

---

## MT-2 — "Your day so far" after first successful refresh (the scoreboard)

**Goal:** the first successful price pull lands the user on an emotional payoff: big Today's P&L, top 3 movers, "Strip is on — open any tab." — the ParseKit pattern. Popup PNL view is the natural success screen; extend it, don't rebuild it.

### Prerequisite fix (own commit)

`shared.js`: add `watchlist: "pts_watchlist"` to `STORAGE_KEYS` (see bug note above).
**Commit:** `fix(popup): define missing pts_watchlist storage key`

### Files to modify

**`background.js`**: already wired in foundation (`recordSuccessfulRefresh` sets `firstRefreshAt` + date-stamps `activeDays`).

**`onboarding.js`**: nothing structural; `pts_onboarding` gains one flag `firstValueSeen: boolean` written via existing `setOnboarding()`.

**`popup.js`** — `renderPopupContent()`:
1. **First-value hero:** when rendering the PNL view, read `pts_onboarding.firstValueSeen`; if falsy, set the summary-card label to **"Your day so far"** (instead of `Today's P&L (INR)`), add a one-time class `first-value` (subtle shimmer reusing the existing `setup-complete-shimmer` pattern), then `setOnboarding({ firstValueSeen: true })`. Subsequent opens show the normal `Today's P&L (INR)` label. Because `refreshPopup` already re-renders on `storage.onChanged` for `pts_positions_state`, a user sitting on the checklist view transitions to this hero the moment the first poll lands — **first success never lands on an empty popup** (the `VIEW_EMPTY` branch requires `status.complete && !positions.length`, which can't hold right after a successful refresh).
2. **Top 3 movers:** extend the existing movers section — sort positions with `lastPrice != null` by `Math.abs(dayPnlPct)` descending and render up to **3** rows (currently renders best + worst only). Keep label **"Top movers (today)"**.
3. **Strip status line:** under the movers, one quiet line driven by `settings.enabled`:
   - enabled → **"Strip is on — open any tab."**
   - disabled → **"Strip is off — flip the toggle above."**
4. **Method + caveat microcopy** (small `.stats-footnote` under the summary card):
   > *"P&L = your imported quantities × latest price. 5-min is the short-term move; Daily is measured from the previous close (provider rules)."*
   One help link: `<a>` to the README `#-features` anchor (`https://github.com/harshabala/myticker-extension#readme`).
5. **Privacy line** (directly below, `.privacy-line`):
   > *"Stored only in this browser. Never uploaded."*

**`popup.html`** (inline `<style>`): `.stats-footnote`, `.privacy-line` (11px, `--text-tertiary`, 1.4 line-height), `.first-value` shimmer (respect `prefers-reduced-motion` like existing motion code).

### Metrics

- **Engagement:** `pts_metrics.activeDays` — local date stamps of days with ≥1 successful refresh while enabled (written by background; defined in foundation).
- **User-visible:** Today P&L and 5-min P&L are already computed by `shared.js` — this task only surfaces them as the scoreboard; no new math.

### Privacy

Prices come from Finnhub; portfolio math stays in `shared.js` on-device; holdings never leave the browser. No new network calls.

### Acceptance verification

- Fresh setup: save key → import sample CSV → keep popup open; when the immediate poll (`poll-now`) succeeds, popup transitions checklist → **"Your day so far"** hero with P&L, ≤3 movers, strip line, footnote, privacy line. No empty state anywhere on the success path.
- Close/reopen popup → label reads `Today's P&L (INR)` (hero is one-time).
- `pts_metrics.activeDays` contains today's date; re-polling the same day does not duplicate it.
- Reduced-motion mode: no shimmer.

**Commit:** `feat(popup): "Your day so far" scoreboard with top-3 movers, method + privacy copy`

---

## MT-3 — Broker import: one golden path (Zerodha) + honest others

**Golden path choice: Zerodha** — it is the strongest parser in `csvParser.js` (only preset with `defaults` for exchange/currency, automatic `.NS` suffixing, Zerodha-specific diagnostics in `diagnoseCsvImport`, and a ready sample fixture `test_fixtures/sample_holdings_zerodha.csv`).

### Files to modify

**`options.html`** — `#section-import` ("Portfolio Import — Step 2"):
- Replace the broker `<select>`-first layout with a golden-path lead:
  - Heading line: **"Zerodha holdings export (recommended)"**
  - Hint: *"Kite Console → Portfolio → Holdings → Download CSV. Drop it below — NSE symbols get `.NS` automatically."*
  - Link: **"Download a sample Zerodha CSV to try it first"** → `<a href="test_fixtures/sample_holdings_zerodha.csv" download>` (packaged file; extension pages can link it directly, no `web_accessible_resources` change needed).
- Move the preset `<select>` inside a `<details>` block: `<summary>`**"More formats: Groww, Upstox, generic CSV"**`</summary>` — matches the codebase's existing `<details class="card crypto-details">` idiom. Default `#brokerPreset` value = `zerodha`.
- Add an import-stats line container `#importStats` under the buttons.

**`options.js`** — `handleImportCsv()`:
- On success (after `chrome.storage.local.set` of holdings): `await recordImportResult(presetKey, true)`.
- On failure (`diag` non-null, parse throw, empty-file toast): `await recordImportResult(presetKey, false)`.
- New `renderImportStats()` called from `init()` and after each import: reads `pts_metrics.imports`, renders e.g.
  > **"Imports on this device: 3 succeeded · 1 failed (Zerodha 3/3)."**
  with caveat + privacy microcopy underneath:
  > *"Counted locally whenever a CSV parses to at least one holding. Stored only in this browser. Never uploaded."*
  Hidden until at least one import attempt exists (no zero-noise UI).
- Auto-detect (`detectPresetFromRows`) already overrides a wrong preset selection — keep; it is what makes the golden path one-try.

**`metrics.js`**: `recordImportResult` (foundation section).

### Metric

`import_success_rate` by preset = `imports[preset].success / (success + fail)` — derived at render time from counts; no extra storage.

### Acceptance verification

- Options → click "Download a sample Zerodha CSV" → drop the downloaded file on the drop zone → toast `Imported 5 holdings (5 with .NS for NSE)` on the **first try**, no preset fiddling (auto-detect + zerodha default).
- `#importStats` shows `1 succeeded · 0 failed`. Drop `sample_holdings_generic.csv` with preset forced wrong → failure recorded and surfaced honestly.
- Groww/Upstox/generic remain fully functional under "More formats".

**Commit:** `feat(import): Zerodha golden path with sample CSV and local import stats`

---## MT-4 — Privacy + market-data honesty

### Files to modify

**`options.html`** — replace the `page-footer` content (line ~1102) with:

> **"MyTicker v0.2.0 · Holdings and keys stay in this browser. Prices come from Finnhub; we don't send your portfolio to our servers — we don't have servers. · Built by [Harsha Balakrishnan](https://github.com/harshabala)"**

Keep it one quiet line in existing footer styling (this is the spec's settings-footer copy, adapted to name the actual provider).

**`popup.html` / `popup.js`** — already covered by MT-2's `.privacy-line` ("Stored only in this browser. Never uploaded.") so every stats surface carries the privacy strip: popup scoreboard (MT-2), import stats (MT-3), options footer (MT-4).

**`PRIVACY.md`** — append the new local metrics to the "Data stored locally" table: one row `Usage counters (pts_metrics) | chrome.storage.local | Setup progress, active-day dates, import success counts — never transmitted`. Keeps the policy honest about the new key.

### Acceptance verification

- Open options → footer sentence visible without scrolling horizontally; link works.
- Grep check — no telemetry endpoints introduced: `grep -rn "fetch(" background.js options.js popup.js contentScript.js metrics.js` shows only Finnhub (+ existing Yahoo test-connection call in options.js).

**Commit:** `feat(privacy): market-data honesty footer and privacy strips on all stats surfaces`

---

## Sequencing & commit list (small, conventional, no push)

1. `fix(popup): define missing pts_watchlist storage key`
2. `feat(metrics): local-first pts_metrics store + isActivated activation constant` (+ tests)
3. `feat(setup): unified 3-step progress spine in popup and options` (MT-1)
4. `feat(popup): "Your day so far" scoreboard with top-3 movers, method + privacy copy` (MT-2)
5. `feat(import): Zerodha golden path with sample CSV and local import stats` (MT-3)
6. `feat(privacy): market-data honesty footer and privacy strips on all stats surfaces` (MT-4 + PRIVACY.md)

After each commit: `node test_fixtures/test_shared.mjs` + the `node --input-type=module --check` loop; manual reload of the unpacked extension for UI tasks.

## Feasibility

All four tasks are feasible in the current codebase. No infeasible items.

Known limitation reported honestly (not fixed here): watchlist *prices* never populate because `background.js` doesn't poll watchlist symbols — pre-existing, orthogonal to MT-1…MT-4.


## Agent completion checklist

- [ ] Fix pts_watchlist bug first (plan prerequisite)
- [ ] Foundation pts_metrics + isActivated
- [ ] MT-1 … MT-4 per plan commits
- [ ] README dual sections
- [ ] docs/TASKS.md
- [ ] Tests green; load unpacked smoke
- [ ] PR opened
