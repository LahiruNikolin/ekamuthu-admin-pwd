import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { jwtDecode } from "jwt-decode";

function authHarness(fetch, extra = {}) {
  const storage = new Map();
  const exports = {};
  const code = readFileSync("src/lib/auth.ts", "utf8").replace(
    "import.meta.env.VITE_API_URL",
    "undefined",
  );
  vm.runInNewContext(
    ts.transpileModule(code, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports,
      require: () => ({ jwtDecode }),
      fetch,
      ...extra,
      AbortSignal,
      sessionStorage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: (key) => storage.delete(key),
      },
    },
  );
  return exports;
}

test("concurrent expired requests share one refresh and save the new access token", async () => {
  let requests = 0;
  let resolve;
  const response = new Promise((done) => {
    resolve = done;
  });
  const auth = authHarness(() => {
    requests++;
    return response;
  });
  const first = auth.refreshWebSession();
  const second = auth.refreshWebSession();
  assert.equal(first, second);
  resolve({ ok: true, json: async () => ({ access_token: "fresh" }) });
  assert.equal(await first, true);
  assert.equal(requests, 1);
  assert.equal(auth.readToken(), "fresh");
});

test("failed logout retains the session for retry; successful logout clears it", async () => {
  let ok = false;
  const auth = authHarness(async () => ({ ok }));
  auth.setToken("existing");
  await assert.rejects(auth.logout());
  assert.equal(auth.readToken(), "existing");
  ok = true;
  await auth.logout();
  assert.equal(auth.readToken(), null);
});

test("service worker ignores API calls and only falls back for same-origin navigation", async () => {
  const handlers = {};
  const cached = [];
  const deleted = [];
  let skipped = false, claimed = false;
  vm.runInNewContext(readFileSync("src/service-worker.js", "utf8"), {
    URL,
    self: {
      location: { origin: "https://admin.example" },
      skipWaiting: async () => { skipped = true; },
      clients: { claim: async () => { claimed = true; } },
      addEventListener: (type, handler) => {
        handlers[type] = handler;
      },
    },
    fetch: async () => {
      throw new Error("offline");
    },
    caches: {
      keys: async () => ["unrelated-cache", "ekamuthu-admin-pwa-old"],
      delete: async key => { deleted.push(key); },
      open: async () => ({
        add: async (path) => cached.push(path),
        match: async (path) => path,
      }),
    },
  });
  await new Promise((resolve) =>
    handlers.install({ waitUntil: (promise) => promise.then(resolve) }),
  );
  assert.deepEqual(cached, ["/offline.html"]);
  assert.equal(skipped, true);
  await new Promise(resolve => handlers.activate({waitUntil: promise => promise.then(resolve)}));
  assert.equal(claimed, true);
  assert.deepEqual(deleted, ["ekamuthu-admin-pwa-old"]);
  for (const request of [
    {
      url: "https://admin.example/api/v1/admin/games",
      mode: "navigate",
      method: "GET",
    },
    {
      url: "https://admin.example/api/v1/auth/login",
      mode: "cors",
      method: "POST",
    },
    { url: "https://backend.example/admin", mode: "navigate", method: "GET" },
  ])
    handlers.fetch({
      request,
      respondWith: () => assert.fail("Private request intercepted"),
    });
  let result;
  handlers.fetch({
    request: {
      url: "https://admin.example/calendar",
      mode: "navigate",
      method: "GET",
    },
    respondWith: (promise) => {
      result = promise;
    },
  });
  assert.equal(await result, "/offline.html");
});

test("push displays notification and click stays on the app origin", async () => {
  const handlers = {};
  let displayed;
  let navigated;
  const client = {
    url: "https://admin.example/calendar",
    navigate: async (url) => {
      navigated = url;
    },
    focus: async () => {},
    postMessage: () => {},
  };
  vm.runInNewContext(readFileSync("src/service-worker.js", "utf8"), {
    URL,
    self: {
      location: { origin: "https://admin.example" },
      addEventListener: (name, handler) => {
        handlers[name] = handler;
      },
      registration: {
        showNotification: async (title, options) => {
          displayed = { title, options };
        },
      },
      clients: {
        matchAll: async () => [client],
        openWindow: async (url) => {
          navigated = url;
          return client;
        },
      },
    },
  });
  let task;
  handlers.push({
    data: {
      json: () => ({
        title: "Booking received",
        body: "Details",
        notification_id: "n1",
        icon: "https://untrusted.example/icon.png",
        badge: "https://untrusted.example/badge.png",
        data: { url: "https://untrusted.example" },
      }),
    },
    waitUntil: (promise) => {
      task = promise;
    },
  });
  await task;
  assert.equal(displayed.title, "Booking received");
  assert.equal(displayed.options.icon, "/icons/notification-icon.png?v=__BUILD_VERSION__");
  assert.equal(displayed.options.badge, "/icons/notification-badge.png?v=__BUILD_VERSION__");
  handlers.notificationclick({
    notification: { data: displayed.options.data, close: () => {} },
    waitUntil: (promise) => {
      task = promise;
    },
  });
  await task;
  assert.equal(navigated, "https://admin.example/notifications?open=n1");
});


