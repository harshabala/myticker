import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

// contentScript.js is a classic script; evaluate its gate function alone.
const source = await readFile(new URL("../contentScript.js", import.meta.url), "utf8");
const fn = source.match(/function shouldShowTape\([\s\S]*?\n}\n/)?.[0];

function gate(excluded = []) {
  const context = {
    location: { hostname: "example.com" },
    isHostTapeExcluded: (host, list) => Array.isArray(list) && list.includes(host),
    tickerSettings: undefined,
    excluded
  };
  vm.runInNewContext(`${fn}; this.shouldShowTape = shouldShowTape;`, context);
  return context.shouldShowTape;
}

// Regression: settings are only written when the user saves something in
// Settings. A fresh install that imports Indian holdings (no Finnhub key)
// never writes pts_settings, so the tape must follow DEFAULT_SETTINGS
// (enabled), like the worker and the popup do.
test("the tape shows with no saved settings, matching the enabled-by-default worker", () => {
  assert.ok(fn, "shouldShowTape found in contentScript.js");
  const shouldShowTape = gate();
  assert.equal(shouldShowTape(undefined), true);
  assert.equal(shouldShowTape(null), true);
  assert.equal(shouldShowTape({}), true);
});

test("the tape stays hidden when turned off or the site is excluded", () => {
  const shouldShowTape = gate();
  assert.equal(shouldShowTape({ enabled: false }), false);
  assert.equal(shouldShowTape({ enabled: true, excludedSites: ["example.com"] }), false);
});
