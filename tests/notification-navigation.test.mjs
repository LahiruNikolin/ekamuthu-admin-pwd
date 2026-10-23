import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";

function screen(notification, { openId = "", readFails = false } = {}) {
  const exports = {}, routes = [], receipts = [], venues = [], effects = [];
  const jsx = (type, props) => ({ type, props });
  const code = ts.transpileModule(readFileSync("src/features/Notifications.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, {
    exports, URLSearchParams,
    require(name) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
      if (name === "react") return {
        useState: (initial) => [initial, () => {}],
        useRef: (current) => ({ current }),
        useEffect: (fn) => effects.push(fn),
      };
      if (name === "react-router-dom") return {
        useNavigate: () => (path, options) => routes.push({ path, replace: !!options?.replace }),
        useSearchParams: () => [new URLSearchParams(openId ? { open: openId } : {})],
      };
      if (name === "./shared") return {
        useData: (path) => ({ data: path.startsWith("/notifications?") ? { items: [notification] } : notification }),
        // A read acknowledgement is deliberately never resolved in the slow case.
        useAction: () => ({ run: (fn) => fn().catch(() => false) }),
        adminApi: { patch(path) { receipts.push(path); return readFails ? Promise.reject(new Error("offline")) : new Promise(() => {}); } },
      };
      return { colomboDateKey: () => "2026-11-04", addDays: () => "2026-11-03", displayTime: () => "4:00 AM", fullDate: () => "Nov 4" };
    },
  });
  const tree = exports.default({ courts: [], setSelectedCourtId: (id) => venues.push(id) });
  function find(value) {
    if (!value || typeof value !== "object") return;
    if (value.props?.className?.startsWith("notification-row")) return value;
    for (const child of Object.values(value)) {
      const found = Array.isArray(child) ? child.map(find).find(Boolean) : find(child);
      if (found) return found;
    }
  }
  return { routes, receipts, venues, click: () => find(tree).props.onClick(), openPush: () => effects.forEach((fn) => fn()) };
}

test("created and cancelled alerts open their game without waiting for read acknowledgements", () => {
  for (const type of ["AdminGameBooked", "AdminGameCancelled", "GameCreated", "GameCancelled", "game.cancelled.schedule_change"]) {
    const h = screen({ id: "n1", type, created_at: "2026-11-04T00:00:00Z", payload: { entity_id: "game1", court_id: "court1" } });
    h.click();
    assert.deepEqual(h.routes, [{ path: "/games/game1", replace: false }]);
    assert.deepEqual(h.receipts, ["/notifications/n1/read"]);
    assert.deepEqual(h.venues, ["court1"]);
  }
});

test("push-open routes use server game_id and replace the intermediate feed history entry", () => {
  const h = screen({ id: "n1", type: "AdminGameBooked", payload: { game_id: "game1", entity_id: "other" } }, { openId: "n1" });
  h.openPush();
  assert.deepEqual(h.routes, [{ path: "/games/game1", replace: true }]);
});

test("read failures cannot prevent navigation and game IDs cannot inject another route", async () => {
  const h = screen({ id: "n1", type: "AdminGameCancelled", created_at: "2026-11-04T00:00:00Z", payload: { game_id: "game/one?next=elsewhere" } }, { readFails: true });
  h.click();
  await Promise.resolve();
  assert.deepEqual(h.routes, [{ path: "/games/game%2Fone%3Fnext%3Delsewhere", replace: false }]);
});

test("reservation alerts still open booking details instead of treating reservation IDs as games", () => {
  const h = screen({ id: "n1", type: "AdminReservationReleased", created_at: "2026-11-04T00:00:00Z", payload: { entity_id: "reservation1", court_id: "court1" } });
  h.click();
  assert.equal(h.routes[0].path, "/bookings/reservation1?courtId=court1");
});

test("a browser push click with the app closed resolves its owned notification into game details", async () => {
  const handlers = {};
  let opened, task;
  vm.runInNewContext(readFileSync("src/service-worker.js", "utf8"), {
    URL,
    self: {
      location: { origin: "https://admin.example" },
      addEventListener: (type, handler) => { handlers[type] = handler; },
      clients: { matchAll: async () => [], openWindow: async (url) => { opened = url; return { focus: async () => {} }; } },
    },
  });
  handlers.notificationclick({
    notification: { close() {}, data: { notification_id: "cancel1", url: "https://untrusted.example" } },
    waitUntil: (promise) => { task = promise; },
  });
  await task;
  const url = new URL(opened);
  assert.equal(url.origin, "https://admin.example");
  assert.equal(url.pathname, "/notifications");
  const h = screen({ id: "cancel1", type: "AdminGameCancelled", payload: { game_id: "cancelled-game" } }, { openId: url.searchParams.get("open") });
  h.openPush();
  assert.deepEqual(h.routes, [{ path: "/games/cancelled-game", replace: true }]);
});
