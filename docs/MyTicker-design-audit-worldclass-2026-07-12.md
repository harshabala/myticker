# MyTicker — Multi-Skill Design Audit & World-Class Vision

**Date:** 2026-07-12  
**Product:** MyTicker Chrome MV3 extension (popup · options · ticker strip)  
**Method:** 5 parallel design-skill subagents (Apple Design, Impeccable/Taste, Emil+Motion+High-end, Minimalist+Guidelines+Roast, Brand+Ticker+Redesign)  
**Codebase:** `~/Documents/Projects/MyTicker` · Desktop load: `MyTicker-chrome` v0.2.1

---

## Executive verdict

| Lens | Score | One-line |
|------|------:|----------|
| Apple Design (fluid + principles) | **~4.5 / 10** | HIG vocabulary without fluid physics |
| Impeccable / product taste | **~21 / 40** | Bans sanded; generic dark-fintech skeleton remains |
| Emil craft | **7.2 / 10** | Strong tokens; uneven execution |
| Motion | **7.0 / 10** | Good register; decorative leftovers |
| High-end visual | **6.4 / 10** | Intent premium; still “well-made extension” |
| Product roast (ship-ready) | **4 / 10** | Settings panel that ate a product |
| Brand delivery | **6.5 / 10** | Right palette direction; brass-flat + screenshot drift |

**Consensus:** Architecture and a11y bones are serious. The face still performs **“dark SaaS settings page”**, not **“ambient Apple finance utility.”**  
Your gut (“looks shitty / not power”) is aligned with every critical lens.

---

## Skills run (inventory)

| Skill / lens | Agent | Core question |
|--------------|-------|----------------|
| **apple-design** | A1 | Fluid interfaces + 8 principles |
| **impeccable** + **design-taste-frontend** | A2 | Anti-slop + product register |
| **emil-design-eng** | A3 | Invisible polish |
| **design-motion-principles** | A3 | Purposeful motion only |
| **high-end-visual-design** | A3 | Agency-level craft |
| **minimalist-ui** | A4 | Restraint / flat editorial (adapted to dark finance) |
| **frontend-design-guidelines** | A4 | Hierarchy, forms, empty, a11y |
| **roast-my-product** | A4 | Harsh product truth |
| **brand-design** + **redesign-existing-projects** | A5 | Identity + phased upgrade |
| **Ticker / competitive** | A5 | Strip ambient quality vs Stocks / Kite / RH |

*(frontend-design-guidelines, product-review, stitch, gpt-taste, industrial-brutalist, imagegen skills folded into synthesis where overlapping; brutalist deliberately de-prioritized for this product.)*

---

## Why it looks cheap (root causes — not symptoms)

Agreed by **all five agents**:

1. **Layout grammar is SaaS cards**, not instrument / iOS Settings lists.  
   Every concern is a rounded bordered room → chrome wins, density dies. Violates PRODUCT “data-density / no cards under every row.”

2. **Hero-metric fintech cliché**  
   26px green P&L billboard = Robinhood-clone popup, not ambient companion.

3. **Gold is brass paint, not rare metal**  
   Used on section titles, CTAs, toggles, crypto, focus → accent inflation. True premium uses gold sparingly.

4. **Decorative gradients after ban cleanup**  
   Status-pill 135° washes, provider tints, setup shimmer, section-title gradient rules.

5. **Settings is a config landfill**  
   4 pills + wizard + dual import CTAs + multi-Save + tips essay before money.

6. **Ticker is a TV marquee**, not a scannable instrument  
   Linear infinite scroll; no scrub, no rubber-band, no velocity; opaque black stamp on host pages.

7. **Identity fracture**  
   Store screenshots cyan/teal; runtime Obsidian Gold. Trust failure.

8. **Type & spacing chaos**  
   Accidental ramp 9–26px; spacing 2/3/5/7/10/14 banned mid-values; no shared rem ladder.

---

## Consensus scorecard (merged)

| Dimension | Score | Status |
|-----------|------:|--------|
| Purpose clarity | 7 | Clear product idea |
| Simplicity | 3 | Settings complexity |
| Craft execution | 5 | Tokens good; chrome noisy |
| Fluid / direct manipulation | 2–3 | Strip fails |
| Materials honesty | 5 | Named materials, flat fill |
| Hierarchy (money first) | 5 | Competing blocks |
| Onboarding / time-to-value | 3 | Ceremony before import |
| A11y | 7 | Above average extension |
| Brand commitment | 4–6 | Drift + gold inflation |
| Ambient restraint | 5 | Strip too aggressive |
| **Overall product face** | **~4.5** | **Not power. Not Apple.** |

