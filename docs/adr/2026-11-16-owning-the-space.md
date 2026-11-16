# ADR: how the strip owns its space

Status: accepted, 2026-11-16. Measured with `npm run check:layout` (13 fixtures, 1280x800, strip
36.72px, Brave headless). Numbers are failures per run; the full list is in
`docs/layout-baseline-2026-11-16.md`.

## Problem

Space was reserved with a body top margin. Elements positioned against the window (`fixed`,
`sticky`) ignore it and slide under the strip.

## Options

**0. Body margin only (before).** 89 failures: every fixture with a fixed or sticky element
overlapped the strip, nothing was shifted uniformly, and every fixture failed `restore`.

**A. Per-element adjustment (chosen).** Keep the body margin for normal-flow content. Find
elements that are `position: fixed` or `sticky` with a numeric `top`, add the strip height to
`top` with an inline `!important` value (it beats a site's own `!important` stylesheet rule),
shrink fixed elements that touched the bottom of the window, skip elements whose containing block
is a transformed ancestor or an inner scroller, re-evaluate on mutation, resize and route change,
and put back exactly what was written. **3 failures** (see "What still fails"). Burst of 1,000
DOM mutations: 28 ms with the strip, 30 ms without.

**B. Transform on the root (prototype, not shipped).** `html { transform: translateY(H) }` moves
everything at once, including fixed elements, because a transformed ancestor becomes their
containing block. Prototype: `docs/adr/prototypes/transform-root.js`, run with
`LAYOUT_ALLOW_STRIP_OFFSET=1 npm run check:layout -- --content-script docs/adr/prototypes/transform-root.js`.
Tested, not assumed:

- The strip itself is a child of `html`, so it is moved down too and no longer sits at the top
  of the window. The check refuses to run unless that is allowed.
- Fixed elements stop being fixed: they scroll away with the page (moved -1563 px after
  scrolling 1600 px on the fixed-header, cookie, SPA, shadow-root and `!important` fixtures).
- Full-height fixed elements become as tall as the document (2080 px taller than the window in
  the sidebar and overlay fixtures; bottom-fixed notes land at the bottom of the document).
- 46 failures even with the strip offset tolerated, against 3 for A.
- It did avoid the margin-collapse flaw (long-document passed shift), which is its only win.

## Decision

A. B breaks fixed positioning by design. A's cost is a scan, bounded by a time budget (8 ms per
slice), incremental on mutations, and measured at no visible overhead.

## Also decided

- The strip hides, and the page gets its layout back, in fullscreen and while printing
  (`fullscreenchange`, `matchMedia("print")`, `beforeprint`/`afterprint`).
- The strip no longer writes `--pts-tape-scale` / `--pts-ticker-duration` on the page's root
  element, and empty `style=""` attributes it created are removed. The restore check found these
  leaks in every fixture.
- Performance guard: median of five 1,000-mutation bursts, budget 250 ms absolute and 100 ms
  over the strip-off run (`PERF_BUDGET` in `scripts/check-layout.mjs`), inside `npm run smoke`.

## What still fails

`long-document` (3 shift checks): margins collapse, so when the page's first child has a larger
top margin than the body, the body margin moves content by less than the strip height (15.3 px
instead of 36.7 px here). Nothing is under the strip. The exact fix is a margin on `html`
instead of `body` (the root's margin never collapses), but existing tests in
`test_fixtures/test_ticker_render.mjs` assert body margin ownership, so that change needs an
owner decision.

Not covered: closed shadow roots (unreachable), `position: absolute; top: 0` against the initial
containing block, and full-viewport app shells with an inner scroller.
