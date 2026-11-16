#!/usr/bin/env node
// Layout check: loads the real unpacked extension on each local fixture in
// test_fixtures/layout/ and measures, with the strip on and off:
//   overlap   a painted element whose box sits under the strip (at load; after
//             scrolling and sticking, only elements pinned to the window)
//   cutoff    a pinned element pushed past the bottom of the window
//   shift     any change other than a uniform downward shift by the strip height
//   anchor    an in-page anchor target landing under the strip
//   fullscreen / print   the strip hides and the page returns to its own layout
//   restore   every element returns to its exact original attributes and
//             computed styles once the strip is turned off
//   perf      time to absorb a burst of 1,000 DOM mutations
// No holdings are loaded: the strip shows its empty state, so nothing
// sensitive is ever measured or captured.
//
//   npm run check:layout [-- --fixture id] [--json out.json] [--content-script file]
//   --ratchet  pass when failures equal test_fixtures/layout/known-failures.json
import { cp, mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSessionHelpers, findBrowser, launchBrowser, serveDirectory, sleep, waitFor } from "./lib/browser.mjs";
import { PROBE_SOURCE } from "./lib/layout-probe.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const FIXTURES = join(ROOT, "test_fixtures/layout");
const KNOWN = join(FIXTURES, "known-failures.json");
export const PERF_BUDGET = { absoluteMs: 400, overheadMs: 150 };
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;

async function stripBox(cdp, session) {
  const { root } = await cdp.send("DOM.getDocument", { depth: -1, pierce: true }, session);
  let found = null;
  const walk = (node) => {
    const attrs = node.attributes || [];
    const i = attrs.indexOf("class");
    if (i >= 0 && attrs[i + 1].split(/\s+/).includes("pts-ticker-bar")) found = node;
    (node.children || []).forEach(walk);
    (node.shadowRoots || []).forEach(walk);
    if (node.contentDocument) walk(node.contentDocument);
  };
  walk(root);
  if (!found) return null;
  try {
    const { model } = await cdp.send("DOM.getBoxModel", { nodeId: found.nodeId }, session);
    const q = model.border;
    const box = { top: Math.min(q[1], q[3]), height: q[7] - q[1] };
    return box.height > 0 ? box : null;
  } catch {
    return null;
  }
}

const toMap = (obj) => new Map(Object.entries(obj));

function pinnedSet(stage) {
  const pinned = new Set();
  const moved = stage.b.sy - stage.a.sy >= 30;
  for (const [k, a] of Object.entries(stage.a.els)) {
    const b = stage.b.els[k];
    if (b && moved && near(a.t, b.t, 0.5)) pinned.add(k);
  }
  return pinned;
}
const insideAny = (k, set) => { for (const p of set) if (k.startsWith(`${p}>`) || k.startsWith(`${p}::shadow`)) return true; return false; };
const short = (k) => k.replace(/^html>body\[1\]>?/, "");

/** Failures for one stage, comparing the strip-on sample with the strip-off one. */
function analyseStage(name, y, off, on, H) {
  const out = [];
  const offPinned = pinnedSet(off);
  const onPinned = pinnedSet(on);
  const vh = on.a.vh;
  const onEls = on.a.els;
  const offEls = off.a.els;

  const overlaps = Object.entries(onEls).filter(([k, e]) =>
    e.painted && e.visible && e.t < H - 1 && e.b > 0.5 && (y === 0 || onPinned.has(k)));
  if (overlaps.length) out.push({ id: `overlap@${name}`, detail: `${overlaps.length} element(s) under the strip, e.g. ${overlaps.slice(0, 3).map(([k, e]) => `${short(k)} top=${e.t.toFixed(1)}`).join("; ")}` });

  const cut = Object.entries(onEls).filter(([k, e]) => {
    const o = offEls[k];
    return o && e.painted && e.visible && (onPinned.has(k) || offPinned.has(k) || insideAny(k, offPinned)) && e.b > vh + 0.5 && o.b <= vh + 0.5;
  });
  if (cut.length) out.push({ id: `cutoff@${name}`, detail: `${cut.length} pinned element(s) cut off at the bottom, e.g. ${cut.slice(0, 3).map(([k, e]) => `${short(k)} bottom=${e.b.toFixed(1)} (window ${vh})`).join("; ")}` });

  const bad = [];
  for (const [k, o] of toMap(offEls)) {
    const n = onEls[k];
    if (!n) { bad.push(`${short(k)} missing with the strip on`); continue; }
    const dy = n.t - o.t, dh = n.h - o.h;
    let ok;
    if (!near(n.l, o.l) || !near(n.w, o.w)) ok = false;
    else if (offPinned.has(k)) ok = (near(dy, H) && (near(dh, 0) || near(dh, -H))) || (near(o.b, vh) && near(dy, 0) && near(dh, 0));
    else if (insideAny(k, offPinned)) ok = dy >= -0.5 && dy <= H + 0.5 && dh >= -H - 0.5 && dh <= 0.5;
    else ok = near(dy, H) && near(dh, 0);
    if (!ok) bad.push(`${short(k)} moved ${dy.toFixed(1)}px, resized ${dh.toFixed(1)}px (expected ${H.toFixed(1)}px down)`);
  }
  for (const k of Object.keys(onEls)) if (!offEls[k]) bad.push(`${short(k)} only exists with the strip on`);
  if (bad.length) out.push({ id: `shift@${name}`, detail: `${bad.length} element(s) not a uniform shift, e.g. ${bad.slice(0, 3).join("; ")}` });
  return out;
}

