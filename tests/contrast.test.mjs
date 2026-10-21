import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Tape text is 10-13px, so every text token needs WCAG AA 4.5:1 on the tape
// background, in every theme the tape can render with.
const css = await readFile(new URL("../ticker.css", import.meta.url), "utf8");

function tokens(blockStart) {
  const start = css.indexOf(blockStart);
  assert.ok(start >= 0, `theme block ${blockStart} exists`);
  const body = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/--(pts-bg|pts-fg|pts-muted|green|red|yellow):\s*(#[0-9a-f]{6})/gi)].map(([, k, v]) => [k, v]));
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const THEMES = {
  "system dark": ":host,\n:root {\n  --pts-bg",
  "system light": "@media (prefers-color-scheme: light)",
  "explicit light": '.pts-ticker-bar[data-theme="light"] {',
  "explicit dark": '.pts-ticker-bar[data-theme="dark"] {'
};

for (const [name, selector] of Object.entries(THEMES)) {
  test(`tape text meets WCAG AA 4.5:1 in the ${name} theme`, () => {
    const t = tokens(selector);
    for (const key of ["pts-fg", "pts-muted", "green", "red", "yellow"]) {
      assert.ok(t[key] && t["pts-bg"], `${name}: --${key} and --pts-bg defined`);
      const ratio = contrast(t[key], t["pts-bg"]);
      assert.ok(ratio >= 4.5, `${name}: --${key} ${t[key]} on ${t["pts-bg"]} is ${ratio.toFixed(2)}:1`);
    }
  });
}

// Popup and Settings (brand.css): secondary text and P&L colours on the page
// background, which is darker than the white card surface in light themes.
const brand = await readFile(new URL("../brand.css", import.meta.url), "utf8");
const BRAND_THEMES = {
  "system dark": ":root {",
  "system light": "@media (prefers-color-scheme: light) {\n  :root {",
  "explicit light": 'html[data-theme="light"] {',
  "explicit dark": 'html[data-theme="dark"] {'
};

for (const [name, selector] of Object.entries(BRAND_THEMES)) {
  test(`popup and Settings text meets WCAG AA 4.5:1 in the ${name} theme`, () => {
    const start = brand.indexOf(selector);
    assert.ok(start >= 0, `brand.css ${name} block exists`);
    const body = brand.slice(start, brand.indexOf("}", start));
    const t = Object.fromEntries([...body.matchAll(/--(bg|text-secondary|green|red|yellow):\s*(#[0-9a-f]{6})/gi)].map(([, k, v]) => [k, v]));
    for (const key of ["text-secondary", "green", "red", "yellow"]) {
      const ratio = contrast(t[key], t.bg);
      assert.ok(ratio >= 4.5, `${name}: --${key} ${t[key]} on ${t.bg} is ${ratio.toFixed(2)}:1`);
    }
  });
}
