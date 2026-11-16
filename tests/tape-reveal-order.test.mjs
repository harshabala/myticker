import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Regression for the intermittent smoke failure "tape reservation went to nothing".
// The bar's text exists while it is still `visibility: hidden` and the page
// reserves nothing. The invariant users (and the smoke test) rely on: the bar
// becomes visible and the page reservation is applied in the same synchronous
// step, so a visible strip always has its space reserved.
test("revealing the tape and reserving its space happen in one synchronous step", async () => {
  const source = await readFile(new URL("../contentScript.js", import.meta.url), "utf8");
  const handler = source.match(/const onStylesSettled = \(\) => runSafely\(\(\) => \{([\s\S]*?)\n {2}\}\);/)?.[1] || "";
  assert.ok(handler, "onStylesSettled found");
  const reveal = handler.indexOf('bar.style.removeProperty("visibility")');
  const reserve = handler.indexOf("applyTapeReservation()");
  assert.ok(reveal >= 0 && reserve > reveal, "reservation is applied right after the bar is revealed");
  assert.ok(!/await|setTimeout|requestAnimationFrame|Promise|\.then\(/.test(handler), "nothing asynchronous between reveal and reservation");
  assert.match(source, /tickerBar\.style\.setProperty\("visibility", "hidden"\)/, "the bar starts hidden");
});