---

## Top failures (P0 → P2) — unified

### P0
1. **Ticker linear marquee** — kill infinite linear scroll as default; scrub + static overflow  
2. **Settings complexity** — one progressive path, auto-save, one status truth  
3. **Popup spatial thrash** — avoid full `innerHTML` nuke; stable geometry  
4. **Stacked ghost-cards** — border + elevation on every block  

### P1
5. Gradient pills / provider washes / setup shimmer  
6. Gold section titles + decorative rules  
7. Hero P&L oversized dashboard cosplay  
8. Incomplete reduced-motion on options (toast, skeleton, max-height)  
9. Marketing screenshot brand drift (cyan vs gold)  
10. Fixture CTA copy (“IRFC / OLAELEC…”) if still user-facing in prod  

### P2
11. Emoji drop zone  
12. Uppercase tracked table headers  
13. Sub-44px watchlist controls  
14. Token drift (`ticker.css` vs `motion.css`)  

---

## World-class vision: if Apple shipped MyTicker

### The product feeling
A **quiet instrument under the browser chrome**. You glance; you know if you’re up; you go back to work. No ceremony. No gradients. No “fintech startup” energy. Like **Stocks widget × System Settings toggle × Kite density**, without Kite noise.

### Strip (the real product)
- **28px** frosted near-black ribbon (`oklch` black ~0.88 alpha + optional blur; solid fallback)  
- Left pin: `Today` (secondary) · `+₹85.00` · `+2.86%` (tabular, green/red)  
- Items: monochrome symbol + signed delta only — **no circles, no ▲▼, no underlines**  
- **Static by default**; optional slow drift only if overflow  
- Trackpad/finger **scrubs with momentum + rubber-band**  
- Hover pauses; stale = quiet amber text, not pulse  
- Host pages still feel like the host page  

### Popup (glance only — 320–360px)
```
[mark] MyTicker
────────────────────────────────
Ticker strip                    [ iOS toggle ]
────────────────────────────────
Today
+₹1,234.50              +2.86%
5-min  +12.40 · Live · 2m · 12 holdings
How P&L works · Local only
────────────────────────────────
Top movers              (list, hairlines)
IRFC     −150.70   −44.2%
…
────────────────────────────────
Settings
```
- **One surface language** — not four stacked cards  
- P&L is clear but not a billboard (≈22–28px, not marketing hero)  
- No watchlist editor in v1 glance (or deeply demoted)  
- No full-view opacity reboot  

### Settings (iOS Settings, not admin console)
- Title: MyTicker  
- Subtitle: Holdings and keys stay on this device  
- **Groups:** Portfolio · Market data · Appearance  
- Section headers = **secondary gray**, not gold wallpaper  
- **One path:** drop CSV → live  
- **Auto-save on blur** — kill multi-Save  
- Gold only on the next primary action and focus rings  
- Zero emoji, zero gradient pills, zero tips essay wall  

---

## Exact visual system (target)

### Color
| Role | Hex | Use |
|------|-----|-----|
| bg | `#000000` | Canvas |
| surface | `#1C1C1E` | Grouped lists only |
| surface-2 | `#2C2C2E` | Hover / inset |
| text | `#F5F5F7` | Primary |
| text-2 | `#98989D` | Secondary |
| text-3 | `#636366` | Meta |
| gold | `#D4C08A` | Soft premium (prefer over brass `#C9B070`) |
| gold-deep | `#9A8550` | Pressed |
| gold-mute | `rgba(212,192,138,0.12)` | Focus wash |
| up / down | `#30D158` / `#FF453A` | Deltas only |
| strip | `rgba(0,0,0,0.88)` | Translucent |

### Type ramp (rem)
| Role | Size | Weight |
|------|------|--------|
| Display P&L | 1.75rem (28) | 700 tabular −0.03em |
| Page title | 1.25rem | 600 |
| Popup title | 0.9375rem | 600 |
| Body | 0.8125rem | 400–500 |
| Label | 0.75rem | 600 |
| Meta | 0.6875rem | 400–500 |
| **Ban** | 9–10px chrome | — |

