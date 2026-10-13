import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { join } from "node:path";
import { ROOT, buildPackage, collectFiles, createZip } from "../scripts/package.mjs";

function readZip(buffer) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    const method = buffer.readUInt16LE(offset + 10);
    const size = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const start = localOffset + 30 + localNameLength;
    const body = buffer.subarray(start, start + size);
    entries.set(name, method === 8 ? inflateRawSync(body) : body);
    offset += 46 + nameLength;
  }
  return entries;
}

test("the store package contains exactly what the extension loads, and round-trips", () => {
  const { files, zip, version } = buildPackage();
  assert.equal(version, JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8")).version);
  const entries = readZip(zip);
  assert.deepEqual([...entries.keys()], files);
  for (const file of files) assert.ok(entries.get(file).equals(readFileSync(join(ROOT, file))), `${file} differs`);
  for (const required of ["manifest.json", "background.js", "contentScript.js", "contentShared.js", "popup.html", "options.html", "ticker.css", "brand.css", "motion.css", "vault.js", "csvParser.js", "priceProviders.js", "icons/icon128.png", "icons/phosphor-symbols.svg", "test_fixtures/sample_holdings_zerodha.csv"]) {
    assert.ok(entries.has(required), `${required} must be packaged`);
  }
});

test("the package never ships docs, tests, secrets, lockfiles, dev tooling or personal holdings", () => {
  for (const file of collectFiles()) {
    assert.doesNotMatch(file, /^(docs|tests|scripts|assets|node_modules|\.github|\.impeccable|dist)\//, file);
    assert.doesNotMatch(file, /\.(md|pem|crx|zip|env)$|package(-lock)?\.json$|eslint\.config|user_holdings/, file);
  }
  assert.ok(!collectFiles().some((file) => file.startsWith("test_fixtures/") && file !== "test_fixtures/sample_holdings_zerodha.csv"));
});

test("packaging is deterministic", () => {
  assert.ok(buildPackage().zip.equals(buildPackage().zip));
  const small = createZip([{ name: "a.txt", data: Buffer.from("hello hello hello hello") }]);
  assert.equal(readZip(small).get("a.txt").toString(), "hello hello hello hello");
});
