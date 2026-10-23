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
    require: () => ({ readToken: () => 'fixture', refreshWebSession: async () => false, tokenNeedsRefresh: () => false, clearToken() {} }),
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


test('local HTTP proxy preserves persistent HttpOnly cookies without HTTPS-only attributes', () => {
  const { localDevCookie } = load('dev/cookies.ts');
  const cookie = 'admin_refresh_token=fixture; Path=/api/v1/auth; Max-Age=2592000; HttpOnly; Secure; SameSite=None';
  assert.equal(localDevCookie(cookie), 'admin_refresh_token=fixture; Path=/api/v1/auth; Max-Age=2592000; HttpOnly; SameSite=Lax');
  assert.equal(localDevCookie('session=fixture; HttpOnly; SameSite=Lax'), 'session=fixture; HttpOnly; SameSite=Lax');
});

test('a delayed 401 reuses a session already renewed by another request', async () => {
  let token = 'old', refreshes = 0;
  const headers = [];
  let resolveOld;
  const api = load('src/api/client.ts', {
    AbortController, DOMException, setTimeout, clearTimeout,
    require: () => ({ readToken: () => token, tokenNeedsRefresh: () => false, clearToken() { token = null; },
      async refreshWebSession(rejected) { if (token === rejected) { refreshes++; token = 'new'; } return true; } }),
    fetch: async (_, options) => {
      headers.push(options.headers.Authorization);
      if (headers.length === 1) return new Promise(resolve => { resolveOld = resolve; });
      return { ok: true, status: 200, json: async () => ({ saved: true }) };
    },
  });
  const request = api.adminApi.get('/fixture');
  token = 'new';
  resolveOld({ status: 401 });
  assert.deepEqual(await request, { saved: true });
  assert.equal(refreshes, 0);
  assert.deepEqual(headers, ['Bearer old', 'Bearer new']);
});

test('refresh outages do not clear auth or redirect an expired request to login', async () => {
  let cleared = false;
  const location = { pathname: '/calendar', search: '?date=2026-10-22', href: '' };
  const api = load('src/api/client.ts', {
    AbortController, DOMException, setTimeout, clearTimeout, window: { location },
    require: () => ({ readToken: () => 'expired', tokenNeedsRefresh: () => true,
      refreshWebSession: async () => { throw new Error('offline'); }, clearToken() { cleared = true; } }),
    fetch: () => assert.fail('expired access token should be renewed before API calls'),
  });
  await assert.rejects(api.adminApi.get('/fixture'), /offline/);
  assert.equal(cleared, false);
  assert.equal(location.href, '');
});


test('a resource 401 after renewal preserves a valid persistent session', async () => {
  let token = 'old', cleared = false, requests = 0;
  const location = { pathname: '/calendar', search: '', href: '' };
  const api = load('src/api/client.ts', {
    AbortController, DOMException, setTimeout, clearTimeout, window: { location },
    require: () => ({ readToken: () => token, tokenNeedsRefresh: () => false,
      refreshWebSession: async () => { token = 'fresh'; return true; }, clearToken() { cleared = true; } }),
    fetch: async () => { requests++; return { status: 401 }; },
  });
  await assert.rejects(api.adminApi.get('/fixture'), /Could not verify access/);
  assert.equal(requests, 2);
  assert.equal(cleared, false);
  assert.equal(location.href, '');
});
test('a revoked refresh session requires login and preserves the destination', async () => {
  let cleared = false;
  const location = { pathname: '/calendar', search: '?date=2026-10-22', href: '' };
  const api = load('src/api/client.ts', {
    AbortController, DOMException, setTimeout, clearTimeout, window: { location },
    require: () => ({ readToken: () => 'expired', tokenNeedsRefresh: () => true,
      refreshWebSession: async () => false, clearToken() { cleared = true; } }),
    fetch: () => assert.fail('revoked sessions must not issue API calls'),
  });
  await assert.rejects(api.adminApi.get('/fixture'), /sign in again/);
  assert.equal(cleared, true);
  assert.equal(location.href, '/login?next=%2Fcalendar%3Fdate%3D2026-10-22');
});

