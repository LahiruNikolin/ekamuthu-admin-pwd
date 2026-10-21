import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";
const exports = {};
vm.runInNewContext(
  ts.transpileModule(readFileSync("src/operator/date.ts", "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  { exports },
);
test("venue wall times convert independently of device timezone, including overnight", () => {
  assert.equal(
    exports.localISO("2027-01-10T08:00", "Asia/Colombo"),
    "2027-01-10T02:30:00.000Z",
  );
  assert.equal(
    exports.localISO("2027-01-11T01:00", "Asia/Colombo"),
    "2027-01-10T19:30:00.000Z",
  );
  assert.equal(
    exports.localISO("2027-07-10T08:00", "America/New_York"),
    "2027-07-10T12:00:00.000Z",
  );
  assert.equal(
    exports.localInput("2027-01-10T19:30:00Z", "Asia/Colombo"),
    "2027-01-11T01:00",
  );
});
test("nonexistent DST time is rejected rather than silently shifted", () => {
  assert.throws(() => exports.localISO("2027-03-14T02:30", "America/New_York"));
});
