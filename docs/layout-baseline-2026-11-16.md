# Layout baseline, 2026-11-16 (before any fix)

Command: `npm run check:layout` at the commit that added the measuring tool, Brave headless
(Chromium 155 family), 1280x800 window, strip height 36.72px (comfortable size), no holdings loaded.
89 failures across 13 fixtures. The machine-readable list is
`test_fixtures/layout/known-failures.json`; the smoke test fails if a failure appears that is not in
it, and fails again when one is fixed but not removed (a ratchet).

Check ids: `overlap@stage` (painted element under the strip; after scrolling only elements pinned
to the window count), `shift@stage` (anything other than a uniform shift by the strip height),
`cutoff@stage` (pinned element past the bottom), `fullscreen`, `print`, `restore` (exact original
attributes and computed styles after the strip is off), `perf`, `burst-shift`.

| Fixture | Failures | Which |
|---|---:|---|
| fixed-header | 8 | overlap and shift at load, scrolled, stuck; burst-shift (fixed elements added in a burst); restore |
| sticky-header | 5 | overlap and shift once stuck (scrolled, stuck); restore. Clean at load: it is in normal flow |
| fixed-on-scroll | 5 | overlap and shift once it becomes fixed (scrolled, stuck); restore |
| fixed-sidebar | 7 | overlap and shift at all stages; restore |
| spa-rerender | 9 | overlap and shift at load, scrolled, stuck and after route changes; restore |
| cookie-banner | 7 | overlap and shift at all stages; restore |
| important-top | 7 | overlap and shift at all stages; restore |
| shadow-root-header | 7 | overlap and shift at all stages; restore |
| modal-overlay | 7 | overlap and shift at all stages; restore |
| fullscreen-video | 8 | overlap and shift at all stages; fullscreen (strip and reserved space stay); restore |
| print-stylesheet | 8 | overlap and shift at all stages; print (strip visible, 38 elements differ from the plain print layout); restore |
| long-document | 4 | shift at all stages: the first child's margin collapses into the body margin, so content moves 15.3px instead of 36.7px; restore |
| body-margin-transforms | 7 | overlap and shift at all stages (the fixed header); restore |
| **Total** | **89** | |

Findings worth knowing:

- Every fixture fails `restore`: turning the strip off leaves `--pts-tape-scale` and
  `--pts-ticker-duration` on the root element's inline style and an empty `style=""` attribute on
  `body`. Nothing in the old tests could see this.
- No `cutoff` failure today only because nothing is shifted yet. It will matter once fixed
  elements move.
- `long-document` shows a second flaw of the body-margin approach: margins collapse, so the page is
  not moved by exactly the strip's height when the first child has a larger margin than the body.
- Burst of 1,000 DOM mutations: about 30ms with the strip, about 30ms without (no handling yet
  for new fixed elements).
- Not covered by any fixture: `position: absolute; top: 0` relative to the initial containing
  block, closed shadow roots (unreachable by any extension), full-viewport app shells with an
  inner scroller.
