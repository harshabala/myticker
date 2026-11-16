#!/usr/bin/env node
// Browser smoke test: loads the unpacked extension in a real Chromium browser
// and checks the options page, popup and Ticker Tape render without errors.
//
// Network is closed: every host except 127.0.0.1 is unresolvable, and the
// service worker's fetch is replaced with test_fixtures/providers responses,
// so no real provider API is ever called. Uses a throwaway profile.
//
//   CHROME_PATH=/path/to/chromium npm run smoke
//
// Branded Google Chrome 137+ ignores --load-extension; use Chromium, Chrome
// for Testing, or Brave. Screenshots go to SMOKE_OUT (default: a temp dir).
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSessionHelpers, findBrowser, launchBrowser, serveDirectory, sleep, waitFor } from "./lib/browser.mjs";
import { compareToKnown, runLayoutChecks, summarise } from "./check-layout.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

async function main() {
  const browserPath = findBrowser();
  if (!browserPath) {
    console.log("smoke: no Chromium-based browser found; set CHROME_PATH. Skipping.");
    // In CI a missing browser is a broken setup, not a pass.
    if (process.env.CI) process.exitCode = 1;
    return;
  }
  const outDir = process.env.SMOKE_OUT || (await mkdtemp(join(tmpdir(), "myticker-smoke-out-")));
  await mkdir(outDir, { recursive: true });
  const fixtures = {
    yahoo: await readFile(join(ROOT, "test_fixtures/providers/yahoo_chart_tcs_5d.json"), "utf8"),
    finnhub: await readFile(join(ROOT, "test_fixtures/providers/finnhub_quote_aapl.json"), "utf8"),
    coingecko: await readFile(join(ROOT, "test_fixtures/providers/coingecko_simple_price.json"), "utf8")
  };

  const server = createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("<!doctype html><title>Smoke host page</title><body style='font:16px system-ui;margin:0'><main><h1>Host page</h1><p>Content below the tape.</p></main></body>");
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const pageUrl = `http://127.0.0.1:${server.address().port}/`;

  const problems = [];
  const checks = [];
  let launched;
  try {
    launched = await launchBrowser({ browserPath, extensionDir: ROOT });
    const { cdp } = launched;
    const helpers = createSessionHelpers(cdp, { onProblem: (p) => problems.push(p) });
    const { attach, evaluate, findServiceWorker } = helpers;
    const openPage = async (url, label, { width = 1280, height = 800, recordLayout = false } = {}) => {
      // Every inline body margin-top the page ever gets, from document start.
      const initScript = recordLayout ? `
          window.__bodyMargins = [];
          new MutationObserver(() => {
            const value = document.body?.style.getPropertyValue("margin-top");
            if (value && window.__bodyMargins[window.__bodyMargins.length - 1] !== value) window.__bodyMargins.push(value);
          }).observe(document, { attributes: true, attributeFilter: ["style"], subtree: true });` : undefined;
      return (await helpers.openPage(url, label, { width, height, initScript })).sessionId;
    };
    const screenshot = async (sessionId, name) => {
      const { data } = await cdp.send("Page.captureScreenshot", { format: "png" }, sessionId);
      await writeFile(join(outDir, name), Buffer.from(data, "base64"));
    };

    // The first-install Options tab and the service worker.
    const { sw, extensionId } = await findServiceWorker();
    const swSession = await attach(sw.targetId, "service worker");

    // Fixture-backed fetch in the worker: no real provider is ever called.
    await evaluate(swSession, `(() => {
      const fixtures = ${JSON.stringify(fixtures)};
      globalThis.__smokeRequests = [];
      globalThis.fetch = async (url) => {
        const href = String(url);
        globalThis.__smokeRequests.push(new URL(href).host);
        const body = href.includes("finance.yahoo.com") ? fixtures.yahoo
          : href.includes("finnhub.io") ? fixtures.finnhub
          : href.includes("coingecko.com") ? fixtures.coingecko : null;
        return body ? new Response(body, { status: 200, headers: { "content-type": "application/json" } }) : new Response("", { status: 404 });
      };
      return true;
    })()`);
    // Options page on first install (empty state).
    const options = await openPage(`chrome-extension://${extensionId}/options.html`, "options");
    await sleep(800);
    const optionsTitle = await evaluate(options, "document.title");
    checks.push(`options loads ("${optionsTitle}")`);
    const leakedHidden = (page) => evaluate(page, "[...document.querySelectorAll('[hidden]')].filter((el) => getComputedStyle(el).display !== 'none').map((el) => el.id || el.className)");
    const optionsLeaks = await leakedHidden(options);
    if (optionsLeaks.length) problems.push(`options: [hidden] elements still displayed: ${optionsLeaks.join(", ")}`);
    await screenshot(options, "options-first-run.png");

    // Popup before setup: checklist.
    const popupEmpty = await openPage(`chrome-extension://${extensionId}/popup.html`, "popup (empty)", { width: 380, height: 600 });
    const emptyText = await waitFor(async () => {
      const text = await evaluate(popupEmpty, "document.body.innerText");
      return text && !/Loading…/.test(text) ? text : null;
    }, { label: "popup checklist" });
    if (!/import|holdings/i.test(emptyText)) problems.push("popup (empty): no setup checklist step for holdings");
    else checks.push("popup shows the setup checklist before import");
    await screenshot(popupEmpty, "popup-checklist.png");

    // Golden path: import the sample Zerodha CSV through the Settings file input.
    const { root: optionsRoot } = await cdp.send("DOM.getDocument", {}, options);
    const { nodeId: fileInput } = await cdp.send("DOM.querySelector", { nodeId: optionsRoot.nodeId, selector: "#csvFile" }, options);
    await cdp.send("DOM.setFileInputFiles", { nodeId: fileInput, files: [join(ROOT, "test_fixtures/sample_holdings_zerodha.csv")] }, options);
    const imported = await waitFor(async () => {
      const data = await evaluate(swSession, "chrome.storage.local.get('pts_holdings')");
      return data?.pts_holdings?.length ? data.pts_holdings : null;
    }, { label: "holdings imported from CSV" });
    if (!imported.every((h) => h.symbol.endsWith(".NS"))) problems.push("options: Zerodha import did not append .NS");
    else checks.push(`Settings imports the sample Zerodha CSV (${imported.length} holdings, .NS appended)`);
    await sleep(500);
    await screenshot(options, "options-after-import.png");

    // Diagnostics report: rendered from storage, counts only.
    await evaluate(options, "document.getElementById('refreshDiagnosticsButton')?.click(), true");
    const report = await waitFor(async () => {
      const text = await evaluate(options, "document.getElementById('diagnosticsOutput')?.textContent || ''");
      return /Holdings: 5/.test(text) ? text : null;
    }, { label: "diagnostics report" });
    if (/TCS|RELIANCE|HDFCBANK/.test(report)) problems.push("options: diagnostics report contains holding symbols");
    else checks.push("Settings diagnostics report shows counts and no symbols");
    const state = await waitFor(async () => {
      const data = await evaluate(swSession, "chrome.storage.local.get('pts_positions_state')");
      return data?.pts_positions_state?.positions?.length ? data.pts_positions_state : null;
    }, { label: "positions state after poll" });
    const tcs = state.positions.find((p) => p.symbol === "TCS.NS");
    if (!tcs || Math.abs(tcs.dayPnl - (3556.8 - 3520) * 50) > 1e-6) problems.push(`worker: unexpected TCS day P&L ${tcs?.dayPnl}`);
    else checks.push(`worker poll writes P&L from fixtures (TCS day P&L ${tcs.dayPnl.toFixed(2)} INR)`);
    const hosts = await evaluate(swSession, "[...new Set(globalThis.__smokeRequests)]");
    checks.push(`worker requested only: ${hosts.join(", ") || "(none)"}`);

    // Popup scoreboard.
    const popup = await openPage(`chrome-extension://${extensionId}/popup.html`, "popup", { width: 380, height: 600 });
    const popupText = await waitFor(async () => {
      const text = await evaluate(popup, "document.body.innerText");
      return /₹/.test(text) ? text : null;
    }, { label: "popup P&L" });
    const popupLeaks = await leakedHidden(popup);
    if (popupLeaks.length) problems.push(`popup: [hidden] elements still displayed: ${popupLeaks.join(", ")}`);
    if (!/TCS/.test(popupText)) problems.push("popup: TCS mover missing");
    else checks.push("popup scoreboard shows INR day P&L and TCS");
    await screenshot(popup, "popup-scoreboard.png");

    // Ticker Tape on an ordinary web page.
    const page = await openPage(pageUrl, "web page", { recordLayout: true });
    const tape = await waitFor(async () => {
      const { root } = await cdp.send("DOM.getDocument", { depth: -1, pierce: true }, page);
      const flat = [];
      const walk = (node) => {
        flat.push(node);
        (node.children || []).forEach(walk);
        (node.shadowRoots || []).forEach(walk);
      };
      walk(root);
      const host = flat.find((n) => n.attributes && n.attributes.includes("pts-ticker-container"));
      if (!host) return null;
      const text = flat.filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join(" ");
      return /TCS/.test(text) ? { text } : null;
    }, { label: "ticker tape with TCS", timeout: 15_000 }).catch(async (error) => {
      await screenshot(page, "tape-missing.png");
      const status = await evaluate(swSession, "chrome.storage.local.get('pts_content_script_status')");
      throw new Error(`${error.message}; content script status ${JSON.stringify(status.pts_content_script_status || null)}`);
    });
    checks.push(`tape mounted on a web page (${tape.text.match(/TCS/g).length} TCS label(s))`);
    // The page must be pushed down by the tape, not covered by it.
    // The page must be pushed down by the tape's height, never by an unstyled
    // (stacked, hundreds of px tall) tape while ticker.css is still loading.
    const margins = await evaluate(page, "window.__bodyMargins");
    const tallest = Math.max(0, ...margins.map((m) => parseFloat(m)));
    if (!margins.length || tallest > 120) problems.push(`web page: tape reservation went to ${margins.join(" -> ") || "nothing"}`);
    else checks.push(`page content pushed below the tape without a jump (${margins.join(" -> ")})`);
    await screenshot(page, "tape-on-page.png");

    // Crypto with a quantity: its own 24h P&L on the tape, not in the total.
    await evaluate(swSession, `chrome.storage.sync.get('pts_settings').then((d) => chrome.storage.sync.set({ pts_settings: { ...(d.pts_settings || {}), enabled: true, cryptoConfig: { includeCrypto: true, mode: "manual", manualHoldings: [{ symbol: "bitcoin", quantity: 2 }] } } })).then(() => chrome.alarms.create("price-poll", { when: Date.now() })).then(() => true)`);
    const cryptoText = await waitFor(async () => {
      const { root } = await cdp.send("DOM.getDocument", { depth: -1, pierce: true }, page);
      const text = [];
      const walk = (node) => {
        if (node.nodeType === 3) text.push(node.nodeValue);
        (node.children || []).forEach(walk);
        (node.shadowRoots || []).forEach(walk);
      };
      walk(root);
      const joined = text.join(" ");
      return /24h p&l \+\$1,921\.18/.test(joined) ? joined : null;
    }, { label: "crypto 24h P&L on the tape", timeout: 15_000 });
    const after = await evaluate(swSession, "chrome.storage.local.get('pts_positions_state')");
    if (Math.abs(after.pts_positions_state.aggregate.dayPnl - state.aggregate.dayPnl) > 1e-6) problems.push("crypto P&L changed the portfolio total");
    else checks.push(`tape shows bitcoin's 24h P&L in USD (${cryptoText.match(/24h p&l \S+/)[0]}), total unchanged`);
    await screenshot(page, "tape-with-crypto.png");

    // Keyboard command path: toggling off removes the tape.
    await evaluate(swSession, "chrome.storage.sync.get('pts_settings').then(d => chrome.storage.sync.set({ pts_settings: { ...(d.pts_settings || {}), enabled: false } })).then(() => true)");
    await waitFor(async () => {
      const { root } = await cdp.send("DOM.getDocument", { depth: -1, pierce: true }, page);
      return !JSON.stringify(root).includes("pts-ticker-container");
    }, { label: "tape removed after disabling" });
    checks.push("disabling the tape removes it from the page");

    // Layout: every fixture, strip on versus off. Known failures are listed in
    // test_fixtures/layout/known-failures.json; a new failure, or one that has
    // been fixed but not removed from the list, fails the smoke test.
    const fixtureServer = await serveDirectory(join(ROOT, "test_fixtures/layout"));
    try {
      const run = await runLayoutChecks({ cdp, helpers, swSession, baseUrl: fixtureServer.url });
      const { failureKeys, lines } = summarise(run);
      const { unexpected, fixed } = await compareToKnown(failureKeys);
      unexpected.forEach((k) => problems.push(`layout: new failure ${k}`));
      fixed.forEach((k) => problems.push(`layout: ${k} now passes; remove it from test_fixtures/layout/known-failures.json`));
      if (unexpected.length || fixed.length) lines.forEach((l) => console.log(`       ${l}`));
      checks.push(`layout check on ${run.cases.length} fixtures: ${failureKeys.length} known failure(s), none new`);
    } finally {
      fixtureServer.close();
    }
  } catch (error) {
    problems.push(`harness: ${error.message}`);
  } finally {
    await launched?.close();
    server.close();
  }

  checks.forEach((c) => console.log(`  ok  ${c}`));
  problems.forEach((p) => console.log(`  FAIL ${p}`));
  console.log(`smoke: ${checks.length} checks, ${problems.length} problems; screenshots in ${outDir}`);
  if (problems.length) process.exitCode = 1;
}

main();
