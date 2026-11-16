# Layout test sites (check by eye)

For the owner to open in Chrome with MyTicker on. Nothing visits these automatically; the
automated check only uses the local fixtures in `test_fixtures/layout/`.

For each site check three moments: just after load, after scrolling down a screen or two, and
after the site's header sticks or changes. Pass means nothing sits under the strip, nothing is cut
off at the bottom, and the page looks the same as with the strip off, only moved down by the
strip's height. Toggle the strip with Cmd+Shift+Y to compare.

| # | Site | Case it covers | Fixture |
|---|------|----------------|---------|
| 1 | https://www.nytimes.com | Sticky header, cookie/consent banner | sticky-header, cookie-banner |
| 2 | https://www.theguardian.com | Cookie banner, sticky nav | cookie-banner |
| 3 | https://www.bbc.com/news | Fixed/sticky header, heavy page | fixed-header |
| 4 | https://github.com | Sticky header, header that changes on scroll | fixed-on-scroll |
| 5 | https://github.com/anthropics | Sticky repo header, SPA route changes | spa-rerender |
| 6 | https://stackoverflow.com/questions | Fixed top bar, left sidebar | fixed-header, fixed-sidebar |
| 7 | https://www.reddit.com | Fixed header, full-height sidebar, SPA | fixed-sidebar, spa-rerender |
| 8 | https://news.ycombinator.com | Plain table layout (control case) | long-document |
| 9 | https://en.wikipedia.org/wiki/Stock_market | Sticky header after scroll, in-page anchors, plain document | long-document, fixed-on-scroll |
| 10 | https://developer.mozilla.org/en-US/docs/Web/CSS/position | Fixed header, sticky sidebar, anchors | fixed-header, long-document |
| 11 | https://www.youtube.com | Fixed masthead, fullscreen video, SPA | fullscreen-video, spa-rerender |
| 12 | https://www.twitch.tv | Fixed top nav, full-height side panel, video | fixed-sidebar, fullscreen-video |
| 13 | https://vimeo.com | Fixed header, video | fullscreen-video |
| 14 | https://mail.google.com | Web mail, app shell with full-height panes | fixed-sidebar |
| 15 | https://outlook.live.com/mail | Web mail, app shell | fixed-sidebar |
| 16 | https://chatgpt.com | Chat app, full-screen dialogs (existing adapter) | modal-overlay |
| 17 | https://claude.ai | Chat app, full-height sidebar | fixed-sidebar |
| 18 | https://web.whatsapp.com | Chat app, full-viewport layout | fixed-sidebar |
| 19 | https://www.linkedin.com/feed | Fixed header, SPA, body replaced on navigation | spa-rerender |
| 20 | https://x.com | Fixed side rail, SPA | fixed-sidebar, spa-rerender |
| 21 | https://www.amazon.com | Sticky header, consent banner, overlays | sticky-header, cookie-banner |
| 22 | https://www.apple.com | Sticky global nav with its own transforms | body-margin-transforms |
| 23 | https://stripe.com/docs | Fixed header, sticky sidebar, shadow-like components | fixed-header |
| 24 | https://docs.github.com | Sticky header, anchors | sticky-header, long-document |
| 25 | https://www.figma.com | Full-viewport app, modal overlays | modal-overlay |
| 26 | https://trends.google.com/trends | Fixed header using top, material components (shadow DOM) | shadow-root-header |
| 27 | https://www.google.com/search?q=weather | Sticky search bar, `!important` positioning | important-top |
| 28 | https://zerodha.com | Broker site, top banners, sticky header | cookie-banner, sticky-header |
| 29 | https://www.tradingview.com | Full-height app panes, fixed toolbars | fixed-sidebar |
| 30 | https://example.com | Plain page (control case) | long-document |
| 31 | https://www.w3.org/TR/css-position-3/ | Long document with a fixed table of contents and anchors | long-document, fixed-sidebar |
| 32 | Any page, then Print preview (Cmd+P) | Print stylesheet: strip must not print | print-stylesheet |

Record failures as: site, moment (load, scrolled, stuck), what overlaps or moved, screenshot
without any holdings visible (turn the holdings off first).
