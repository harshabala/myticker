# MyTicker: North Star and the road to 10/10

Written 2026-11-13 from a review of the code, the October plan and a conversation with the owner.
This replaces `2026-10-21-path-to-10.md` as the thing to work from. That plan scored engineering
health (8/10). This one scores whether the strip is something the owner keeps switched on.

Read "Rules for agents" first, then take the first workstream whose "Done when" is not yet true.

## Why MyTicker exists

A thin strip across the top of every page showing the owner's holdings: price, day change and day
profit or loss, without opening a broker app. Everything stays in the browser.

## The owner's complaint

The strip does not own its space. On many sites, page content ends up hidden behind it. The owner
wants the whole page pushed down by exactly the strip's height, on every site.

## North Star

**The strip is on, on every site, all day, and never covers or breaks anything.**
Measured as: sites in a fixed test list where no page element overlaps the strip and nothing in
the page's layout changes except moving down by the strip's height.

## What 10/10 looks like: three scenarios

1. **Never in the way.** On each site in the test list, at page load, after scrolling, and after
   the site's own header sticks, nothing sits under the strip and nothing is cut off at the bottom.
2. **Glance and know.** Within two seconds of a page opening, the strip shows current prices with
   a clear mark for stale or closed-market data.
3. **Zero setup for the common case.** A new user drops a holdings file in and sees their strip
   on the next page, with no key needed for Indian stocks.

## Where MyTicker is today (purpose score: 7/10)

True today:
- Holdings import, prices, day profit and loss, popup scoreboard, encrypted key vault.
- 122 tests and an 11-check browser smoke test. No layout jump while the stylesheet loads.

The gap, confirmed in `contentScript.js`:
- Space is reserved by adding the strip's height to `body`'s top margin and setting
  `scroll-padding-top` on the root. That moves normal page content only.
- A site's own header that is `position: fixed` or `sticky` at `top: 0` is positioned against the
  window, not the body, so it stays at the top and slides under the strip. The same goes for
  full-height side panels and overlays.
- Not checked on heavy real sites, with a screen reader, or with live prices and a real key.
- Not published; continuous integration cannot run.

## Workstreams, in order

### 0. One clean base
- Merge `harsha/path-to-10` into `main`.
- **Done when:** one checkout, `npm run verify` and `npm run smoke` green, GitHub equals local.

### 1. A test list and a measuring tool (before any fix)
- A fixed list of at least 25 sites covering the hard cases: fixed headers, sticky headers that
  appear on scroll, full-height sidebars, single-page apps that re-render the header, pages with
  cookie banners at the top, video sites, web mail, chat apps, and a plain document.
- Local fixture pages that reproduce each case, so the smoke test can check them offline.
- A check that reports, per page: any element whose box overlaps the strip, and any change in the
  page's layout beyond a uniform shift.
- **Done when:** the check runs on every fixture and shows today's failures.

### 2. Own the space
- Shift elements that are fixed or sticky to the top of the window by the strip's height, and
  shrink full-height fixed elements to match. Keep doing so as the page changes (new elements,
  class changes, route changes) without measurable slowdown.
- Restore every changed style exactly when the strip is turned off or hidden.
- Handle the awkward cases explicitly: elements inside shadow roots, sites that set their own
  `top` with `!important`, fullscreen video (strip hides), print (strip hides), and pages where
  the strip should not appear at all.
- Compare approaches with a short prototype before committing. Moving the page with a transform
  on the root looks simple but changes how fixed elements are positioned, so test it; do not
  assume.
- **Done when:** scenario 1 passes on every fixture and on the live test list, checked by the
  owner on at least ten of them.

### 3. Per-site escape hatch
- One click in the popup: "hide on this site" and "report a layout problem" (which copies a
  diagnostic with no holdings in it).
- **Done when:** both work and are covered by the smoke test.

### 4. Live truth
- Run against live prices with a real key through a market open and close. Check staleness marks,
  rate-limit backoff and the closed-market state.
- **Done when:** a recorded session through one market open and one close shows no wrong or
  unmarked stale value.

### 5. Feel
- Apply `DESIGN.md` and `brand.md`: the strip's motion, hover detail, and a pause on hover.
  Respect reduced motion. Break up `options.js` and `options.html` as the October plan described.
- **Done when:** the owner accepts a screen recording on three sites.

### 6. Ship
- Store listing, screenshots without real holdings, privacy policy page, a tagged release.
- **Done when:** it installs from the Chrome Web Store.

## Rules for agents

- Two permissions and the pinned hosts stay as they are; the test that enforces them stays.
- Never leave a page changed after the strip is off. Every style change must be reversible and
  tested as such.
- No holdings, symbols or amounts in logs, diagnostics or screenshots.
- `npm run verify` and `npm run smoke` green before every commit.
- A layout claim is made only with the measuring tool's output attached.

## Needs the owner

- Checking the live test list by eye; a real key for the live run.
- Chrome Web Store developer account and submission.
- Restoring GitHub Actions, or accepting local checks as the gate.

## Scoring

One point each, ten in all: measuring tool and fixtures (1); zero overlap on all fixtures (2);
zero overlap on the live list (2); clean restore everywhere (1); escape hatch (1); live-price run
(1); owner accepts the feel (1); published (1).

Today: 7 for a working, well-tested product; the three layout points and publishing are open.