test("temporary refresh failure preserves the session for retry", async () => {
  const auth = authHarness(async () => { throw new TypeError("offline"); });
  auth.setToken("retained");
  await assert.rejects(auth.refreshWebSession(), /Reconnect/);
  assert.equal(auth.readToken(), "retained");
});

test("separate tabs serialize rotating refresh cookies with the same origin lock", async () => {
  let tail = Promise.resolve(), concurrent = 0, peak = 0, cookie = 0;
  const locks = { request(_, action) { const result = tail.then(action); tail = result.catch(() => {}); return result; } };
  const fetch = async () => {
    const version = cookie;
    peak = Math.max(peak, ++concurrent);
    await Promise.resolve();
    assert.equal(cookie, version, "another tab must not rotate during this request");
    cookie++; concurrent--;
    return { ok: true, json: async () => ({ access_token: `token-${cookie}` }) };
  };
  const first = authHarness(fetch, { navigator: { locks } });
  const second = authHarness(fetch, { navigator: { locks } });
  assert.deepEqual(await Promise.all([first.refreshWebSession(), second.refreshWebSession()]), [true, true]);
  assert.equal(peak, 1);
  assert.equal(cookie, 2);
});


const jwt = (exp) => `e30.${Buffer.from(JSON.stringify({ exp, uid: 'admin', role: 'court_admin' })).toString('base64url')}.fixture`;
test('app restart restores a session from its persistent cookie without an access token', async () => {
  let options;
  const fresh = jwt(Math.floor(Date.now() / 1000) + 900);
  const auth = authHarness(async (_, init) => { options = init; return { ok: true, json: async () => ({ access_token: fresh }) }; });
  assert.equal(auth.readToken(), null);
  assert.equal(await auth.refreshWebSession(), true);
  assert.equal(options.credentials, 'include');
  assert.equal(auth.decodeAuth().isAuthenticated, true);
});
test('access expiry is renewed silently and does not discard the stale token prematurely', () => {
  const auth = authHarness(() => assert.fail('no network request expected'));
  const expired = jwt(Math.floor(Date.now() / 1000) - 1);
  auth.setToken(expired);
  assert.equal(auth.decodeAuth().isAuthenticated, false);
  assert.equal(auth.readToken(), expired);
  assert.equal(auth.tokenNeedsRefresh(), true);
  auth.setToken(jwt(Math.floor(Date.now() / 1000) + 30));
  assert.equal(auth.tokenNeedsRefresh(), true);
  auth.setToken(jwt(Math.floor(Date.now() / 1000) + 900));
  assert.equal(auth.tokenNeedsRefresh(), false);
});
test('late unauthorized requests do not rotate a fresh token again', async () => {
  const auth = authHarness(() => assert.fail('fresh session must be reused'));
  auth.setToken(jwt(Math.floor(Date.now() / 1000) + 900));
  assert.equal(await auth.refreshWebSession('old-token'), true);
});
test('malformed refresh responses preserve the session for retry', async () => {
  const auth = authHarness(async () => ({ ok: true, json: async () => ({}) }));
  auth.setToken('retained');
  await assert.rejects(auth.refreshWebSession(), /Reconnect/);
  assert.equal(auth.readToken(), 'retained');
});

test('login retains the requested route while a lazy destination mounts', () => {
  const states = [], destinations = [];
  let cursor = 0;
  const exports = {};
  const window = { location: { search: '?next=%2Fcalendar' } };
  const code = readFileSync('src/pages/Login.tsx', 'utf8').replace('import.meta.env.VITE_API_URL', 'undefined');
  vm.runInNewContext(ts.transpileModule(code, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, {
    exports, window, URLSearchParams,
    require(name) {
      if (name === 'react') return {
        useState(initial) {
          const index = cursor++;
          if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
          return [states[index], value => { states[index] = value; }];
        },
        useEffect(effect) { effect(); },
      };
      if (name === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null };
      if (name === 'react-router-dom') return { useNavigate: () => path => destinations.push(path) };
      if (name === '@/lib/auth') return { decodeAuth: () => ({ isAuthenticated: true, role: 'court_admin' }) };
      return {};
    },
  });
  exports.default();
  window.location.search = '';
  cursor = 0;
  exports.default();
  assert.deepEqual(destinations, ['/calendar', '/calendar']);
});
