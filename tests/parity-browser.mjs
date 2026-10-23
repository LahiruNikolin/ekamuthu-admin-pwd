import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ headless: true });
const requests = [];
const errors = [];
let debugPage;
try {
  const context = await browser.newContext({
    viewport: { width: 393, height: 851 },
    isMobile: true,
    hasTouch: true,
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const confirmPending = async () => {
    const dialog = page.getByRole("dialog", { name: "Confirm action", exact: true });
    if (await dialog.isVisible()) await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
  };
  debugPage = page;
  page.setDefaultTimeout(45000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  const token = [
    "e30",
    Buffer.from(
      JSON.stringify({
        uid: "admin",
        role: "court_admin",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url"),
    "sig",
  ].join(".");
  await context.addInitScript(
    (token) => sessionStorage.setItem("access_token", token),
    token,
  );
  let pushConfigured = false;
  const area = {
    id: "a1",
    name: "Main court",
    sport_types: ["Badminton"],
    booking_mode: "flexible",
    show_in_player_app: true,
    player_count_presets: [2, 4],
    minimum_player_booking_minutes: 30,
  };
  const court = {
    id: "c1",
    name: "Test venue",
    timezone: "Asia/Colombo",
    is_active: true,
    address: "https://maps.google.com/?q=test",
    allow_half_hour_bookings: true,
    late_cancel_strike_window_minutes: 60,
  };
  const block = {
    id: "b1",
    court_id: "c1",
    play_area_id: "a1",
    play_area_name: "Main court",
    starts_at: "2027-01-10T02:30:00Z",
    ends_at: "2027-01-10T04:30:00Z",
    price: 2000,
    status: "reserved",
    booking_type: "admin_reservation",
    reservation_purpose: "booking",
    is_flexible: true,
    flexible_booking_id: "b1",
    admin_contact_phone: "+94771234567",
    admin_contact_name: "Customer",
  };
  const game = {
    id: "g1",
    status: "completed",
    court_id: "c1",
    court_name: "Test venue",
    max_players: 4,
    creator_name: "Customer",
    creator_phone: "+94771234567",
    starts_at: "2026-01-10T02:30:00Z",
    players: [
      {
        user_id: "p1",
        name: "Player one",
        username: "player1",
        role: "creator",
        status: "accepted",
        strike_count: 0,
      },
    ],
  };
  const template = {
    id: "t1",
    name: "Weekdays",
    day_type: "weekday",
    is_active: false,
    entries: [
      {
        start_time: "08:00",
        end_time: "22:00",
        start_day_offset: 0,
        end_day_offset: 0,
        price: 1000,
        sort_order: 0,
      },
    ],
    activations: [],
  };
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace("/api/v1", "");
    const body = req.postDataJSON();
    if (req.method() !== "GET") {
      requests.push({ path, method: req.method(), body });
      if (path === "/admin/courts/c1/templates/t1/active") {
        template.is_active = body.is_active;
        template.activations = body.is_active ? [{play_area_id:"a1", play_area_name:"Main court"}] : [];
      }
      if (path === "/admin/courts/c1/half-hour-bookings")
        court.allow_half_hour_bookings = body.allow_half_hour_bookings;
      if (path === "/admin/reservations" && body.note === "conflict")
        return route.fulfill({
          status: 409,
          json: { error: "This time overlaps an existing booking" },
        });
      if (path.endsWith("/image-upload-url"))
        return route.fulfill({
          json: {
            upload_url: "https://upload.example/photo",
            public_url: "https://images.example/new.jpg",
          },
        });
      return route.fulfill({ json: { id: "saved", created_count: 1 } });
    }
    let data = [];
    if (path === "/admin/courts") data = [court];
    else if (path === "/courts/c1/play-areas") data = [area];
    else if (path === "/admin/sports")
      data = [{ id: "sport", name: "Badminton" }];
    else if (path === "/admin/calendar/days") data = [block];
    else if (path === "/admin/games") data = [game];
    else if (path === "/admin/games/g1") data = game;
    else if (path === "/admin/courts/c1/templates") data = [template];
    else if (path === "/admin/courts/c1/closures")
      data = [
        {
          id: "cl1",
          scope_type: "facility",
          start_date: "2027-02-01",
          end_date: "2027-02-02",
          reason: "Maintenance",
          status: "upcoming",
          play_areas: [],
        },
      ];
    else if (path === "/admin/courts/c1/promotions")
      data = [
        {
          id: "pr1",
          title: "Discount",
          play_area_id: "a1",
          play_area_name: "Main court",
          promo_hourly_price: 500,
          starts_at: "2027-02-01T00:00:00Z",
          ends_at: "2027-02-02T00:00:00Z",
          weekdays: [],
          status: "active",
        },
      ];
    else if (path === "/admin/players/lookup")
      data = { found: true, player: { id: "p1", name: "Player one" } };
    else if (path === "/users/me")
      data = { name: "Admin", email: "admin@example.com", role: "court_admin" };
    else if (path === "/users/search")
      data = [{ id: "p1", name: "Player one", username: "player1" }];
    else if (path === "/admin/users/p1/strikes")
      data = [
        {
          id: "s1",
          reason: "Missed game",
          created_at: "2026-01-01T10:00:00Z",
          court_name: "Test venue",
        },
      ];
    else if (path === "/notifications")
      data = {
        items: [
          {
            id: "n1",
            type: "AdminGameBooked",
            payload: { title: "New booking", game_id: "g1", court_id: "c1" },
            created_at: "2026-01-01T10:00:00Z",
          },
        ],
        total: 1,
        has_more: false,
      };
    else if (path === "/courts/c1")
      data = {
        ...court,
        image_urls: [
          "https://images.example/old.jpg",
          "https://images.example/second.jpg",
        ],
      };
    else if (path === "/admin/analytics")
      data = {
        revenue_confirmed: 1000,
        revenue_captured: 500,
        revenue_potential: 2000,
        occupancy_rate: 0.5,
        games_by_status: {
          completed: 1,
          confirmed: 2,
          cancelled: 0,
          no_show: 0,
        },
        peak_hour: 10,
      };
    else if (path === "/auth/web-push")
      data = { enabled: pushConfigured, public_key: "BAAB" };
    else errors.push("Unhandled GET " + path);
    return route.fulfill({ json: data });
  });
  await page.route("https://images.example/**", (route) => route.abort());
  await page.route("https://upload.example/**", (route) =>
    route.fulfill({ status: 200, body: "" }),
  );
  const goto = async (path) => {
    console.log("Checking", path);
    await page.goto("http://localhost:3002" + path, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator(".operator-header h1")).toHaveText("Test venue", {
      timeout: 45000,
    });
    if (!path.startsWith("/calendar"))
      await expect(page.locator("main h2").first()).toBeVisible({
        timeout: 45000,
      });
  };
  const last = (path) => requests.filter((r) => r.path === path).at(-1);
  const wait = async (path) => {
    await expect(page.locator("button[type=submit]:disabled")).toHaveCount(0, {
      timeout: 45000,
    });
    await expect.poll(() => last(path), { timeout: 45000 }).toBeTruthy();
    assert.ok(last(path), "missing " + path);
    return last(path).body;
  };
  // Create flexible, weekly, batch and historical bookings, and preserve form on conflict.
  await goto("/bookings/new?date=2027-01-10");
  await page.getByLabel("Customer phone").fill("+94771234567");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await confirmPending();
  assert.equal(
    (await wait("/admin/reservations")).starts_at,
    "2027-01-10T02:30:00.000Z",
  );
  await page.getByLabel("Action", { exact: true }).selectOption("weekly");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await confirmPending();
  await wait("/admin/recurring-reservations");
  await page.getByLabel("Action", { exact: true }).selectOption("block");
  await page.getByRole("button", { name: "Add another area/time" }).click();
  await confirmPending();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await confirmPending();
  assert.equal((await wait("/admin/reservations/batch")).items.length, 2);
  await page.getByLabel("Action", { exact: true }).selectOption("historical");
  await page.getByLabel("Start", { exact: true }).fill("2026-01-01T08:00");
  await page.getByLabel("End", { exact: true }).fill("2026-01-01T09:00");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await confirmPending();
  assert.ok((await wait("/admin/games/historical")).client_request_id);
  await page.getByLabel("Action", { exact: true }).selectOption("booking");
  await page.getByLabel("Note", { exact: true }).fill("conflict");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await confirmPending();
  await page.getByRole("alert").filter({ hasText: "overlaps" }).waitFor();
  assert.equal(
    await page.getByLabel("Note", { exact: true }).inputValue(),
    "conflict",
  );
  // Contact update + partial release.
  await goto("/bookings/b1?date=2027-01-10");
  await page.getByLabel("Customer name").fill("Updated");
  await page.getByRole("button", { name: "Save contact" }).click();
  await confirmPending();
  assert.equal(
    (await wait("/admin/flexible-reservations/b1/contact")).admin_contact_name,
    "Updated",
  );
  await page.getByLabel("Release start").fill("2027-01-10T08:30");
  await page.getByRole("button", { name: "Release selected time" }).click();
  await confirmPending();
  assert.equal(
    (await wait("/admin/flexible-reservations/b1/release")).starts_at,
    "2027-01-10T03:00:00.000Z",
  );
  // Game no-show + strike.
  await goto("/games/g1");
  await page.getByText("Report a no-show", { exact: true }).click();
  await page.getByRole("button", { name: "Mark no-show", exact: true }).click();
  await confirmPending();
  assert.equal((await wait("/admin/games/g1/status")).status, "no_show");
  await page.getByText("Issue a player strike", { exact: true }).click();
  await page.getByLabel("Player", { exact: true }).selectOption("p1");
  await page.getByLabel("Strike reason").fill("Absent");
  await page.getByRole("button", { name: "Issue strike" }).click();
  await confirmPending();
  assert.equal((await wait("/admin/games/g1/strikes")).user_id, "p1");
  // Area/group creation.
  await goto("/areas");
  await page.getByRole("button", { name: "Add play area or group" }).click();
  await confirmPending();
  await page.getByLabel("Name", { exact: true }).fill("New area");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await confirmPending();
  assert.equal((await wait("/courts/c1/play-areas")).booking_mode, "flexible");
  await page.getByRole("button", { name: "Add play area or group" }).click();
  await confirmPending();
  await page.getByLabel("Type", { exact: true }).selectOption("group");
  await page.getByLabel("Name", { exact: true }).fill("Nets");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await confirmPending();
  assert.equal(
    (await wait("/courts/c1/play-area-groups")).unit_names.length,
    2,
  );
  // Schedule creation and activation.
  await goto("/templates");
  await page.getByRole("link", { name: /New template/ }).click();
  await confirmPending();
  await page.getByLabel("Template name").fill("New template");
  await page.getByLabel("Hourly rate (LKR)", {exact:true}).nth(0).fill("1000");
  await page.getByLabel("Hourly rate (LKR)", {exact:true}).nth(1).fill("1200");
  await page.getByRole("button", { name: "Save template", exact: true }).click();
  await confirmPending();
  assert.equal(
    (await wait("/admin/courts/c1/template-sets")).weekday_entries.length,
    1,
  );
  await page
    .getByRole("button", { name: "Activate", exact: true })
    .first()
    .click();
  await confirmPending();
  await page.getByLabel("Main court", { exact: true }).check();
  await page
    .getByRole("button", { name: "Activate", exact: true })
    .first()
    .click();
  await confirmPending();
  assert.deepEqual(
    (await wait("/admin/courts/c1/templates/t1/active")).play_area_ids,
    ["a1"],
  );
  await goto("/templates");
  assert.equal(await page.getByRole("button", {name:"Activate",exact:true}).isEnabled(), false);
  // Shutdown, promotion, settings.
  await goto("/closures");
  await page
    .getByRole("button", { name: "Create shutdown", exact: true })
    .click();
  await confirmPending();
  await page.getByLabel("Reason", { exact: true }).fill("Closed");
  await page
    .getByRole("button", { name: "Create shutdown", exact: true })
    .last()
    .click();
  await confirmPending();
  await wait("/admin/courts/c1/closures");
  await goto("/promotions");
  await page.getByRole("button", { name: "New promotion" }).click();
  await confirmPending();
  await page.getByLabel("Promotional hourly price (LKR)").fill("750");
  await page.getByRole("button", { name: "Publish promotion" }).click();
  await confirmPending();
  assert.equal(
    (await wait("/admin/courts/c1/promotions")).promo_hourly_price,
    750,
  );
  await goto("/settings");
  await page
    .getByLabel("Late cancellation strike window (minutes)")
    .fill("120");
  await page.getByRole("button", { name: "Save", exact: true }).first().click();
  await confirmPending();
  assert.equal(
    (await wait("/admin/courts/c1/late-cancel-window"))
      .late_cancel_strike_window_minutes,
    120,
  );
  // Photos use backend deletion; reporting, notification navigation, password change.
  await goto("/photos");
  await page
    .getByRole("button", { name: "Delete", exact: true })
    .first()
    .click();
  await confirmPending();
  assert.equal(
    (await wait("/courts/c1/image")).public_url,
    "https://images.example/old.jpg",
  );
  await goto("/reports");
  await page.getByRole("heading", { name: "Games by status" }).waitFor();
  await goto("/notifications");
  await page.getByRole("button", { name: "Mark all read" }).click();
  await confirmPending();
  await wait("/notifications/read-all");
  await page.getByRole("button", { name: /New booking/ }).click();
  await confirmPending();
  await page.waitForURL("**/games/g1");
  assert.ok(last("/notifications/n1/read"));
  await goto("/account");
  await page.getByText("Change password", { exact: true }).first().click();
  await confirmPending();
  await page.getByLabel("Current password").fill("password-old");
  await page.getByLabel("New password", { exact: true }).fill("password-new");
  await page.getByLabel("Repeat new password").fill("password-new");
  await page
    .getByRole("button", { name: "Change password", exact: true })
    .click();
  await confirmPending();
  assert.equal((await wait("/auth/password")).new_password, "password-new");

  // Remaining weekly, blocker, edit/delete, and upload paths.
  block.recurring_booking_kind = "admin_reservation";
  block.recurring_booking_id = "r1";
  block.recurring_occurrence_id = "o1";
  await goto("/bookings/b1?date=2027-01-10");
  await page.getByRole("button", { name: "Skip this week" }).click();
  await confirmPending();
  await wait("/admin/recurring-reservations/occurrences/o1/skip");
  await page.getByRole("button", { name: "End weekly series" }).click();
  await confirmPending();
  await wait("/admin/recurring-reservations/r1/cancel");
  await page.getByLabel("Customer name").fill("Weekly customer");
  await page.getByRole("button", { name: "Save contact" }).click();
  await confirmPending();
  await wait("/admin/recurring-reservations/r1/contact");
  delete block.recurring_booking_id;
  delete block.recurring_occurrence_id;
  block.is_derived_blocker = true;
  block.can_override_blocker = true;
  block.blocking_source_play_area_id = "other";
  block.blocking_override_id = "ov1";
  await goto("/bookings/b1?date=2027-01-10");
  await page.getByLabel("Override reason").fill("Special arrangement");
  await page.getByRole("button", { name: "Allow this time" }).click();
  await confirmPending();
  assert.equal(
    (await wait("/admin/blocking-overrides")).source_play_area_id,
    "other",
  );
  await page.getByRole("button", { name: "Remove override" }).click();
  await confirmPending();
  await wait("/admin/blocking-overrides/ov1");
  delete block.is_derived_blocker;
  delete block.can_override_blocker;
  delete block.blocking_override_id;
  block.admin_outcome = "completed";
  block.starts_at = "2026-01-10T02:30:00Z";
  block.ends_at = "2026-01-10T03:30:00Z";
  await goto("/bookings/b1?date=2026-01-10");
  await page.getByRole("button", { name: "Mark booking no-show" }).click();
  await confirmPending();
  await wait("/admin/flexible-reservations/b1/outcome");
  game.status = "confirmed";
  await goto("/games/g1");
  await page.getByText("Cancel game", { exact: true }).first().click();
  await page.getByLabel("Cancellation reason").fill("Venue issue");
  await page.getByRole("button", { name: "Cancel game", exact: true }).click();
  await confirmPending();
  assert.equal((await wait("/admin/games/g1/cancel")).reason, "Venue issue");
  area.group_id = "gr1";
  area.group_name = "Group";
  await goto("/areas");
  await page.getByRole("button", { name: "Edit group" }).click();
  await confirmPending();
  await page.getByLabel("Name", { exact: true }).fill("Updated group");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await confirmPending();
  await wait("/courts/c1/play-area-groups/gr1");
  await page.getByRole("button", { name: "Edit area" }).click();
  await confirmPending();
  await page.getByLabel("Name", { exact: true }).fill("Updated area");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await confirmPending();
  await wait("/courts/c1/play-areas/a1");
  await page.getByRole("button", { name: "Deactivate", exact: true }).click();
  await confirmPending();
  assert.equal(last("/courts/c1/play-areas/a1").method, "DELETE");
  await goto("/templates");
  await page.getByRole("link", { name: "Edit", exact: true }).click();
  await confirmPending();
  await page.getByLabel("Template name").fill("Updated schedule");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await confirmPending();
  await wait("/admin/courts/c1/templates/t1");
  await page.getByRole("button", { name: "Suspend", exact: true }).click();
  await confirmPending();
  await page
    .getByRole("button", { name: "Suspend", exact: true })
    .first()
    .click();
  await confirmPending();
  assert.equal(
    (await wait("/admin/courts/c1/templates/t1/active")).is_active,
    false,
  );
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await confirmPending();
  assert.equal(last("/admin/courts/c1/templates/t1").method, "DELETE");
  await goto("/closures");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await confirmPending();
  await page.getByLabel("Reason", { exact: true }).fill("Updated maintenance");
  await page.getByRole("button", { name: "Update shutdown" }).click();
  await confirmPending();
  await wait("/admin/courts/c1/closures/cl1");
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await confirmPending();
  assert.equal(last("/admin/courts/c1/closures/cl1").method, "DELETE");
  await goto("/promotions");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await confirmPending();
  await page.getByLabel("Promotional hourly price (LKR)").fill("650");
  await page.getByRole("button", { name: "Publish promotion" }).click();
  await confirmPending();
  await wait("/admin/promotions/pr1");
  await page.getByRole("button", { name: "End promotion" }).click();
  await confirmPending();
  await wait("/admin/promotions/pr1/end");
  await goto("/photos");
  await page.getByRole("button", { name: "Set cover" }).last().click();
  await confirmPending();
  assert.equal(
    (await wait("/courts/c1/images")).image_urls[0],
    "https://images.example/second.jpg",
  );
  await page.waitForFunction(
    () => !document.querySelector("input[type=file]")?.disabled,
    null,
    { polling: 100 },
  );
  await page
    .locator("input[type=file]")
    .setInputFiles(
      new URL("../public/icons/icon-192.png", import.meta.url).pathname,
    );
  await page
    .getByRole("status")
    .filter({ hasText: "Photos uploaded" })
    .waitFor();
  assert.equal(
    last("/courts/c1/images").body.image_urls.at(-1),
    "https://images.example/new.jpg",
  );
  await goto("/settings");
  await page.getByLabel("Allow half-hour bookings").click();
  await confirmPending();
  await expect(page.getByLabel("Allow half-hour bookings")).not.toBeChecked();
  assert.equal(
    (await wait("/admin/courts/c1/half-hour-bookings"))
      .allow_half_hour_bookings,
    false,
  );
  await page
    .getByLabel("Google Maps share link")
    .fill("https://maps.google.com/?q=updated");
  await page.getByRole("button", { name: "Save", exact: true }).last().click();
  await confirmPending();
  await wait("/admin/courts/c1/maps-link");
  await goto("/calendar?date=2027-01-10");
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  await confirmPending();
  await page.getByRole("region", { name: "Booking timeline" }).waitFor();
  assert.ok((await page.locator(".timeline-cell").count()) < 100);
  await page.screenshot({
    path: "/tmp/admin-pwa-timeline.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Select multiple times" }).click();
  await confirmPending();
  await page.locator(".timeline-cell").first().click();
  await confirmPending();
  await page.getByRole("button", { name: "Book/block 1 ranges" }).click();
  await confirmPending();
  await page.getByLabel("Start", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("Start", { exact: true }).inputValue(),
    "2027-01-10T00:00",
  );
  // Browser permission/subscription lifecycle is mocked; provider delivery is a staging check.
  pushConfigured = true;
  await context.addInitScript(() => {
    let subscribed = false;
    const subscription = {
      endpoint: "https://fcm.googleapis.com/fcm/send/fixture",
      toJSON() {
        return {
          endpoint: this.endpoint,
          keys: { p256dh: "fixture", auth: "fixture" },
        };
      },
      async unsubscribe() {
        subscribed = false;
        return true;
      },
    };
    const registration = {
      active: {},
      getNotifications: async () => [],
      pushManager: {
        getSubscription: async () => (subscribed ? subscription : null),
        subscribe: async () => {
          subscribed = true;
          return subscription;
        },
      },
    };
    Object.defineProperty(navigator, "serviceWorker", {
      value: {
        getRegistration: async () => registration,
        register: async () => registration,
        addEventListener() {},
        removeEventListener() {},
      },
    });
    Object.defineProperty(Notification, "requestPermission", {
      value: async () => "granted",
    });
  });
  await goto("/account");
  await page
    .getByRole("button", { name: "Enable notifications", exact: true })
    .click();
  await confirmPending();
  await expect(
    page.getByRole("button", { name: "Disable notifications", exact: true }),
  ).toBeEnabled();
  assert.equal(last("/auth/web-push").method, "POST");
  await page
    .getByRole("button", { name: "Disable notifications", exact: true })
    .click();
  await confirmPending();
  await expect(
    page.getByRole("button", { name: "Enable notifications", exact: true }),
  ).toBeEnabled();
  assert.equal(last("/auth/web-push").method, "DELETE");
  assert.deepEqual(errors, []);
  console.log(
    `PASS: ${requests.length} mutation requests across booking, games, groups, schedules, shutdowns, promotions, settings, photos, notifications, password; mocked backend.`,
  );
} catch (e) {
  console.error(
    "At",
    debugPage?.url(),
    await debugPage?.locator("h1").evaluateAll((nodes) =>
      nodes.map((n) => ({
        html: n.outerHTML,
        rect: n.getBoundingClientRect().toJSON(),
        visibility: getComputedStyle(n).visibility,
      })),
    ),
    await debugPage?.locator("body").ariaSnapshot(),
    errors,
    requests.slice(-3),
  );
  throw e;
} finally {
  await browser.close();
}
