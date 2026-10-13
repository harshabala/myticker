# Chrome Web Store Listing

## Short Description (132 chars max)
Live stock & crypto ticker strip on every tab. Track portfolio P&L from Zerodha, Groww, Upstox, and more. 100% private.

## Detailed Description

**MyTicker** puts a sleek, live-updating stock ticker strip at the top of every webpage you visit — just like the scrolling tickers on financial news channels, but for YOUR personal portfolio.

### 🎯 What it does

Import your holdings from any Indian or US broker (Zerodha, Groww, Upstox, or any generic CSV), and MyTicker will show you:

• **5-minute P&L** — see how your stocks moved in the last 5 minutes
• **Daily P&L** — track your day's gains and losses at a glance
• **Aggregate portfolio** — total P&L across all holdings
• **Top movers** — your best and worst performers today

The ticker scrolls smoothly across the top of every page. Hover to pause. Click the extension icon for a quick P&L summary.

### 🪙 Crypto Support

Optionally add supported crypto to your ticker (CoinGecko primary, with mapped Binance fallback):
• **Top 5 watchlist** — BTC, ETH, BNB, XRP, SOL (unit price change, qty 1)
• **Manual holdings** — search and select from Bitcoin/BTC, Ethereum/ETH, BNB, XRP, and Solana/SOL; remove selected assets with their chips.

### 🔒 100% Private

Your data NEVER leaves your browser:
• Holdings stored locally in Chrome storage
• Optional Finnhub API key encrypted locally; its derived unlock material lasts only for the current browser session, so you unlock it again after restart
• No analytics, tracking, accounts, or portfolio telemetry

### 🌐 Why MyTicker runs on all pages

The ticker tape starts on all pages before page content so it can reserve its small strip of layout space consistently. It does not read page content. Prices are requested only from Yahoo Finance (`query1.finance.yahoo.com`) for Indian equities, Finnhub (`finnhub.io`) for optional US-equity quotes, CoinGecko (`api.coingecko.com`) for crypto, and mapped Binance fallback (`data-api.binance.vision`) when CoinGecko has no quote.

### ⚡ Premium Design

• Dark glassmorphism popup with P&L at a glance
• Apple-style settings page with drag-and-drop CSV import
• Smooth animations and glow effects
• Keyboard shortcut: Ctrl+Shift+Y (Mac: ⌘+Shift+Y) to toggle

### 📊 Supported Brokers

• Zerodha (holdings export CSV)
• Groww (holdings export CSV)
• Upstox (holdings export CSV)
• Any broker with a generic CSV (symbol, quantity, avg price)

### 🛠 Setup (30 seconds)

1. Import your broker CSV (Indian NSE/BSE and crypto prices work with no key)
2. For US stocks, optionally paste a free key from finnhub.io in Settings and use Test connection
3. Optionally add crypto
4. Done — your ticker is live!

## Category
Productivity

## Language
English

## Privacy Policy URL
https://github.com/harshabala/myticker/blob/main/PRIVACY.md

## Single purpose
Show an ambient stock and crypto ticker strip, with local portfolio P&L, on web pages.

## Permission justifications (for the developer dashboard)
- `storage`: save holdings, settings, the encrypted optional API-key vault and the price cache in the browser. Nothing is uploaded.
- `alarms`: schedule periodic price polling from the Manifest V3 service worker.
- Host permissions `https://query1.finance.yahoo.com/*`, `https://finnhub.io/*`, `https://api.coingecko.com/*`, `https://data-api.binance.vision/*`: fetch quotes from exactly these four providers. Only ticker symbols (or public crypto ids, and for Finnhub the user's own key) are sent.
- Content script on all URLs at `document_start`: render the strip and reserve its layout space before the page paints, so pages do not jump. It runs in the top frame only, inside a closed Shadow DOM, and does not read or modify page content.
- Web-accessible resource `ticker.css`: lets the strip's Shadow DOM load its own stylesheet.
- Remote code: none. All code is in the package; the extension-page CSP is `script-src 'self'`.

## Data usage disclosures
No personally identifiable, health, financial-account, authentication-credential (beyond the optional user-supplied API key, stored encrypted locally), location, web-history or user-activity data is collected or transmitted to the developer. Portfolio holdings stay local. Not sold or used for unrelated purposes.

## Screenshots to upload (1280x800 or 640x400, up to 5)
Existing sources are in `docs/screenshots/` (1600x900 and 1600x1000, so resize or recapture at 1280x800):
1. `ticker-tape-in-action.png`: the strip on a news page
2. `popup-on-moneycontrol.png`: the P&L scoreboard popup
3. To capture: Options page with CSV import (no real holdings; use the sample CSV)
4. To capture: Options key-vault section (no real key)

Icons are in `icons/` (16, 32, 48, 128). A 440x280 small promo tile is optional and not yet created.

## Submission
Not submitted. Build the upload with `npm run package` (see RELEASING.md); the maintainer submits it.