function diffSnapshots(a, b) {
  const diffs = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!a[k] || !b[k]) { diffs.push(`${short(k)} ${a[k] ? "removed" : "added"}`); continue; }
    if (a[k].attrs !== b[k].attrs) diffs.push(`${short(k)} attributes: [${a[k].attrs}] -> [${b[k].attrs}]`);
    const pa = new Map(a[k].css.split(";").map((s) => [s.slice(0, s.indexOf(":")), s.slice(s.indexOf(":") + 1)]));
    for (const s of b[k].css.split(";")) {
      const p = s.slice(0, s.indexOf(":")), v = s.slice(s.indexOf(":") + 1);
      if (pa.get(p) !== v) diffs.push(`${short(k)} ${p}: ${pa.get(p)} -> ${v}`);
    }
  }
  return diffs;
}

function sampleDiff(a, b, expectShift = 0) {
  return Object.entries(a.els).filter(([k, e]) => !b.els[k] || !near(b.els[k].t - e.t, expectShift) || !near(b.els[k].h, e.h)).map(([k]) => k);
}

export async function runLayoutChecks({ cdp, helpers, swSession, baseUrl, only, log = () => {} }) {
  const config = JSON.parse(await readFile(join(FIXTURES, "cases.json"), "utf8"));
  const cases = config.cases.filter((c) => !only || c.id === only);
  const { evaluate, openPage, closePage } = helpers;
  const setEnabled = (enabled) => evaluate(swSession, `chrome.storage.sync.set({ pts_settings: { enabled: ${enabled} } }).then(() => true)`);
  const emulate = (session, media) => cdp.send("Emulation.setEmulatedMedia", { media }, session);
  const open = async (c) => {
    const page = await openPage(`${baseUrl}/${c.file}`, c.id, { width: config.viewport.width, height: config.viewport.height });
    await evaluate(page.sessionId, PROBE_SOURCE);
    await sleep(700);
    return page;
  };
  const probe = (s, expr) => evaluate(s, `window.__layoutProbe.${expr}`);
  const runStages = async (s, c) => {
    const stages = {};
    for (const st of config.stages) stages[st.name] = { y: st.scrollY, ...(await probe(s, `measureStage(${st.scrollY})`)) };
    if (c.actions) {
      for (const action of c.actions) { await evaluate(s, action); await probe(s, "settle(400)"); }
      stages["after-actions"] = { y: 0, ...(await probe(s, "measureStage(0)")) };
    }
    return stages;
  };

  // Phase 1: strip off. The reference layout.
  const off = {};
  await setEnabled(false);
  for (const c of cases) {
    const page = await open(c);
    const s = page.sessionId;
    off[c.id] = { stages: await runStages(s, c), snapshot: await probe(s, "snapshot()") };
    if (c.print) {
      await emulate(s, "print"); await probe(s, "settle(300)");
      off[c.id].print = await probe(s, "sample()");
      await emulate(s, "");
    }
    if (c.id === "fixed-header") {
      const runs = [];
      for (let i = 0; i < 5; i++) runs.push((await probe(s, "burst()")).ms);
      off.perf = runs.sort((a, b) => a - b)[2];
    }
    await closePage(page.targetId);
  }

  // Phase 2: strip on.
  const results = {};
  const metrics = {};
  await setEnabled(true);
  for (const c of cases) {
    const failures = [];
    results[c.id] = failures;
    const page = await open(c);
    const s = page.sessionId;
    let box;
    try {
      box = await waitFor(async () => { const b = await stripBox(cdp, s); return b && near(b.top, 0, 0.5) ? b : null; }, { label: "strip box", timeout: 8000 });
    } catch { failures.push({ id: "strip", detail: "strip did not mount" }); await closePage(page.targetId); continue; }
    await sleep(500);
    const H = box.height;
    metrics[c.id] = { stripHeight: H };
    const stages = await runStages(s, c);
    for (const [name, st] of Object.entries(stages)) failures.push(...analyseStage(name, st.y, off[c.id].stages[name], st, H));

    for (const hash of c.anchors || []) {
      await evaluate(s, `location.hash = ${JSON.stringify(hash)}`);
      await probe(s, "settle(400)");
      const top = await evaluate(s, `document.querySelector(${JSON.stringify(hash)}).getBoundingClientRect().top`);
      if (top < H - 0.5) failures.push({ id: `anchor@${hash}`, detail: `target lands at ${top.toFixed(1)}px, under the ${H.toFixed(1)}px strip` });
    }
    if (c.anchors) { await evaluate(s, "history.replaceState(null, '', location.pathname)"); await probe(s, "settle(100)"); }

    if (c.fullscreen) {
      const isHidden = async () => { const b = await stripBox(cdp, s); return !b; };
      const reserved = () => evaluate(s, "document.documentElement.style.getPropertyValue('--myticker-tape-reservation') || document.body.style.getPropertyValue('margin-top')");
      let detail = "";
      try {
        await evaluate(s, `document.querySelector(${JSON.stringify(c.fullscreen)}).requestFullscreen().then(() => true)`, { userGesture: true });
        await waitFor(() => evaluate(s, "!!document.fullscreenElement"), { label: "fullscreen", timeout: 4000 });
        await sleep(500);
        if (!(await isHidden())) detail += "strip still visible in fullscreen; ";
        if (await reserved()) detail += `page still reserves space in fullscreen (${await reserved()}); `;
        await evaluate(s, "document.exitFullscreen().then(() => true)");
        await waitFor(() => evaluate(s, "!document.fullscreenElement"), { label: "exit fullscreen", timeout: 4000 });
        await sleep(600);
        if (await isHidden()) detail += "strip did not come back after fullscreen; ";
        else if (!(await reserved())) detail += "reservation not restored after fullscreen; ";
      } catch (error) { detail += `fullscreen could not be exercised: ${error.message}; `; }
      if (detail) failures.push({ id: "fullscreen", detail: detail.trim() });
    }

    if (c.print) {
      await emulate(s, "print"); await probe(s, "settle(400)");
      let detail = "";
      if (await stripBox(cdp, s)) detail += "strip still visible when printing; ";
      const printed = await probe(s, "sample()");
      const diff = sampleDiff(off[c.id].print, printed);
      if (diff.length) detail += `${diff.length} element(s) differ from the strip-off print layout, e.g. ${diff.slice(0, 3).map(short).join(", ")}; `;
      await emulate(s, ""); await probe(s, "settle(500)");
      if (!(await stripBox(cdp, s))) detail += "strip did not return after printing; ";
      if (detail) failures.push({ id: "print", detail: detail.trim() });
    }

    if (c.id === "fixed-header") {
      const runs = [];
      let tops = [];
      for (let i = 0; i < 5; i++) { const r = await probe(s, "burst()"); runs.push(r.ms); tops = r.tops; }
      const median = runs.sort((a, b) => a - b)[2];
      metrics.perf = { onMs: median, offMs: off.perf, budget: PERF_BUDGET };
      if (median > PERF_BUDGET.absoluteMs || median - off.perf > PERF_BUDGET.overheadMs) failures.push({ id: "perf", detail: `1,000-mutation burst took ${median.toFixed(0)}ms (off ${off.perf.toFixed(0)}ms); budget ${PERF_BUDGET.absoluteMs}ms, overhead ${PERF_BUDGET.overheadMs}ms` });
      if (tops.some((t) => !near(t, H, 0.5))) failures.push({ id: "burst-shift", detail: `new fixed elements added in a burst were not shifted (tops ${[...new Set(tops.map((t) => t.toFixed(1)))].join(",")}, strip ${H.toFixed(1)})` });
    }

    // Restore: turn the strip off, and every element must match the strip-off run.
    await setEnabled(false);
    await waitFor(async () => !(await stripBox(cdp, s)), { label: "strip removed", timeout: 5000 }).catch(() => {});
    await probe(s, "settle(500)");
    const after = await probe(s, "snapshot()");
    const diffs = diffSnapshots(off[c.id].snapshot, after);
    if (diffs.length) failures.push({ id: "restore", detail: `${diffs.length} difference(s) after turning the strip off, e.g. ${diffs.slice(0, 4).join("; ")}` });
    await setEnabled(true);
    await closePage(page.targetId);
    log(`  ${c.id}: ${failures.length ? failures.map((f) => f.id).join(", ") : "clean"}`);
  }
  await setEnabled(true);
  return { results, metrics, cases };
}

