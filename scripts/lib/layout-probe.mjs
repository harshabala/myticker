// Page-side probe injected by the layout check. It only reads layout; it never
// writes to the page except scrolling. Runs in the page's main world.
export const PROBE_SOURCE = `(() => {
  const SKIP = new Set(["HTML","HEAD","SCRIPT","STYLE","LINK","META","TITLE","NOSCRIPT","TEMPLATE"]);
  const REPLACED = new Set(["IMG","VIDEO","CANVAS","SVG","INPUT","BUTTON","SELECT","TEXTAREA","IFRAME"]);
  const alpha = (c) => { if (!c || c === "transparent") return 0; const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return 1; const p = m[1].split(/[ ,\\/]+/).filter(Boolean); return p.length > 3 ? Number(p[3]) : 1; };
  const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
  const settle = async (ms = 250) => {
    await raf(); await raf();
    await new Promise((r) => setTimeout(r, ms));
    const finite = document.getAnimations().filter((a) => a.effect && a.effect.getComputedTiming().iterations !== Infinity);
    await Promise.race([Promise.all(finite.map((a) => a.finished.catch(() => {}))), new Promise((r) => setTimeout(r, 1500))]);
    await raf();
  };
  const walk = (parent, prefix, visitor) => {
    const counts = {};
    for (const el of parent.children || []) {
      if (el.id === "pts-ticker-container") continue;
      if (SKIP.has(el.tagName.toUpperCase())) continue;
      const tag = el.tagName.toLowerCase();
      counts[tag] = (counts[tag] || 0) + 1;
      const key = prefix + ">" + tag + "[" + counts[tag] + "]";
      visitor(el, key);
      if (el.shadowRoot) walk(el.shadowRoot, key + "::shadow", visitor);
      walk(el, key, visitor);
    }
  };
  const sample = () => {
    const els = {};
    walk(document.documentElement, "html", (el, key) => {
      const cs = getComputedStyle(el);
      if (cs.display === "none") return;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim());
      const border = ["top","right","bottom","left"].some((s) => parseFloat(cs["border-" + s + "-width"]) > 0 && cs["border-" + s + "-style"] !== "none" && alpha(cs["border-" + s + "-color"]) > 0);
      const painted = hasText || REPLACED.has(el.tagName.toUpperCase()) || alpha(cs.backgroundColor) > 0 || cs.backgroundImage !== "none" || border;
      const visible = cs.visibility === "visible" && Number(cs.opacity) > 0.01;
      els[key] = { t: r.top, b: r.bottom, l: r.left, w: r.width, h: r.height, painted, visible, pos: cs.position };
    });
    return { vh: innerHeight, vw: innerWidth, sy: scrollY, els };
  };
  const measureStage = async (y) => {
    scrollTo(0, y); await settle();
    const a = sample();
    scrollTo(0, y + 60); await settle(150);
    const b = sample();
    scrollTo(0, y); await settle(100);
    return { a, b };
  };
  const snapshot = () => {
    const out = {};
    const add = (el, key) => {
      const cs = getComputedStyle(el);
      out[key] = {
        attrs: el.getAttributeNames().sort().map((n) => n + "=" + el.getAttribute(n)).join(" | "),
        css: Array.from(cs, (p) => p + ":" + cs.getPropertyValue(p)).join(";")
      };
    };
    add(document.documentElement, "html");
    walk(document.documentElement, "html", add);
    return out;
  };
  const burst = async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const t0 = performance.now();
    for (let i = 0; i < 250; i++) { const d = document.createElement("div"); d.textContent = "n"; host.appendChild(d); }
    const kids = [...host.children];
    for (let i = 0; i < 250; i++) kids[i].classList.toggle("a");
    for (let i = 0; i < 250; i++) kids[i].style.color = i % 2 ? "red" : "blue";
    for (let i = 0; i < 250; i++) kids[i].setAttribute("data-x", String(i));
    for (let i = 0; i < 20; i++) { const f = document.createElement("div"); f.className = "burst-fixed"; f.style.cssText = "position:fixed;top:0;left:0;width:10px;height:10px"; host.appendChild(f); }
    await raf(); await raf(); await new Promise((r) => setTimeout(r, 0));
    const ms = performance.now() - t0;
    await settle(300);
    const tops = [...host.querySelectorAll(".burst-fixed")].map((f) => f.getBoundingClientRect().top);
    host.remove();
    return { ms, tops };
  };
  window.__layoutProbe = { sample, measureStage, snapshot, burst, settle };
  return true;
})()`;
