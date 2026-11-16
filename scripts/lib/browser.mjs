// Shared browser harness for the smoke test and the layout check: finds a
// Chromium-based browser, launches it with the unpacked extension and a
// throwaway profile, and drives it over the DevTools protocol.
//
// Network is closed: every host except 127.0.0.1 is unresolvable. Branded
// Google Chrome 137+ ignores --load-extension; use Chromium, Chrome for
// Testing, or Brave (set CHROME_PATH).
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";

export const CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser"
].filter(Boolean);

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function findBrowser() {
  return CANDIDATES.find((p) => existsSync(p));
}

export async function waitFor(fn, { timeout = 10_000, interval = 150, label = "condition" } = {}) {
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
export class Cdp {
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

/**
 * Launch the browser with `extensionDir` loaded. Returns the CDP connection and
 * a `close()` that kills the browser and removes the throwaway profile.
 */
export async function launchBrowser({ browserPath, extensionDir, width = 1280, height = 800 }) {
  const profile = await mkdtemp(join(tmpdir(), "myticker-profile-"));
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
    `--disable-extensions-except=${extensionDir}`,
    `--load-extension=${extensionDir}`,
    `--window-size=${width},${height}`,
    // CI runners (Ubuntu 24 AppArmor) block the namespace sandbox; the
    // throwaway profile only ever loads this repo and 127.0.0.1.
    ...(process.env.CI ? ["--no-sandbox"] : []),
    "about:blank"
  ], { stdio: "ignore" });
  const version = await waitFor(async () => (await fetch(`http://127.0.0.1:${port}/json/version`)).json(), { label: "browser" });
  const cdp = new Cdp(version.webSocketDebuggerUrl);
  await cdp.open();
  return {
    cdp,
    browser,
    async close() {
      cdp.close();
      browser.kill();
      await sleep(300);
      await rm(profile, { recursive: true, force: true });
    }
  };
}

/** Session helpers shared by the smoke test and the layout check. */
export function createSessionHelpers(cdp, { onProblem = () => {} } = {}) {
  const sessionLabels = new Map();
  cdp.on((msg) => {
    const label = sessionLabels.get(msg.sessionId);
    if (!label) return;
    if (msg.method === "Runtime.exceptionThrown") {
      onProblem(`${label}: uncaught ${msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text}`);
    }
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
      onProblem(`${label}: console.error ${msg.params.args.map((a) => a.value ?? a.description).join(" ")}`);
    }
    if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error" && !/net::ERR_NAME_NOT_RESOLVED/.test(msg.params.entry.text)) {
      onProblem(`${label}: ${msg.params.entry.text}`);
    }
  });
  const attach = async (targetId, label) => {
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    sessionLabels.set(sessionId, label);
    await cdp.send("Runtime.enable", {}, sessionId);
    await cdp.send("Log.enable", {}, sessionId).catch(() => {});
    return sessionId;
  };
  const evaluate = async (sessionId, expression, { userGesture = false } = {}) => {
    const { result, exceptionDetails } = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture }, sessionId);
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
    return result.value;
  };
  const openPage = async (url, label, { width = 1280, height = 800, initScript } = {}) => {
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const sessionId = await attach(targetId, label);
    await cdp.send("Page.enable", {}, sessionId);
    if (initScript) await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: initScript }, sessionId);
    await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
    await cdp.send("Page.navigate", { url }, sessionId);
    await waitFor(() => evaluate(sessionId, "document.readyState === 'complete'"), { label: `${label} load` });
    return { sessionId, targetId };
  };
  const closePage = (targetId) => cdp.send("Target.closeTarget", { targetId }).catch(() => {});
  const findServiceWorker = async () => {
    const sw = await waitFor(async () => {
      const { targetInfos } = await cdp.send("Target.getTargets");
      return targetInfos.find((t) => t.type === "service_worker" && t.url.endsWith("/background.js"));
    }, { label: "service worker" });
    return { sw, extensionId: new URL(sw.url).host };
  };
  return { attach, evaluate, openPage, closePage, findServiceWorker };
}

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json" };

/** Static server for a directory, on 127.0.0.1 only. */
export async function serveDirectory(dir) {
  const base = resolve(dir);
  const server = createServer(async (req, res) => {
    if (req.url === "/favicon.ico") { res.writeHead(204); res.end(); return; }
    try {
      const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^[/\\]+/, "");
      const file = resolve(base, path || "index.html");
      if (!file.startsWith(base)) throw new Error("outside root");
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

/**
 * Resolves once the strip is rendered AND visible (its stylesheet has loaded;
 * until then the bar is `visibility: hidden` and the page reserves nothing).
 * Returns { top, height } of the bar's border box.
 */
export async function waitForVisibleStrip(cdp, sessionId, { timeout = 15_000 } = {}) {
  await cdp.send("DOM.enable", {}, sessionId).catch(() => {});
  await cdp.send("CSS.enable", {}, sessionId).catch(() => {});
  return waitFor(async () => {
    const { root } = await cdp.send("DOM.getDocument", { depth: -1, pierce: true }, sessionId);
    let bar = null;
    const walk = (node) => {
      const attrs = node.attributes || [];
      const i = attrs.indexOf("class");
      if (i >= 0 && attrs[i + 1].split(/\s+/).includes("pts-ticker-bar")) bar = node;
      (node.children || []).forEach(walk);
      (node.shadowRoots || []).forEach(walk);
    };
    walk(root);
    if (!bar) return null;
    const { computedStyle } = await cdp.send("CSS.getComputedStyleForNode", { nodeId: bar.nodeId }, sessionId);
    if (computedStyle.find((p) => p.name === "visibility")?.value !== "visible") return null;
    const { model } = await cdp.send("DOM.getBoxModel", { nodeId: bar.nodeId }, sessionId);
    const height = model.border[7] - model.border[1];
    return height > 0 ? { top: model.border[1], height } : null;
  }, { label: "visible strip", timeout, interval: 50 });
}
