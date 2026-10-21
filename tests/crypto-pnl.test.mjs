import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTickerItems, withTickerItems } from "../shared.js";

// Crypto quantities come from the crypto CSV import or the manual list. They
// give a per-coin 24-hour P&L in USD, shown on the tape only: never added to
// the portfolio total (no FX, INR and USD never mixed).
const btc = { symbol: "bitcoin", displayName: "bitcoin", quantity: 2, lastPrice: 65000, changePct: 1.5, currency: "USD", assetClass: "crypto" };

test("a crypto item with a quantity carries its 24h P&L in USD", () => {
  const [item] = buildTickerItems({ crypto: [btc] });
  const expected = 2 * (65000 - 65000 / 1.015);
  assert.equal(item.kind, "crypto");
  assert.ok(Math.abs(item.dayPnl - expected) < 1e-6, String(item.dayPnl));
  assert.equal(item.currency, "USD");
});

test("crypto without a quantity, price or change stays quote-only", () => {
  for (const coin of [{ ...btc, quantity: 0 }, { ...btc, lastPrice: null }, { ...btc, changePct: null }, { ...btc, quantity: undefined }]) {
    assert.equal(buildTickerItems({ crypto: [coin] })[0].dayPnl, null);
  }
});

test("crypto P&L never changes the portfolio aggregate", () => {
  const positionsState = { positions: [], aggregate: { dayPnl: 100, currency: "INR" } };
  const state = withTickerItems({ positionsState, crypto: [btc] });
  assert.deepEqual(state.aggregate, { dayPnl: 100, currency: "INR" });
});
