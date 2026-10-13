# Production readiness

Scored 0-10 per dimension. A 10 means every item is verifiably complete in the repository. Scores are deliberately conservative.

Audited at commit `c2eee32` (v0.5.0, main).

## Baseline (before this work)

| # | Dimension | Score | Evidence |
|---|-----------|-------|----------|
| 1 | Build and run reproducible | 7 | No build step, Node 20+ declared. No lockfile, no `.nvmrc`, no single verify entry that includes packaging. |
| 2 | Tests | 8 | 91 passing tests: P&L, provider parsing, backoff, vault, CSV, background poll error paths. Popup, options and onboarding UI barely covered; no coverage floor. |
| 3 | Static quality | 4 | Syntax check only. No linter, no formatter config, no type checking. |
| 4 | Security | 8 | Permissions are minimal and tested against code hosts, extension-page CSP, encrypted key vault, sender checks, CSV caps. No dependency audit, no SECURITY.md, no secret scan. |
| 5 | Reliability | 8 | 12 s timeouts, persisted exponential backoff, 30 s cache, stale flags, partial results, storage-quota pruning, settings migration. No schema version for local data. |
| 6 | Config and packaging | 3 | No zip script, no version-consistency check, no `package.json` version. CHANGELOG still "Unreleased" for a shipped 0.5.0. Store assets exist but are not listed. |
| 7 | CI | 4 | One workflow: syntax check and tests only. No lint, audit or package. |
| 8 | Docs | 5 | README, AGENTS.md, PRIVACY.md exist. No ARCHITECTURE, CONTRIBUTING, SECURITY. PRIVACY and STORE_LISTING point to the old repo name; STORE_LISTING is stale. |
| 9 | UX, accessibility, performance | 7 | ARIA labels, reduced-motion and reduced-transparency handled, closed Shadow DOM, transform-only animation. Contrast and heavy-page cost not documented or verified. |
| 10 | Operability | 7 | Local-only bounded diagnostics log with an allowlist (no symbols, no amounts), copy button in Options. No documented triage path. |

Sensitive-content scan of tracked files: no personal absolute paths, emails, tokens or keys found. Commit author emails are the owner's public noreply-style proton addresses.

Unmerged remote branches (not touched, not deleted): `feature/live-market-tape` (61 commits ahead), `feature/myticker-mvp`, `feature/tape-layout-reservation`, `docs/release-gate-audit`, `harsha/focused-burnell-333e39`, `backup/local-main-2026-07`, `sync/local-work-20261011`, `chore/sync-local-work-scrubbed`.

## After this work

| # | Dimension | Before | After | Evidence |
|---|-----------|--------|-------|----------|
| 1 | Build and run reproducible | 7 | 9 | Lockfile, `.nvmrc`, `npm ci`, one `verify` entry, deterministic zip. Not 10: not verified on a second machine or in CI (Actions is failing account-wide). |
| 2 | Tests | 8 | 8 | 97 passing (was 91): CSP/network boundary, packager, malformed holdings. Popup/options UI still thinly covered; no coverage floor. |
| 3 | Static quality | 4 | 7 | ESLint 10 clean, found and fixed unused code. No formatter, no type checking. |
| 4 | Security and privacy | 8 | 9 | `npm audit` clean (dev deps only), tightened CSP, secret/personal-path scan, SECURITY.md. No third-party security review. |
| 5 | Reliability | 8 | 8 | Malformed stored holdings no longer break refresh. Local data has no schema version (settings do). |
| 6 | Config and packaging | 3 | 9 | Zip packager, version check, CHANGELOG, store listing with permission justifications, RELEASING.md. Not 10: store submission is owner-only. |
| 7 | CI | 4 | 7 | Workflow runs check, lint, version, scan, test, audit, package on Node 20 and 22. Not 10 because it cannot be seen passing (Actions billing failure); the same commands pass locally. |
| 8 | Docs | 5 | 9 | ARCHITECTURE, CONTRIBUTING, SECURITY, RELEASING added; PRIVACY and STORE_LISTING links fixed. |
| 9 | UX, accessibility, performance | 7 | 7 | Unchanged. Contrast and heavy-page cost not measured; store screenshots at the required size still to capture. |
| 10 | Operability | 7 | 7 | Unchanged: local bounded diagnostics log and copy button. No triage runbook beyond ARCHITECTURE. |

Overall: not a 10. The extension is store-ready in the repository; remaining gaps are owner actions and manual browser verification.

Checked and found fine: manifest permissions and the four host permissions match the code (test-enforced); the content script uses a closed Shadow DOM, top frame only, with one web-accessible stylesheet; provider requests have timeouts, persisted backoff, a 30 s cache and partial-result handling; portfolio data is local only (`chrome.storage.local`, never sync) and documented in PRIVACY.md.

## Blocked on owner

- Chrome Web Store developer account, listing submission and review (nothing was submitted).
- Capture store screenshots at 1280x800 without real holdings, and an optional 440x280 promo tile.
- Confirm the privacy policy URL and support contact for the listing; enable GitHub private vulnerability reporting for SECURITY.md.
- Fix GitHub Actions billing so CI can run.
- Manual test in Chrome on heavy pages (contrast, layout shift, performance), which could not be run here.
- Tagging and publishing a release.

