import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";
const exports = {};
vm.runInNewContext(
  ts.transpileModule(readFileSync("src/lib/browser-push.ts", "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  { exports, Uint8Array, atob },
);
const key = Uint8Array.from([4, 251, 255, 12]);
function subscription(bytes, events) {
  return {
    options: { applicationServerKey: bytes?.buffer },
    unsubscribe: async () => {
      events.push("unsubscribe");
      return true;
    },
  };
}

test("URL-safe unpadded VAPID keys preserve every byte", () => {
  assert.deepEqual(
    exports.pushKey(Buffer.from(key).toString("base64url")),
    key,
  );
});

test("subscription state rejects another environment's VAPID key or missing key metadata", () => {
  assert.equal(exports.samePushKey(subscription(key, []), key), true);
  assert.equal(
    exports.samePushKey(
      subscription(Uint8Array.from([4, 251, 255, 13]), []),
      key,
    ),
    false,
  );
  assert.equal(
    exports.samePushKey(subscription(Uint8Array.from([4]), []), key),
    false,
  );
  assert.equal(exports.samePushKey(subscription(null, []), key), false);
});

test("switching backend keys unsubscribes the old endpoint before creating a fresh subscription", async () => {
  const events = [];
  const old = subscription(Uint8Array.from([9]), events);
  const fresh = {};
  const registration = {
    pushManager: {
      getSubscription: async () => old,
      subscribe: async (options) => {
        events.push("subscribe");
        assert.equal(options.userVisibleOnly, true);
        assert.equal(options.applicationServerKey, key);
        return fresh;
      },
    },
  };
  assert.equal(await exports.browserSubscription(registration, key), fresh);
  assert.deepEqual(events, ["unsubscribe", "subscribe"]);
});

test("a matching subscription is reused and a new browser subscribes without an unsubscribe", async () => {
  const events = [];
  const current = subscription(key, events);
  const registration = {
    pushManager: {
      getSubscription: async () => current,
      subscribe: async () => {
        events.push("subscribe");
        return current;
      },
    },
  };
  assert.equal(await exports.browserSubscription(registration, key), current);
  assert.deepEqual(events, []);
  registration.pushManager.getSubscription = async () => null;
  assert.equal(await exports.browserSubscription(registration, key), current);
  assert.deepEqual(events, ["subscribe"]);
});

test("a failed unsubscribe does not create a second subscription under a new key", async () => {
  const events = [];
  const old = {
    options: {},
    unsubscribe: async () => {
      throw new Error("retry");
    },
  };
  await assert.rejects(
    exports.browserSubscription(
      {
        pushManager: {
          getSubscription: async () => old,
          subscribe: async () => events.push("subscribe"),
        },
      },
      key,
    ),
    /retry/,
  );
  assert.deepEqual(events, []);
});