test('cancelled games and replacements remain distinct without blocking available time', () => {
  const { calendarDisplayBlocks, calendarRebookedBlocks, calendarTone } = load('src/operator/calendarVisibility.ts');
  const block = (id, status, start, end, extra = {}) => ({ id, court_id: 'venue', play_area_id: 'area', status, starts_at: `2026-10-22T${start}:00Z`, ends_at: `2026-10-22T${end}:00Z`, ...extra });
  const cancelled = block('old', 'cancelled', '08:00', '10:00', { locked_by_game: 'old-game', game_status: 'cancelled', booking_type: 'one_time' });
  const active = block('new', 'confirmed', '09:00', '11:00', { locked_by_game: 'new-game', game_status: 'confirmed', booking_type: 'one_time', reservation_purpose: 'block' });
  const otherArea = { ...active, id: 'other-area', play_area_id: 'other' };
  const otherVenue = { ...active, id: 'other-venue', court_id: 'other' };
  const adjacent = { ...active, id: 'adjacent', starts_at: '2026-10-22T10:00:00Z', ends_at: '2026-10-22T11:00:00Z' };
  const input = [block('opening', 'available', '08:00', '12:00'), cancelled, active, otherArea, otherVenue, adjacent];
  // Display normalization normally receives one facility at a time.
  const visible = calendarDisplayBlocks(input.filter(b => b.court_id === 'venue'));
  assert.ok(visible.includes(cancelled));
  assert.ok(visible.includes(active));
  const available = visible.filter(b => b.status === 'available');
  assert.deepEqual(available.map(b => [b.starts_at.slice(11,16), b.ends_at.slice(11,16)]), [['08:00','09:00'],['11:00','12:00']]);
  const rebooked = calendarRebookedBlocks(input);
  assert.equal(rebooked.has(cancelled), true);
  assert.equal(rebooked.has(active), true);
  assert.equal(rebooked.has(otherArea), false);
  assert.equal(rebooked.has(otherVenue), false);
  assert.equal(rebooked.has(adjacent), false);
  assert.equal(calendarTone(cancelled), 'red');
  assert.equal(calendarTone(active), 'green');
});

test('calendar pinch reaches 25 percent and keeps its midpoint anchored', () => {
  const states = [], refs = [], handlers = {}, frames = [];
  let stateIndex = 0, refIndex = 0, layouts = [], effects = [];
  const storage = new Map();
  const el = {
    scrollTop: 640, scrollLeft: 800, clientWidth: 400, clientHeight: 600, clientLeft: 0, clientTop: 0, dataset: {},
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    addEventListener: (name, callback) => { handlers[name] = callback; }, removeEventListener() {},
  };
  const hook = load('src/operator/useCalendarZoom.ts', {
    require: () => ({
      useState(initial) { const i = stateIndex++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], value => { states[i] = value; }]; },
      useRef(initial) { const i = refIndex++; return refs[i] ||= { current: initial }; },
      useLayoutEffect(callback) { layouts.push(callback); }, useEffect(callback) { effects.push(callback); },
    }),
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    window: { setTimeout: () => 1, clearTimeout() {} },
    requestAnimationFrame: callback => { frames.push(callback); return frames.length; }, cancelAnimationFrame() {},
  });
  const viewport = { current: el };
  function render(mount = false) {
    stateIndex = refIndex = 0; layouts = []; effects = [];
    const result = hook.default(viewport, () => {}, true);
    layouts.forEach(callback => callback());
    if (mount) effects.forEach(callback => callback());
    return result;
  }
  assert.equal(render(true).zoom, 1);
  let prevented = 0;
  const touch = (points) => ({ touches: points.map(([clientX, clientY]) => ({ clientX, clientY })), cancelable: true, preventDefault() { prevented++; } });
  handlers.touchstart(touch([[200, 300]]));
  assert.equal(prevented, 0, 'single-finger scrolling stays native');
  handlers.touchstart(touch([[0, 300], [400, 300]]));
  handlers.touchmove(touch([[175, 300], [225, 300]]));
  frames.shift()();
  assert.equal(render().zoom, 0.25, 'zoom clamps at the expanded overview limit');
  assert.equal(el.scrollLeft, 93.5);
  assert.equal(el.scrollTop, 1);
  assert.ok(Number(el.dataset.zoomClickUntil) > Date.now(), 'gesture suppresses accidental booking taps');
});

