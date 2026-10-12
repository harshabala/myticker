// Fails if a tracked file looks like it contains a secret or personal data.
// This repository is public: run before every push. Run with: npm run scan
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PATTERNS = [
  ["absolute home path", /(?:\/Users\/|\/home\/)[A-Za-z0-9._-]+\/|[A-Za-z]:\\Users\\/],
  ["private key block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ["Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["API token in URL", /[?&](?:token|apikey|api_key|key)=[A-Za-z0-9]{16,}/i],
  ["assigned secret literal", /\b(?:api[_-]?key|secret|password|passwd)\b["']?\s*[:=]\s*["'][A-Za-z0-9/+_-]{16,}["']/i]
];
const FORBIDDEN_FILES = [/\.pem$/i, /\.crx$/i, /\.zip$/i, /(^|\/)\.env/i, /user_holdings/i];
// Documented placeholder values that are not secrets.
const ALLOW = [/token=\$\{/, /legacy-sync-secret/];

const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
const findings = [];
for (const file of files) {
  if (FORBIDDEN_FILES.some((pattern) => pattern.test(file))) findings.push(`${file}: forbidden file type`);
  if (/\.(?:png|jpg|jpeg|gif|webp|ico|zip)$/i.test(file) || file === "package-lock.json" || file === "scripts/scan-sensitive.mjs") continue;
  let text;
  try {
    text = readFileSync(join(root, file), "utf8");
  } catch {
    continue;
  }
  text.split("\n").forEach((line, index) => {
    if (ALLOW.some((pattern) => pattern.test(line))) return;
    for (const [label, pattern] of PATTERNS) {
      if (pattern.test(line)) findings.push(`${file}:${index + 1}: ${label}`);
    }
  });
}

if (findings.length) {
  for (const finding of findings) console.error(`FAIL ${finding}`);
  process.exit(1);
}
console.log(`OK   scanned ${files.length} tracked files: no secrets, personal paths or forbidden file types`);