export function summarise(run) {
  const failureKeys = [];
  const lines = [];
  for (const c of run.cases) {
    const fails = run.results[c.id] || [];
    lines.push(`${c.id.padEnd(24)} ${fails.length ? `${fails.length} failure(s): ${fails.map((f) => f.id).join(", ")}` : "clean"}`);
    for (const f of fails) { failureKeys.push(`${c.id}:${f.id}`); lines.push(`    ${f.id}: ${f.detail}`); }
  }
  return { failureKeys, lines };
}

export async function compareToKnown(failureKeys) {
  let known = [];
  try { known = JSON.parse(await readFile(KNOWN, "utf8")); } catch { /* none yet */ }
  return {
    unexpected: failureKeys.filter((k) => !known.includes(k)),
    fixed: known.filter((k) => !failureKeys.includes(k))
  };
}

async function prepareExtension(contentScript) {
  if (!contentScript) return ROOT;
  const dir = await mkdtemp(join(tmpdir(), "myticker-ext-"));
  for (const f of readdirSync(ROOT)) if (/\.(js|json|css|html)$/.test(f) && f !== "package-lock.json") await cp(join(ROOT, f), join(dir, f));
  await cp(join(ROOT, "icons"), join(dir, "icons"), { recursive: true });
  await cp(resolve(contentScript), join(dir, "contentScript.js"));
  return dir;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const browserPath = findBrowser();
  if (!browserPath) {
    console.log("check:layout: no Chromium-based browser found; set CHROME_PATH.");
    process.exitCode = process.env.CI ? 1 : 0;
    return;
  }
  const extensionDir = await prepareExtension(opt("--content-script"));
  const server = await serveDirectory(FIXTURES);
  const problems = [];
  const launched = await launchBrowser({ browserPath, extensionDir });
  try {
    const helpers = createSessionHelpers(launched.cdp, { onProblem: (p) => problems.push(p) });
    const { sw } = await helpers.findServiceWorker();
    const swSession = await helpers.attach(sw.targetId, "service worker");
    const run = await runLayoutChecks({ cdp: launched.cdp, helpers, swSession, baseUrl: server.url, only: opt("--fixture"), log: console.log });
    const { failureKeys, lines } = summarise(run);
    console.log(lines.join("\n"));
    console.log(`\nlayout check: ${failureKeys.length} failure(s) across ${run.cases.length} fixture(s)`);
    if (run.metrics.perf) console.log(`burst of 1,000 mutations: ${run.metrics.perf.onMs.toFixed(0)}ms with the strip, ${run.metrics.perf.offMs.toFixed(0)}ms without`);
    if (opt("--json")) { await mkdir(resolve(opt("--json", "."), ".."), { recursive: true }).catch(() => {}); await writeFile(opt("--json"), JSON.stringify({ failureKeys, metrics: run.metrics, results: run.results }, null, 2)); }
    if (args.includes("--ratchet")) {
      const { unexpected, fixed } = await compareToKnown(failureKeys);
      unexpected.forEach((k) => console.log(`  NEW FAILURE ${k}`));
      fixed.forEach((k) => console.log(`  FIXED, remove from known-failures.json: ${k}`));
      if (unexpected.length || fixed.length) process.exitCode = 1;
    } else if (failureKeys.length) process.exitCode = 1;
  } finally {
    await launched.close();
    server.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
