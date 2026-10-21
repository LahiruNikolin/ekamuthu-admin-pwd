import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";

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
      require: () => ({ jwtDecode: () => ({}) }),
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
  vm.runInNewContext(readFileSync("src/service-worker.js", "utf8"), {
    URL,
    self: {
      location: { origin: "https://admin.example" },
      addEventListener: (type, handler) => {
        handlers[type] = handler;
      },
    },
    fetch: async () => {
      throw new Error("offline");
    },
    caches: {
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
        openWindow: async () =>
          assert.fail("existing client should be focused"),
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
        data: { url: "https://untrusted.example" },
      }),
    },
    waitUntil: (promise) => {
      task = promise;
    },
  });
  await task;
  assert.equal(displayed.title, "Booking received");
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
