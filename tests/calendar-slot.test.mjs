import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";

function load(file) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports });
  return exports;
}
const { slotRange, slotIsEmpty } = load("src/operator/calendarSlot.ts");
const { localISO, localInput } = load("src/operator/date.ts");

test("tapped half-hour and full-hour slots preserve the venue wall time", () => {
  for (const [minute, step, start, end] of [
    [0, 30, "2026-11-04T00:00", "2026-11-04T00:30"],
    [240, 60, "2026-11-04T04:00", "2026-11-04T05:00"],
    [510, 30, "2026-11-04T08:30", "2026-11-04T09:00"],
    [1410, 30, "2026-11-04T23:30", "2026-11-05T00:00"],
    [1380, 60, "2026-11-04T23:00", "2026-11-05T00:00"],
  ]) {
    const range = slotRange("2026-11-04", minute, step);
    assert.equal(range.start, start);
    assert.equal(range.end, end);
    for (const zone of ["Asia/Colombo", "Asia/Tokyo", "America/New_York"])
      for (const value of [range.start, range.end])
        assert.equal(localInput(localISO(value, zone), zone), value);
  }
  assert.equal(localISO(slotRange("2026-11-04", 240, 60).start, "Asia/Colombo"), "2026-11-03T22:30:00.000Z");
});

test("occupied time cannot start a new draft, while shared boundaries remain bookable", () => {
  const entries = [{ from: 510, to: 570, cancelled: false }];
  assert.equal(slotIsEmpty(480, 30, entries), true);
  assert.equal(slotIsEmpty(480, 60, entries), false);
  assert.equal(slotIsEmpty(510, 30, entries), false);
  assert.equal(slotIsEmpty(540, 60, entries), false);
  assert.equal(slotIsEmpty(570, 30, entries), true);
});

test("cancelled games release time but a replacement booking blocks it again", () => {
  const cancelled = { from: 240, to: 300, cancelled: true };
  assert.equal(slotIsEmpty(240, 60, [cancelled]), true);
  assert.equal(slotIsEmpty(240, 60, [cancelled, { ...cancelled, cancelled: false }]), false);
  assert.equal(slotIsEmpty(0, 30, [{ from: 0, to: 30, cancelled: false }]), false);
});