### Spacing (4-pt only)
`4 · 8 · 12 · 16 · 24 · 32 · 48` — ban 5, 6, 7, 10, 14.

### Surfaces (3 layers max)
1. Canvas black  
2. Raised: surface + 1px hairline + inset catch-light  
3. Inset well: `rgba(0,0,0,0.35)` for inputs  

**No** multi-stop gradients, **no** soft drop shadows, **no** gold section rules.

### Motion
press 100 · fast 150 · medium 220 · slow 280  
ease-out-quint only · **kill** infinite pulse, shimmer, max-height thrash  
Unify `ticker.css` tokens with `motion.css`

---

## Phased roadmap (no full rewrite)

### Phase 0 — Hotfix (1–2 days) · “stop looking shitty”
- Kill status-pill gradients, section gold rules, setup shimmer  
- Strip: no underlines, no stale pulse, height 28–30px  
- Options section titles → secondary gray  
- Reshoot/replace cyan screenshots  
- Soften gold accent to `#D4C08A` or restrict current gold to CTAs/focus only  
- Rewrite brand.md: drop “memecoin/playful”

### Phase 1 — Craft (1 week) · “feels intentional”
- Shared rem type + 4-pt spacing in `brand.css`  
- Collapse options to grouped lists; one import path; auto-save  
- Popup: single hierarchy, demote/remove watchlist editor  
- Material stack + optional strip translucency  
- Fix reduced-motion holes in options  

### Phase 2 — World-class (2–3 weeks) · “power”
- Scrubable strip + rubber-band + optional auto-scroll  
- Host sticky collision handling  
- Density modes  
- In-place popup transitions (no geometry thrash)  
- Monochrome mark system  

---

## Wireframes (agent consensus)

### Popup (target)
```
┌──────── 320–360 ─────────────┐
│  ◆  MyTicker                 │
│  Ticker strip          [ ○ ] │  one row, not a card stack
│                              │
│  Today                       │
│  +₹1,234.50        +2.86%    │  display tabular
│  5m +12.40 · Live · 2m       │  one meta line
│  How P&L works · Local       │
│                              │
│  Top movers                  │  hairline list only
│  …                           │
│           Settings           │
└──────────────────────────────┘
```

### Options (target)
```
┌──────── max 640 ─────────────┐
│  MyTicker                    │
│  Data stays on this device   │
│                              │
│  Portfolio                   │  gray header
│  ┌─────────────────────────┐ │
│  │ Drop CSV / browse       │ │  solid inset, no emoji
│  │ [Continue]              │ │  one primary
│  └─────────────────────────┘ │
│  Market data                 │
│  ┌ rows / auto-save ───────┐ │
│  Appearance                  │
│  footer privacy              │
└──────────────────────────────┘
```

---

## Priority kill list (do first)

1. Gradients / shimmer / decorative section hairlines  
2. Multi-status pill dashboard + wizard theater (keep **one** progress model)  
3. Stacked ghost-cards on popup  
4. Linear marquee-as-default strip  
5. Multi-Save button farm  
6. Cyan marketing assets  
7. Fixture ticker names in primary CTA (if still shown)  
8. Emoji drop zone  

## Priority build list

1. One-path first value: CSV → prices → strip + calm P&L  
2. Money-first popup hierarchy  
3. Translucent ambient strip  
4. Unified type/spacing tokens  
5. Auto-save settings  
6. Scrub/momentum strip (Phase 2)  

---

## Honest bottom line

You already did hard product work (metrics, activation, import, a11y).  
**Design is lagging product.**  

World-class here is not more gold, more cards, or more motion.  
It is **less chrome, denser truth, quieter strip, one path to money.**  

Until cards, hero-dashboard cosplay, gradient residue, and marquee physics die, “Obsidian Gold Apple-minimal” remains a **token file**, not a product face.

---

## Suggested next command

Ship **Phase 0 + Phase 1** as a single `design(power): world-class craft pass` on a branch — CSS-first, minimal JS, no feature creep.

If you say **“execute the redesign”**, implement Phase 0+1 against popup / options / ticker / brand tokens and refresh `Desktop/MyTicker-chrome`.
