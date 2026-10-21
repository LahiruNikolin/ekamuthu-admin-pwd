import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 393, height: 851 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const token = [
    "e30",
    Buffer.from(
      JSON.stringify({
        uid: "admin",
        role: "court_admin",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url"),
    "signature",
  ].join(".");
  let loggedIn = false;
  const blocks = Array.from({ length: 2000 }, (_, i) => ({
    id: String(i),
    court_id: "court1",
    court_name: "Test venue",
    play_area_name: `Area ${i}`,
    starts_at: "2026-10-19T10:00:00Z",
    ends_at: "2026-10-19T11:00:00Z",
    status: "reserved",
    booking_type: "admin_reservation",
  }));
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    let body = [];
    if (url.pathname.endsWith("/auth/refresh"))
      return route.fulfill({ status: 401, json: { error: "No session" } });
    if (url.pathname.endsWith("/auth/login")) {
      loggedIn = true;
      body = { access_token: token };
    } else if (!loggedIn) return route.fulfill({ status: 401, json: {} });
    else if (url.pathname.endsWith("/admin/courts"))
      body = [
        {
          id: "court1",
          name: "Test venue",
          timezone: "Asia/Colombo",
          is_active: true,
        },
      ];
    else if (url.pathname.endsWith("/admin/analytics"))
      body = {
        revenue_confirmed: 2000,
        occupancy_rate: 0.5,
        games_by_status: {
          completed: 2,
          confirmed: 3,
          cancelled: 0,
          no_show: 0,
        },
      };
    else if (url.pathname.endsWith("/calendar/days")) body = blocks;
    else if (url.pathname.endsWith("/users/me"))
      body = { name: "Admin", email: "admin@example.com", role: "court_admin" };
    else if (url.pathname.endsWith("/play-areas"))
      body = [{ id: "area1", name: "Main court" }];
    else if (url.pathname.endsWith("/users/search"))
      body = [{ id: "player1", name: "Test Player", username: "testplayer" }];
    else if (url.pathname.endsWith("/notifications"))
      body = {
        items: [
          {
            id: "n1",
            type: "GameCreated",
            payload: {
              title: "Booking received",
              body: "A player booked your venue.",
            },
            read_at: null,
          },
        ],
      };
    return route.fulfill({ json: body });
  });
  await page.goto("http://localhost:3002");
  await page.getByRole("heading", { name: "Sign in", exact: true }).waitFor();
  await page.getByLabel("Email or phone").fill("operator@example.com");
  await page.getByLabel("Password").fill("mock-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("heading", { name: "Test venue" }).waitFor();
  await page.getByRole("link", { name: "Calendar", exact: true }).click();
  await page.getByText("Area 0", { exact: true }).waitFor();
  assert.ok((await page.locator(".operator-calendar-block").count()) <= 14);
  const started = Date.now();
  await page.locator(".virtual-calendar").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.getByText("Area 1999", { exact: true }).waitFor();
  const scrollMs = Date.now() - started;
  assert.ok((await page.locator(".operator-calendar-block").count()) <= 14);
  console.log(
    `2,000 calendar entries: <=14 mounted rows; scroll to last row visible in ${scrollMs}ms with 4x CPU slowdown (desktop simulation).`,
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.getByRole("link", { name: "Players", exact: true }).click();
  await page.getByPlaceholder("Search players").fill("test");
  await page.getByText("Test Player", { exact: true }).waitFor();
  await page.getByRole("link", { name: "Account", exact: true }).last().click();
  await page.getByRole("link", { name: "Notifications", exact: true }).click();
  await page.getByRole("button", { name: /Booking received/ }).waitFor();
  await page.getByRole("link", { name: "Account", exact: true }).last().click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("heading", { name: "Sign in", exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => sessionStorage.getItem("access_token")),
    null,
  );
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.goto("http://localhost:3002/calendar");
  await page.getByRole("heading", { name: "You’re offline" }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: mobile login, navigation, 2,000 virtual calendar entries, player search, notification payloads, logout, layout, offline reload; mocked API only.",
  );
} finally {
  await browser.close();
}
