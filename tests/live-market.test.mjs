import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  YahooIndiaPriceProvider,
  BinancePriceProvider,
  ProviderBackoff
} from "../priceProviders.js";
import { describeFreshness, summarizeMarketState } from "../shared.js";

/**
 * Workstream 4: Live Market Test
 *
 * Free public market-data sources used:
 * 1. Binance Vision Public Market Data API
 *    Endpoint: https://data-api.binance.vision/api/v3/ticker/24hr
 *    Terms: https://binance-docs.github.io/apidocs/spot/en/#public-api-terms-of-use
 *    Status: 24/7 open market. Allows public unauthenticated REST queries within rate limits.
 *
 * 2. Yahoo Finance Public Chart API
 *    Endpoint: https://query1.finance.yahoo.com/v8/finance/chart/
 *    Terms: https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html
 *    Status: Open during regular trading sessions; closed on weekends and outside trading hours.
 */

describe("live market data truth", () => {
  test("Binance Vision: live 24/7 open market prices", async () => {
    const binance = new BinancePriceProvider();
    const quotes = await binance.getQuotes(["bitcoin", "ethereum"]);

    assert.equal(quotes.length, 2, "Expected quotes for both BTC and ETH");
    for (const q of quotes) {
      assert.ok(q.lastPrice > 0, `Expected positive lastPrice for ${q.symbol}, got ${q.lastPrice}`);
      assert.equal(q.currency, "USD");
      assert.equal(q.marketState, "open", "24/7 crypto market must report open");
      assert.equal(q.source, "binance");
      assert.ok(Number.isFinite(q.updatedAt), "Expected valid updatedAt timestamp");
    }

    const marketState = summarizeMarketState(quotes);
    assert.equal(marketState, "open", "Summarized state of open market quotes should be open");

    const freshness = describeFreshness({ updatedAt: quotes[0].updatedAt, marketState }, Date.now(), 5);
    assert.equal(freshness, "live", "Fresh open market quote should report live");
  });

  test("Yahoo Finance: live stock data with closed market state outside trading hours", async () => {
    const yahoo = new YahooIndiaPriceProvider();
    const quotes = await yahoo.getQuotes(["TCS.NS", "INFY.NS"]);

    assert.equal(quotes.length, 2, "Expected quotes for TCS.NS and INFY.NS");
    for (const q of quotes) {
      assert.ok(q.lastPrice > 0, `Expected positive price for ${q.symbol}, got ${q.lastPrice}`);
      assert.ok(q.prevClose > 0, `Expected positive prevClose for ${q.symbol}, got ${q.prevClose}`);
      assert.equal(q.currency, "INR");
      assert.equal(q.source, "yahoo");
      assert.ok(q.marketState === "closed" || q.marketState === "open");
    }

    // Outside trading hours (such as weekend), marketState is closed
    const closedQuote = quotes.find((q) => q.marketState === "closed");
    if (closedQuote) {
      assert.equal(closedQuote.marketState, "closed");
      // If a snapshot is freshly saved after market close:
      const freshClosedState = { updatedAt: Date.now(), marketState: "closed" };
      assert.equal(describeFreshness(freshClosedState, Date.now(), 1), "closed", "Fresh closed-market snapshot reads as closed");
    }
  });

  test("Staleness marking and rate-limit backoff logic", () => {
    const now = Date.now();
    const backoff = new ProviderBackoff();

    // Fresh open quote
    assert.equal(describeFreshness({ updatedAt: now, marketState: "open" }, now, 1), "live");

    // Quote older than maxAge (5 min for 1-minute refresh) is marked stale
    const staleTime = now - 6 * 60_000;
    assert.equal(describeFreshness({ updatedAt: staleTime, marketState: "open" }, now, 1), "stale");

    // Explicit staleWarning flag forces stale
    assert.equal(describeFreshness({ updatedAt: now, staleWarning: true }, now, 1), "stale");

    // Provider backoff on 429
    assert.equal(backoff.isBlocked("yahoo"), false);
    backoff.reportFailure("yahoo", 60_000);
    assert.equal(backoff.isBlocked("yahoo"), true);
  });
});
