// Version consistency: manifest.json is the source of truth. package.json,
// package-lock.json, the README badge and the CHANGELOG must agree with it.
// Run with: npm run check:version
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(join(root, file), "utf8");
const version = JSON.parse(read("manifest.json")).version;

const problems = [];
const expect = (label, actual) => {
  if (actual !== version) problems.push(`${label} is ${actual ?? "missing"}, manifest.json is ${version}`);
};

if (!/^\d+\.\d+\.\d+$/.test(version)) problems.push(`manifest version "${version}" is not MAJOR.MINOR.PATCH`);
expect("package.json version", JSON.parse(read("package.json")).version);
const lock = JSON.parse(read("package-lock.json"));
expect("package-lock.json version", lock.version);
expect("package-lock.json root package version", lock.packages?.[""]?.version);
expect("README version badge", /badge\/version-(\d+\.\d+\.\d+)-/.exec(read("README.md"))?.[1]);
const changelog = read("CHANGELOG.md");
if (!changelog.includes("## Unreleased") && !new RegExp(`^## \\[?${version.replaceAll(".", "\\.")}\\]?`, "m").test(changelog)) {
  problems.push(`CHANGELOG.md has neither an "Unreleased" section nor a "${version}" section`);
}

if (problems.length) {
  for (const problem of problems) console.error(`FAIL ${problem}`);
  process.exit(1);
}
console.log(`OK   version ${version} is consistent across manifest, package, lockfile, README and CHANGELOG`);
