import { readFileSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import assert from "node:assert/strict";
const html = readFileSync("dist/index.html", "utf8");
const entry = html.match(/src="(\/assets\/[^\"]+\.js)"/)[1];
const entryBytes = gzipSync(readFileSync(`dist${entry}`)).length;
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
