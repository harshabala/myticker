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
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser"
].filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, { timeout = 10_000, interval = 150, label = "condition" } = {}) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      last = await fn();
      if (last) return last;
    } catch (error) {
      last = error;
    }
    await sleep(interval);
  }
  throw new Error(`Timed out waiting for ${label}${last instanceof Error ? `: ${last.message}` : ""}`);
}

/** Minimal CDP client over the browser websocket with flat sessions. */
class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Set();
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve: ok, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else ok(msg.result);
      } else if (msg.method) {
        this.handlers.forEach((h) => h(msg));
      }
    };
  }
  open() {
    return new Promise((ok, reject) => {
      this.ws.onopen = ok;
      this.ws.onerror = () => reject(new Error("CDP websocket failed"));
    });
  }
  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((ok, reject) => this.pending.set(id, { resolve: ok, reject }));
  }
  on(handler) {
    this.handlers.add(handler);
  }
  close() {
    this.ws.close();
  }
}

async function main() {
  const browserPath = CANDIDATES.find((p) => existsSync(p));
  if (!browserPath) {
    console.log("smoke: no Chromium-based browser found; set CHROME_PATH. Skipping.");
    return;
  }
  const outDir = process.env.SMOKE_OUT || (await mkdtemp(join(tmpdir(), "myticker-smoke-out-")));
  await mkdir(outDir, { recursive: true });
  const profile = await mkdtemp(join(tmpdir(), "myticker-smoke-profile-"));
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

  const port = 9300 + Math.floor(Math.random() * 500);
  const browser = spawn(browserPath, [
    "--headless=new",
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-sync",
    "--disable-background-networking",
    "--disable-component-update",
    "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
    `--disable-extensions-except=${ROOT}`,
    `--load-extension=${ROOT}`,
    "--window-size=1280,800",
    "about:blank"
  ], { stdio: "ignore" });

  const problems = [];
  const checks = [];
  let cdp;
  try {
    const version = await waitFor(async () => (await fetch(`http://127.0.0.1:${port}/json/version`)).json(), { label: "browser" });
    cdp = new Cdp(version.webSocketDebuggerUrl);
    await cdp.open();

    const sessionLabels = new Map();
    cdp.on((msg) => {
      const label = sessionLabels.get(msg.sessionId);
      if (!label) return;
      if (msg.method === "Runtime.exceptionThrown") {
        problems.push(`${label}: uncaught ${msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text}`);
      }
      if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
        problems.push(`${label}: console.error ${msg.params.args.map((a) => a.value ?? a.description).join(" ")}`);
      }
      if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error" && !/net::ERR_NAME_NOT_RESOLVED/.test(msg.params.entry.text)) {
        problems.push(`${label}: ${msg.params.entry.text}`);
      }
    });

    const attach = async (targetId, label) => {
      const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
      sessionLabels.set(sessionId, label);
      await cdp.send("Runtime.enable", {}, sessionId);
      await cdp.send("Log.enable", {}, sessionId).catch(() => {});
      return sessionId;
    };
    const evaluate = async (sessionId, expression) => {
      const { result, exceptionDetails } = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
      if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
      return result.value;
    };
    const openPage = async (url, label, { width = 1280, height = 800, recordLayout = false } = {}) => {
      const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
      const sessionId = await attach(targetId, label);
      await cdp.send("Page.enable", {}, sessionId);
      if (recordLayout) {
        // Every inline body margin-top the page ever gets, from document start.
        await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: `
          window.__bodyMargins = [];
          new MutationObserver(() => {
            const value = document.body?.style.getPropertyValue("margin-top");
            if (value && window.__bodyMargins[window.__bodyMargins.length - 1] !== value) window.__bodyMargins.push(value);
          }).observe(document, { attributes: true, attributeFilter: ["style"], subtree: true });` }, sessionId);
      }
      await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
      await cdp.send("Page.navigate", { url }, sessionId);
      await waitFor(() => evaluate(sessionId, "document.readyState === 'complete'"), { label: `${label} load` });
      return sessionId;
    };
    const screenshot = async (sessionId, name) => {
      const { data } = await cdp.send("Page.captureScreenshot", { format: "png" }, sessionId);
      await writeFile(join(outDir, name), Buffer.from(data, "base64"));
    };

    // The first-install Options tab and the service worker.
    const sw = await waitFor(async () => {
      const { targetInfos } = await cdp.send("Target.getTargets");
      return targetInfos.find((t) => t.type === "service_worker" && t.url.endsWith("/background.js"));
    }, { label: "service worker" });
    const extensionId = new URL(sw.url).host;
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

    // Keyboard command path: toggling off removes the tape.
    await evaluate(swSession, "chrome.storage.sync.get('pts_settings').then(d => chrome.storage.sync.set({ pts_settings: { ...(d.pts_settings || {}), enabled: false } })).then(() => true)");
    await waitFor(async () => {
      const { root } = await cdp.send("DOM.getDocument", { depth: -1, pierce: true }, page);
      return !JSON.stringify(root).includes("pts-ticker-container");
    }, { label: "tape removed after disabling" });
    checks.push("disabling the tape removes it from the page");
  } catch (error) {
    problems.push(`harness: ${error.message}`);
  } finally {
    cdp?.close();
    browser.kill();
    server.close();
    await sleep(300);
    await rm(profile, { recursive: true, force: true });
  }

  checks.forEach((c) => console.log(`  ok  ${c}`));
  problems.forEach((p) => console.log(`  FAIL ${p}`));
  console.log(`smoke: ${checks.length} checks, ${problems.length} problems; screenshots in ${outDir}`);
  if (problems.length) process.exitCode = 1;
}

main();
