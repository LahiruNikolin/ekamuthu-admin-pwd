import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(path, globals = {}) {
  const exports = {};
  const code = readFileSync(path, 'utf8').replace('import.meta.env.VITE_API_URL', 'undefined');
  vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, ...globals });
  return exports;
}
test('calendar hides obsolete slots but preserves real game and admin booking history', () => {
  const { isCalendarEngagement: visible } = load('src/operator/calendarVisibility.ts');
  assert.equal(visible({ status: 'cancelled', booking_type: 'cancelled' }), false);
  assert.equal(visible({ status: 'expired', reservation_purpose: 'block' }), false);
  assert.equal(visible({ status: 'cancelled', locked_by_game: 'game' }), true);
  assert.equal(visible({ status: 'expired', game_status: 'completed', booking_type: 'one_time' }), true);
  assert.equal(visible({ status: 'expired', booking_type: 'expired', reservation_purpose: 'booking' }), true);
  assert.equal(visible({ status: 'reserved' }), true);
  assert.equal(visible({ status: 'unavailable', is_derived_blocker: true }), true);
});
function clientHarness() {
  let fireTimeout;
  let cleared = 0;
  const api = load('src/api/client.ts', {
    AbortController, DOMException,
    setTimeout: cb => { fireTimeout = cb; return 1; },
    clearTimeout: () => { cleared++; },
    require: () => ({ readToken: () => 'fixture', refreshWebSession: async () => false, clearToken() {} }),
    fetch: async (_, { signal }) => new Promise((_, reject) => {
      if (signal.aborted) reject(signal.reason);
      else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }),
  });
  return { api, timeout: () => fireTimeout(), cleared: () => cleared };
}
test('query cancellation signal no longer disables the request timeout', async () => {
  const h = clientHarness();
  const upstream = new AbortController();
  const request = h.api.adminApi.get('/fixture', upstream.signal);
  h.timeout();
  await assert.rejects(request, { name: 'TimeoutError' });
  assert.equal(upstream.signal.aborted, false);
  assert.equal(h.cleared(), 1);
});
test('obsolete queries are still cancelled immediately', async () => {
  const h = clientHarness();
  const upstream = new AbortController();
  const request = h.api.adminApi.get('/fixture', upstream.signal);
  upstream.abort();
  await assert.rejects(request, { name: 'AbortError' });
  assert.equal(h.cleared(), 1);
});


test('availability subtracts overlapping reservations only in the same play area', () => {
  const { calendarDisplayBlocks: display } = load('src/operator/calendarVisibility.ts');
  const block = (id, area, status, start, end) => ({ id, play_area_id: area, status, starts_at: `2026-10-22T${start}:00Z`, ends_at: `2026-10-22T${end}:00Z` });
  const result = display([
    block('schedule', 'area1', 'available', '08:00', '12:00'),
    block('booking', 'area1', 'reserved', '08:00', '09:00'),
    block('overlap', 'area1', 'reserved', '08:30', '09:30'),
    block('other', 'area2', 'reserved', '10:00', '11:00'),
    block('old', 'area1', 'cancelled', '11:00', '12:00'),
  ]);
  const available = result.filter(b => b.status === 'available');
  assert.equal(available.length, 1);
  assert.equal(available[0].starts_at, '2026-10-22T09:30:00.000Z');
  assert.equal(available[0].ends_at, '2026-10-22T12:00:00.000Z');
});

test('in-page confirmation prevents duplicate prompts and supports safe cancellation', async () => {
  let pending;
  class Element extends EventTarget {
    children = []; isConnected = true;
    append(...nodes) { this.children.push(...nodes); }
    setAttribute() {} showModal() {} close() {} focus() {}
    remove() { pending = undefined; }
  }
  const win = new EventTarget();
  const { confirmAction } = load('src/confirm.ts', { window: win, document: {
    activeElement: new Element(), getElementById: () => pending,
    createElement: () => new Element(), body: { append: element => { pending = element; } },
  } });
  const request = confirmAction('<unsafe> test text');
  assert.equal(await confirmAction('duplicate'), false);
  assert.equal(pending.children[1].textContent, '<unsafe> test text');
  pending.children[2].children[0].onclick();
  assert.equal(await request, false);
  const accepted = confirmAction('Proceed?');
  pending.children[2].children[1].onclick();
  assert.equal(await accepted, true);
});
