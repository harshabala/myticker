// Builds the Chrome Web Store upload: dist/myticker-<version>.zip
//
// Only files the extension actually loads are included (manifest references,
// local imports, HTML script/style/icon references, and the packaged sample
// CSV). Docs, tests, assets, node_modules, lockfiles, signing keys and any
// local holdings file are never shipped. The archive is deterministic: sorted
// entries and a fixed timestamp, so the same sources give the same bytes.
//
// Run with: npm run package        (does not publish anything)
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Files fetched at runtime via chrome.runtime.getURL that static scanning cannot see.
const RUNTIME_FILES = ["test_fixtures/sample_holdings_zerodha.csv"];
const FORBIDDEN = [/\.pem$/i, /\.crx$/i, /\.zip$/i, /\.env/i, /user_holdings/i, /(^|\/)node_modules\//, /(^|\/)\.git/, /\.DS_Store$/];

function readText(file) {
  return readFileSync(join(ROOT, file), "utf8");
}

function localRefs(file, text) {
  const refs = [];
  const add = (ref) => {
    const clean = ref.split(/[?#]/)[0];
    if (!clean || /^(?:[a-z]+:|\/\/|data:)/i.test(clean)) return;
    refs.push(posix.normalize(posix.join(posix.dirname(file), clean)));
  };
  if (file.endsWith(".js")) {
    for (const match of text.matchAll(/\bfrom\s*["'](\.[^"']+)["']|\bimport\s*\(\s*["'](\.[^"']+)["']\s*\)/g)) add(match[1] || match[2]);
  } else if (file.endsWith(".html")) {
    for (const match of text.matchAll(/\b(?:src|href)\s*=\s*"([^"]+)"/g)) add(match[1]);
  } else if (file.endsWith(".css")) {
    for (const match of text.matchAll(/@import\s+(?:url\()?["']([^"']+)["']/g)) add(match[1]);
  }
  return refs;
}

/** Sorted list of repo-relative files that make up the extension. */
export function collectFiles() {
  const manifest = JSON.parse(readText("manifest.json"));
  const queue = [
    "manifest.json",
    manifest.background?.service_worker,
    manifest.action?.default_popup,
    manifest.options_page,
    ...Object.values(manifest.icons || {}),
    ...Object.values(manifest.action?.default_icon || {}),
    ...(manifest.content_scripts || []).flatMap((entry) => [...(entry.js || []), ...(entry.css || [])]),
    ...(manifest.web_accessible_resources || []).flatMap((entry) => entry.resources || []),
    ...RUNTIME_FILES
  ].filter(Boolean);
  const seen = new Set();
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    if (!existsSync(join(ROOT, file))) throw new Error(`Referenced file is missing: ${file}`);
    seen.add(file);
    if (/\.(?:js|html|css)$/.test(file)) queue.push(...localRefs(file, readText(file)));
  }
  const files = [...seen].sort();
  for (const file of files) {
    if (FORBIDDEN.some((pattern) => pattern.test(file))) throw new Error(`Refusing to package forbidden file: ${file}`);
  }
  return files;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// 1980-01-01 00:00:00 in DOS time/date format.
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

/** Create a deterministic ZIP archive from [{ name, data }] entries. */
export function createZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuffer = Buffer.from(name, "utf8");
    const deflated = deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    locals.push(local, nameBuffer, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(0o100644 << 16 >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuffer);

    offset += 30 + nameBuffer.length + body.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

export function buildPackage() {
  const manifest = JSON.parse(readText("manifest.json"));
  const pkg = JSON.parse(readText("package.json"));
  if (manifest.version !== pkg.version) {
    throw new Error(`manifest.json (${manifest.version}) and package.json (${pkg.version}) versions differ`);
  }
  const files = collectFiles();
  const zip = createZip(files.map((name) => ({ name, data: readFileSync(join(ROOT, name)) })));
  return { version: manifest.version, files, zip };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { version, files, zip } = buildPackage();
  const outDir = join(ROOT, "dist");
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, `myticker-${version}.zip`);
  writeFileSync(out, zip);
  console.log(`Packaged ${files.length} files into dist/myticker-${version}.zip`);
  console.log(`size   ${statSync(out).size} bytes`);
  console.log(`sha256 ${createHash("sha256").update(zip).digest("hex")}`);
}
