import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../test_fixtures/layout/${path}`, import.meta.url), "utf8");

test("every layout case names a fixture file that exists, with the required hard cases", async () => {
  const { cases } = JSON.parse(await read("cases.json"));
  const ids = cases.map((c) => c.id);
  for (const needed of ["fixed-header", "sticky-header", "fixed-on-scroll", "fixed-sidebar", "spa-rerender", "cookie-banner", "important-top", "shadow-root-header", "modal-overlay", "fullscreen-video", "print-stylesheet", "long-document", "body-margin-transforms"]) {
    assert.ok(ids.includes(needed), `case ${needed}`);
  }
  for (const c of cases) assert.ok((await read(c.file)).includes("<!doctype html>"), `${c.file} exists`);
});

test("known layout failures refer to real cases and use known check ids", async () => {
  const { cases } = JSON.parse(await read("cases.json"));
  const known = JSON.parse(await read("known-failures.json"));
  for (const key of known) {
    const [id, check] = key.split(":");
    assert.ok(cases.some((c) => c.id === id), `${key}: unknown fixture`);
    assert.match(check, /^(overlap|cutoff|shift|anchor|fullscreen|print|restore|perf|burst-shift)/, `${key}: unknown check`);
  }
});

test("the test-site list has at least 25 real sites", async () => {
  const doc = await readFile(new URL("../docs/layout-test-sites.md", import.meta.url), "utf8");
  assert.ok((doc.match(/\| https:\/\//g) || []).length >= 25);
});
