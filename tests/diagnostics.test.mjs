import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDiagnosticsReport } from "../diagnostics.js";

const base = {
  settings: { enabled: true, cryptoConfig: { includeCrypto: true }, portfolioFilters: { showCrypto: true } },
  holdings: [{ symbol: "TCS.NS", quantity: 50 }, { symbol: "SECRETCO.NS", quantity: 1234 }],
  watchlist: [{ symbol: "AAPL" }],
  state: { updatedAt: 0, tickerItems: [{ symbol: "TCS.NS", lastPrice: 3556.8, dayPnl: 1840 }] },
  health: { consecutiveFailures: 2 },
  log: [
    { timestamp: 0, event: "refresh-start", holdingsCount: 2, watchlistCount: 1 },
    { timestamp: 0, event: "provider-results", yahooQuotes: 2, coinGeckoQuotes: 1, quoteCount: 3 },
    { timestamp: 0, event: "refresh-failed", error: true }
  ],
  contentStatus: { stage: "render-success", origin: "https://example.com", timestamp: 0 },
  vaultStatus: { configured: true, unlocked: false },
  buildVersion: "9.9.9"
};

test("the report summarises counts, provider results and lifecycle", () => {
  const report = formatDiagnosticsReport(base);
  assert.match(report, /build v9\.9\.9/);
  assert.match(report, /Holdings: 2 · Watchlist: 1 · Ticker items: 1/);
  assert.match(report, /2 consecutive failure\(s\)/);
  assert.match(report, /Yahoo Finance: .* 2 quotes in last provider result/);
  assert.match(report, /CoinGecko: .* 1 quote in last provider result/);
  assert.match(report, /Finnhub: US equities · key locked/);
  assert.match(report, /refresh-start · holdings=2, watchlist=1/);
  assert.match(report, /refresh-failed · Refresh failed/);
});

test("the copyable report never contains symbols, quantities, prices or P&L", () => {
  const report = formatDiagnosticsReport(base);
  for (const secret of ["TCS", "SECRETCO", "AAPL", "1234", "3556", "1840"]) {
    assert.ok(!report.includes(secret), `report leaks ${secret}`);
  }
});

test("empty storage produces a readable report", () => {
  const report = formatDiagnosticsReport({ settings: {}, vaultStatus: {} });
  assert.match(report, /Ticker enabled: yes/, "absent enabled means the default (on)");
  assert.match(report, /Holdings: 0 · Watchlist: 0 · Ticker items: 0/);
  assert.match(report, /Last state update: Never/);
  assert.match(report, /No refresh diagnostics recorded yet\./);
  assert.match(report, /Finnhub: US equities · not configured/);
});
