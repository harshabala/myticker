// Moves the page's own top-anchored elements down by the strip's height.
//
// contentScript.js reserves space for normal-flow content with a body margin.
// That does not move anything positioned against the window: `position: fixed`
// elements with a `top`, and `position: sticky` elements with a `top`. This
// module finds those and offsets their `top` by the strip height, shrinks fixed
// elements that reached the bottom of the window by the same amount, keeps up as
// the page changes, and restores every inline style it wrote when stopped.
//
// It reads page layout but never page content, and it adds no globals except
// the small bridge below. It never creates its own MutationObserver: the
// content script owns the single observer and passes records in.
(function exposeMyTickerLayout(global) {
  const SCAN_BUDGET_MS = 8;
  const BATCH = 100;
  const RESCAN_INTERVAL_MS = 5000;

  function snapshot(style, property) {
    return { value: style.getPropertyValue(property), priority: style.getPropertyPriority(property) };
  }

  function createPageShifter({ observeRoot, isOwned, afterWrite = () => {} }) {
    let height = 0;
    let active = false;
    let fullScanNeeded = false;
    let sliceTimer = null;
    let debounceTimer = null;
    let trailTimer = null;
    let lastFullScan = 0;
    let processed = 0;
    const tracked = new Map();
    const pending = new Set();
    const seenRoots = new Set();

    const parentOf = (node) => {
      if (node.parentElement) return node.parentElement;
      const root = node.getRootNode?.();
      return root && root.host ? root.host : null;
    };

    function hasContainingBlockAncestor(el) {
      for (let p = parentOf(el); p; p = parentOf(p)) {
        const cs = getComputedStyle(p);
        if (cs.transform !== "none" || cs.perspective !== "none" || cs.filter !== "none" ||
          (cs.backdropFilter && cs.backdropFilter !== "none") ||
          /transform|perspective|filter/.test(cs.willChange) || /layout|paint|strict|content/.test(cs.contain)) return true;
      }
      return false;
    }

    function inScrollContainer(el) {
      for (let p = parentOf(el); p && p !== document.body && p !== document.documentElement; p = parentOf(p)) {
        const cs = getComputedStyle(p);
        if (/auto|scroll|hidden|overlay/.test(cs.overflowY + cs.overflowX)) return true;
      }
      return false;
    }

    // getComputedStyle resolves `auto` to a used pixel value for positioned
    // elements; the typed computed value still says `auto` (bottom-anchored
    // elements, or ones that follow their place in the flow).
    function isAutoTop(el) {
      try {
        const value = el.computedStyleMap?.().get("top");
        return Boolean(value) && typeof value.value === "string" && value.value === "auto";
      } catch {
        return false;
      }
    }

    function setProp(rec, prop, value) {
      const style = rec.el.style;
      if (!rec.snap[prop]) rec.snap[prop] = snapshot(style, prop);
      style.setProperty(prop, value, "important");
      rec.wrote[prop] = snapshot(style, prop);
    }

    function restoreRec(rec) {
      const style = rec.el.style;
      for (const prop of Object.keys(rec.wrote)) {
        const now = snapshot(style, prop);
        // The page rewrote it since: the page owns the value now.
        if (now.value !== rec.wrote[prop].value || now.priority !== rec.wrote[prop].priority) continue;
        const original = rec.snap[prop];
        if (original.value) style.setProperty(prop, original.value, original.priority);
        else style.removeProperty(prop);
      }
      if (!rec.hadStyleAttr && rec.el.getAttribute("style") === "") rec.el.removeAttribute("style");
    }

    function discoverShadow(el) {
      const root = el.shadowRoot;
      if (!root || seenRoots.has(root)) return;
      seenRoots.add(root);
      observeRoot(root);
      for (const child of root.querySelectorAll("*")) pending.add(child);
    }

    function evaluate(list) {
      for (const el of list) {
        const rec = tracked.get(el);
        if (rec) { restoreRec(rec); tracked.delete(el); }
      }
      const vh = global.innerHeight;
      const candidates = [];
      for (const el of list) {
        if (!el.isConnected) continue;
        discoverShadow(el);
        if (el === document.documentElement || el === document.body || isOwned(el)) continue;
        const cs = getComputedStyle(el);
        const position = cs.position;
        if (position !== "fixed" && position !== "sticky") continue;
        const top = Number.parseFloat(cs.top);
        if (!Number.isFinite(top) || isAutoTop(el)) continue;
        if (position === "fixed" ? hasContainingBlockAncestor(el) : inScrollContainer(el)) continue;
        const rect = el.getBoundingClientRect();
        candidates.push({ el, position, top, height: Number.parseFloat(cs.height), minHeight: cs.minHeight, bottom: rect.bottom, rendered: rect.height > 0 });
      }
      for (const c of candidates) {
        const rec = { el: c.el, snap: {}, wrote: {}, hadStyleAttr: c.el.hasAttribute("style") };
        setProp(rec, "top", `${c.top + height}px`);
        tracked.set(c.el, rec);
      }
      const tall = candidates.filter((c) => c.position === "fixed" && c.rendered && Number.isFinite(c.height) && c.bottom >= vh - 1);
      const moved = tall.filter((c) => c.el.getBoundingClientRect().bottom > c.bottom + 0.5);
      for (const c of moved) setProp(tracked.get(c.el), "height", `${Math.max(0, c.height - height)}px`);
      for (const c of moved) {
        if (c.el.getBoundingClientRect().bottom > c.bottom + 0.5) setProp(tracked.get(c.el), "min-height", "0px");
      }
      processed += list.length;
    }

    function runSlice() {
      sliceTimer = null;
      if (!active) return;
      const start = performance.now();
      while (pending.size && performance.now() - start < SCAN_BUDGET_MS) {
        const batch = [];
        for (const el of pending) {
          pending.delete(el);
          batch.push(el);
          if (batch.length >= BATCH) break;
        }
        evaluate(batch);
      }
      afterWrite();
      if (pending.size) sliceTimer = setTimeout(runSlice, 0);
      else if (processed && Date.now() - lastFullScan > RESCAN_INTERVAL_MS && !trailTimer) {
        // Safety net for what mutation records cannot show (late attachShadow,
        // stylesheets changing under us). Rate limited.
        trailTimer = setTimeout(() => { trailTimer = null; scanAll(); }, 1500);
      }
    }

    function scanAll() {
      if (!active) return;
      lastFullScan = Date.now();
      processed = 0;
      for (const el of document.querySelectorAll("*")) pending.add(el);
      for (const el of tracked.keys()) pending.add(el);
      if (!sliceTimer) runSlice();
    }

    function scanSoon() {
      if (!active || debounceTimer) return;
      debounceTimer = setTimeout(() => { debounceTimer = null; scanAll(); }, 120);
    }

    function addSubtree(node) {
      pending.add(node);
      const all = node.querySelectorAll ? node.querySelectorAll("*") : [];
      if (all.length > 400) { fullScanNeeded = true; return; }
      for (const el of all) pending.add(el);
    }

    const onResize = () => { for (const el of tracked.keys()) pending.add(el); scanSoon(); };
    const onNavigate = () => scanSoon();

    function start() {
      if (active) return;
      active = true;
      global.addEventListener?.("resize", onResize);
      global.addEventListener?.("popstate", onNavigate);
      global.addEventListener?.("hashchange", onNavigate);
      global.addEventListener?.("load", onNavigate);
      global.navigation?.addEventListener?.("navigatesuccess", onNavigate);
      document.addEventListener("DOMContentLoaded", onNavigate);
      scanAll();
    }

    function stop() {
      if (!active) return;
      active = false;
      clearTimeout(sliceTimer); clearTimeout(debounceTimer); clearTimeout(trailTimer);
      sliceTimer = debounceTimer = trailTimer = null;
      global.removeEventListener?.("resize", onResize);
      global.removeEventListener?.("popstate", onNavigate);
      global.removeEventListener?.("hashchange", onNavigate);
      global.removeEventListener?.("load", onNavigate);
      global.navigation?.removeEventListener?.("navigatesuccess", onNavigate);
      document.removeEventListener("DOMContentLoaded", onNavigate);
      for (const rec of tracked.values()) restoreRec(rec);
      tracked.clear();
      pending.clear();
      seenRoots.clear();
      fullScanNeeded = false;
    }

    return {
      /** Set the strip height; starts the scan on first use and re-offsets on change. */
      setHeight(value) {
        const next = Math.max(0, Number(value) || 0);
        if (!active) { height = next; start(); return; }
        if (next === height) return;
        height = next;
        for (const el of tracked.keys()) pending.add(el);
        if (!sliceTimer) runSlice();
      },
      /** Queue what a batch of mutation records touched. Returns true if anything was queued. */
      noteRecords(records) {
        if (!active) return false;
        const before = pending.size;
        for (const record of records) {
          if (record.type === "childList") {
            for (const node of record.addedNodes || []) {
              if (node.nodeType !== 1) continue;
              addSubtree(node);
              if (node.tagName === "STYLE" || node.tagName === "LINK") scanSoon();
            }
          } else if (record.type === "attributes" && record.target?.nodeType === 1) {
            const target = record.target;
            if (target === document.documentElement || target === document.body) scanSoon();
            else addSubtree(target);
          }
        }
        return pending.size > before || fullScanNeeded;
      },
      /** Process queued elements within a time budget. */
      flush() {
        if (!active) return;
        if (fullScanNeeded) { fullScanNeeded = false; scanAll(); return; }
        if (pending.size && !sliceTimer) runSlice();
      },
      /** The content script replaced its observer: attach it to known shadow roots again. */
      reobserve() { for (const root of seenRoots) observeRoot(root); },
      stop,
      get trackedCount() { return tracked.size; }
    };
  }

  global.__MYTICKER_LAYOUT__ = Object.freeze({ createPageShifter });
})(globalThis);