test('new flexible schedule rates match proportional API pricing, including overnight', () => {
  const { normalize } = load('src/features/schedule.ts');
  const entry = { start_time:'08:00', end_time:'22:00', start_day_offset:0, end_day_offset:0, price:1000, sort_order:0 };
  const result = normalize([entry], true);
  assert.equal(result[0].price, 14000);
  assert.equal(entry.price, 1000, 'review values must remain hourly after saving');
  assert.equal(normalize([{...entry, start_time:'23:00', end_time:'01:00', end_day_offset:1, price:1500}], true)[0].price, 3000);
  assert.equal(normalize([{...entry, start_time:'00:00', end_time:'01:00', start_day_offset:1, end_day_offset:1, price:750}], true)[0].price, 750);
  assert.equal(normalize([entry], false)[0].price, 1000, 'legacy range prices must not be converted');
});
test('schedule validation rejects overlaps, bad clocks, missing rates and invalid overnight offsets', () => {
  const { normalize } = load('src/features/schedule.ts');
  const entry = { start_time:'08:00', end_time:'10:00', start_day_offset:0, end_day_offset:0, price:500, sort_order:0 };
  for (const patch of [{start_time:'25:00'}, {end_time:'10:70'}, {price:NaN}, {price:-1}, {end_time:'07:00'}, {start_day_offset:2}])
    assert.throws(() => normalize([{...entry, ...patch}], true));
  assert.throws(() => normalize([], true));
  assert.throws(() => normalize([entry, {...entry, start_time:'09:00', end_time:'11:00'}], true));
  assert.equal(normalize([entry, {...entry, start_time:'10:00', end_time:'11:00'}], true).length, 2);
});

test('template ranges reject duplicates, containment and overnight overlaps regardless of row order', () => {
  const { normalize } = load('src/features/schedule.ts');
  const row = (start_time, end_time, start_day_offset=0, end_day_offset=0) => ({start_time,end_time,start_day_offset,end_day_offset,price:100,sort_order:0});
  for (const entries of [
    [row('08:00','12:00'),row('09:00','10:00')],
    [row('08:00','12:00'),row('08:00','12:00')],
    [row('10:00','13:00'),row('08:00','11:00')],
    [row('23:00','02:00',0,1),row('01:00','03:00',1,1)],
  ]) assert.throws(() => normalize(entries,false), /overlap/);
  assert.equal(normalize([row('01:00','02:00',1,1),row('23:00','01:00',0,1)],false).length,2);
  assert.throws(() => normalize([row('08:00','08:00')],false), /Closing time/);
});

test('weekly template validation covers repeated days, Friday/Saturday and Sunday/Monday, allowing touching boundaries', () => {
  const { normalize, validateWeek } = load('src/features/schedule.ts');
  const row = (start_time,end_time,end_day_offset=0) => ({start_time,end_time,start_day_offset:0,end_day_offset,price:100,sort_order:0});
  const rows = (...values) => normalize(values,false);
  assert.throws(() => validateWeek(rows(row('23:00','02:00',1),row('01:00','03:00'))), /next opening day/);
  assert.throws(() => validateWeek([],rows(row('23:00','02:00',1),row('01:00','03:00'))), /next opening day/);
  assert.throws(() => validateWeek(rows(row('23:00','02:00',1)),rows(row('01:00','03:00'))), /Weekdays.*Weekends/);
  assert.throws(() => validateWeek(rows(row('01:00','03:00')),rows(row('23:00','02:00',1))), /Weekends.*Weekdays/);
  assert.doesNotThrow(() => validateWeek(rows(row('23:00','01:00',1)),rows(row('01:00','02:00'))));
  assert.doesNotThrow(() => validateWeek(rows(row('23:00','00:00',1),{...row('00:00','01:00',1),start_day_offset:1})));
});

test('template assignment checks the active opposite day type only in the selected play area', () => {
  const { validateAssignment } = load('src/features/schedule.ts');
  const row = (start_time,end_time,end_day_offset=0) => ({start_time,end_time,start_day_offset:0,end_day_offset,price:100,sort_order:0});
  const candidate = {day_type:'weekday',entries:[row('23:00','02:00',1)]};
  const active = {day_type:'weekend',entries:[row('01:00','03:00')],activations:[{play_area_id:'a1'}]};
  assert.throws(() => validateAssignment([candidate],[active],['a1']), /overlaps/);
  assert.doesNotThrow(() => validateAssignment([candidate],[active],['a2']));
  assert.doesNotThrow(() => validateAssignment([candidate,{day_type:'weekend',entries:[row('02:00','03:00')]}],[active],['a1']));
  assert.doesNotThrow(() => validateAssignment([candidate],[{...active,activations:[]}],['a1']));
});
