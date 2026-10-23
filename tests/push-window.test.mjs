import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const destination = "https://admin.example/notifications?open=notice%2F1";
function click(clients) {
  const handlers = {};
  let task;
  vm.runInNewContext(readFileSync("src/service-worker.js", "utf8"), {
    URL,
    self: { location: { origin: "https://admin.example" }, clients, addEventListener: (name, handler) => { handlers[name] = handler; } },
  });
  handlers.notificationclick({
    notification: { close() {}, data: { notification_id: "notice/1", url: "https://untrusted.example" } },
    waitUntil: (promise) => { task = promise; },
  });
  return task;
}

test("notification clicks launch immediately without waiting on hidden or stale clients", async () => {
  const actions = [];
  const task = click({
    openWindow: async (url) => { actions.push(url); return { focus: async () => actions.push("focus") }; },
    matchAll: () => assert.fail("window discovery must not delay the launch"),
  });
  assert.deepEqual(actions, [destination]);
  await task;
  assert.deepEqual(actions, [destination, "focus"]);
});

test("a focus failure after successful launch does not open duplicate windows", async () => {
  let opens = 0;
  await click({
    openWindow: async () => { opens++; return { focus: async () => { throw new Error("NotAllowedError"); } }; },
    matchAll: () => assert.fail("already opened the destination"),
  });
  assert.equal(opens, 1);
});

for (const outcome of ["rejected", "null"]) {
  test(`a ${outcome} launch falls back to focusing before navigating an existing window`, async () => {
    const actions = [];
    const client = {
      url: "https://admin.example/calendar",
      focus: async () => actions.push("focus"),
      navigate: async (url) => { actions.push(url); return client; },
    };
    await click({
      openWindow: async () => { if (outcome === "rejected") throw new Error("InvalidAccessError"); return null; },
      matchAll: async () => [client],
    });
    assert.deepEqual(actions, ["focus", destination]);
  });
}

test("closed windows and failed navigations do not prevent trying the next usable window", async () => {
  const actions = [];
  const client = { url: "https://admin.example/calendar", focus: async () => {}, navigate: async (url) => { actions.push(url); return client; } };
  await click({
    openWindow: async () => null,
    matchAll: async () => [
      { url: "https://other.example", focus: () => assert.fail("wrong origin") },
      { url: "https://admin.example/stale", focus: async () => { throw new Error("closed"); } },
      { url: "https://admin.example/frozen", focus: async () => {}, navigate: async () => { throw new Error("navigation failed"); } },
      { url: "https://admin.example/gone", focus: async () => {}, navigate: async () => null },
      client,
    ],
  });
  assert.deepEqual(actions, [destination]);
});

test("an unavailable destination is reported instead of silently succeeding", async () => {
  await assert.rejects(click({ openWindow: async () => null, matchAll: async () => [] }), /Could not open/);
});
