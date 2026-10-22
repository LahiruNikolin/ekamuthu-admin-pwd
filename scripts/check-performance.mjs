import { readFileSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import assert from "node:assert/strict";
// Count the entry and all static imports; lazy routes stay outside the startup budget.
const manifest = JSON.parse(readFileSync("dist/.vite/manifest.json", "utf8"));
const entry = Object.keys(manifest).find(key => manifest[key].isEntry);
assert.ok(entry, "Missing production entry in Vite manifest");
const startup = new Set();
function includeStatic(key) {
  if (startup.has(key)) return;
  assert.ok(manifest[key], `Missing manifest dependency ${key}`);
  startup.add(key);
  for (const dependency of manifest[key].imports || []) includeStatic(dependency);
}
includeStatic(entry);
const entryBytes = [...startup].reduce((bytes, key) => bytes + gzipSync(readFileSync(`dist/${manifest[key].file}`)).length, 0);
const files = readdirSync("dist/assets").filter((file) => file.endsWith(".js"));
const total = files.reduce(
  (bytes, file) => bytes + gzipSync(readFileSync(`dist/assets/${file}`)).length,
  0,
);
assert.ok(
  entryBytes <= 90_000,
  `Initial JavaScript ${entryBytes} bytes exceeds 90,000 gzip budget`,
);
assert.ok(
  total <= 130_000,
  `All JavaScript ${total} bytes exceeds 130,000 gzip budget`,
);
console.log(
  `Performance budget passed: ${entryBytes} initial / ${total} total gzip bytes.`,
);
