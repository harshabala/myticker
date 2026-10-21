import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createChromeFake, loadBackground, send, jsonResponse } from "./helpers.mjs";

const fixture = async (name) => JSON.parse(await readFile(new URL(`../test_fixtures/providers/${name}`, import.meta.url), "utf8"));
const yahoo = await fixture("yahoo_chart_tcs_5d.json");
const coingecko = await fixture("coingecko_simple_price.json");
const finnhub = await fixture("finnhub_quote_aapl.json");
const holdings = [{ symbol: "TCS.NS", quantity: 50, currency: "INR", brokerId: "zerodha" }];
const settle = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

function routedFetch(calls) {
  return async (url) => {
    const href = String(url);
    calls.push(new URL(href).host);
    if (href.includes("finance.yahoo.com")) return jsonResponse(yahoo);
    if (href.includes("coingecko.com")) return jsonResponse(coingecko);
    if (href.includes("finnhub.io")) return jsonResponse(finnhub);
    return new Response("", { status: 404 });
  };
}

test("watchlist and crypto are polled, ordered after holdings, and kept out of portfolio P&L", async () => {
  const fake = createChromeFake({
    sync: { pts_settings: { enabled: true, cryptoConfig: { includeCrypto: true, mode: "manual", manualHoldings: [{ symbol: "bitcoin", quantity: 2 }] } } },
    local: {
      pts_holdings: holdings,
      pts_watchlist: [{ symbol: "INFY.NS", displayName: "Infosys" }, { symbol: "ethereum", assetClass: "crypto" }]
    }
  });
  const calls = [];
  globalThis.fetch = routedFetch(calls);
  await loadBackground(fake, "paths-mixed");
  assert.deepEqual(await send(fake.listeners, { type: "poll-now", payload: {} }), { ok: true });
  const state = fake.local.get("pts_positions_state");
  const kinds = state.tickerItems.map((item) => item.kind);
  assert.deepEqual([...new Set(kinds)], ["holding", "watchlist", "crypto"]);
  const symbols = state.tickerItems.map((item) => item.symbol);
  assert.ok(symbols.includes("INFY.NS") && symbols.includes("bitcoin") && symbols.includes("ethereum"), symbols.join());
  assert.ok(Math.abs(state.aggregate.dayPnl - (3556.8 - 3520) * 50) < 1e-6, "aggregate is holdings-only");
  assert.equal(state.displayCurrency, "INR");
  const bitcoin = state.tickerItems.find((item) => item.symbol === "bitcoin");
  assert.ok(Math.abs(bitcoin.dayPnl - 2 * (65000 - 65000 / 1.015)) < 1e-6, "manual crypto quantity gives a 24h P&L");
  assert.equal(state.tickerItems.find((item) => item.symbol === "ethereum").dayPnl, null, "watchlist crypto has no P&L");
  assert.ok(calls.includes("api.coingecko.com"));
  assert.ok(!calls.includes("finnhub.io"), "no Finnhub request without an unlocked key");
});

test("a disabled tape polls nothing", async () => {
  const fake = createChromeFake({ sync: { pts_settings: { enabled: false } }, local: { pts_holdings: holdings } });
  const calls = [];
  globalThis.fetch = routedFetch(calls);
  await loadBackground(fake, "paths-disabled");
  await send(fake.listeners, { type: "poll-now", payload: {} });
  assert.equal(calls.length, 0);
  assert.equal(fake.local.has("pts_positions_state"), false);
});

test("hiding stocks leaves only watchlist and crypto items, with no portfolio positions", async () => {
  const fake = createChromeFake({
    sync: { pts_settings: { enabled: true, portfolioFilters: { showStocks: false, showCrypto: true }, cryptoConfig: { includeCrypto: true, mode: "top5" } } },
    local: { pts_holdings: holdings }
  });
  globalThis.fetch = routedFetch([]);
  await loadBackground(fake, "paths-filter");
  await send(fake.listeners, { type: "poll-now", payload: {} });
  const state = fake.local.get("pts_positions_state");
  assert.equal(state.positions.length, 0);
  assert.ok(state.tickerItems.every((item) => item.kind === "crypto"));
});

test("the keyboard command toggles the tape and keeps other settings", async () => {
  const fake = createChromeFake({ sync: { pts_settings: { enabled: true, excludedSites: ["example.com"] } } });
  globalThis.fetch = routedFetch([]);
  await loadBackground(fake, "paths-command");
  fake.listeners.command("toggle-myticker");
  await settle();
  assert.equal(fake.sync.get("pts_settings").enabled, false);
  assert.deepEqual(fake.sync.get("pts_settings").excludedSites, ["example.com"]);
  fake.listeners.command("toggle-myticker");
  await settle();
  assert.equal(fake.sync.get("pts_settings").enabled, true);
  fake.listeners.command("something-else");
  await settle();
  assert.equal(fake.sync.get("pts_settings").enabled, true);
});

test("first install opens Settings, starts onboarding and schedules polling", async () => {
  const fake = createChromeFake();
  globalThis.fetch = routedFetch([]);
  await loadBackground(fake, "paths-install");
  fake.alarms.clear();
  fake.listeners.installed({ reason: "install" });
  await settle();
  assert.equal(fake.opened.optionsPage, 1);
  assert.deepEqual(fake.local.get("pts_onboarding"), { firstInstall: true, wizardStep: 1, setupComplete: false });
  assert.equal(fake.alarms.get("price-poll").periodInMinutes, 1);

  fake.listeners.installed({ reason: "update" });
  await settle();
  assert.equal(fake.opened.optionsPage, 1, "updates do not reopen Settings");
});

test("a quota error prunes price history to the last 5 minutes and retries the write", async () => {
  const now = Date.now();
  const history = { "TCS.NS": [{ t: now - 60 * 60_000, p: 3400 }, { t: now - 60_000, p: 3500 }] };
  const fake = createChromeFake({ sync: { pts_settings: { enabled: true } }, local: { pts_holdings: holdings, pts_price_history: history } });
  let failures = 0;
  fake.hooks.beforeSet = async (values) => {
    if ("pts_positions_state" in values && failures++ === 0) throw new Error("QUOTA_BYTES quota exceeded");
  };
  globalThis.fetch = routedFetch([]);
  await loadBackground(fake, "paths-prune");
  assert.deepEqual(await send(fake.listeners, { type: "poll-now", payload: {} }), { ok: true });
  assert.equal(failures, 2, "one failed write, one retry");
  const kept = fake.local.get("pts_price_history")["TCS.NS"];
  assert.ok(kept.every((snapshot) => snapshot.t >= now - 5 * 60_000), "hour-old snapshot pruned");
  assert.ok(fake.local.get("pts_positions_state").positions.length === 1);
});
