# Ekamuthu Admin PWA

Independent Android-focused React/Vite browser app. The initial screens were copied from the operator console; this project imports no files from the React Native apps or other web projects. It has its own dependencies, build, service worker, and deployment. Existing iOS/Android release configuration is unchanged.

## Performance is the first priority

Route-level lazy loading keeps login JavaScript around 78 KB gzipped; the build fails above 90 KB for initial JS or 130 KB for all JS. The calendar mounts at most 14 fixed-height rows even with 2,000 entries. Search is debounced, obsolete calendar/search requests are cancelled, requests have bounded retries, and queries have a 30-second freshness window. Blurred headers and native WebView bridge code are absent.

The mobile browser smoke uses 4× CPU slowdown and a 2,000-entry fixture, asserts bounded DOM size and no horizontal overflow, and prints scroll-to-last-row latency. This is desktop simulation, not an Android benchmark. Run on the affected Android device before rollout. Large API payloads still need network/JSON decoding work; if real calendar responses are large, backend pagination should be a separate coordinated change.

## Current scope

The PWA includes booking and recurring reservation management, games and strikes, play areas/groups, schedules, shutdowns, photos, promotions, venue settings, reporting, accounts, and notifications. See [PARITY.md](PARITY.md) for the native-screen/action inventory and verification boundaries. All frontend code and dependencies stay inside this project; the additive backend changes support browser notifications.

## Local development

```sh
npm ci
cp .env.example .env
npm run dev
```

Open http://localhost:3002. The development server proxies `/api` to `API_PROXY_TARGET` (default http://localhost:8080). No production API is hardcoded. Use a test admin account against a test backend. Vite preview is only for checking the static build; it does not configure a production API proxy.

## Checks

```sh
npm run build
npm test
npm run preview -- --port 3002
# In another terminal, with Chromium available to Playwright:
npm run test:browser
npm run test:parity
```

The browser smoke uses intercepted API fixtures, a 393px mobile viewport, and the production service worker. It does not prove live authentication, real backend integration, Chrome's Android install dialog, or device performance.

## Independent deployment

1. Deploy `dist/` at the root of a **new dedicated HTTPS origin**. Never put this worker on the existing operator/iOS web origin. Build using `npm ci && npm run build`.
2. Route `/api/*` through a same-origin reverse proxy to the existing backend, preserving request cookies, Authorization and X-Admin-Web, and response Set-Cookie. Preserve `/api/v1/auth` cookie paths and forward HTTPS information. Do not cache API responses. See `deploy/nginx.conf` for an example; substitute the actual upstream and TLS setup.
3. Append the new public origin to backend `ADMIN_WEB_ORIGINS` without removing existing origins. Local development uses an existing allowlisted port only if configured; port 3002 must be allowed where the backend checks Origin.
4. Serve `/sw.js`, `/manifest.webmanifest`, `/offline.html`, and HTML with revalidation/no-cache; hashed `/assets/*` can be immutable. Return the SPA HTML for app routes, but never for missing assets or API routes.
5. On Android Chrome, open the HTTPS URL and choose **Install app** (in-app when offered, otherwise Chrome menu → Install app / Add to Home screen).

Do not change `ADMIN_OPERATOR_WEB_URL`, `ADMIN_APP_REQUIRE_WEBVIEW`, native EAS settings, app identifiers, or the iOS build. A direct cross-origin `VITE_API_URL` is supported, but browser third-party cookie restrictions can break refresh; prefer the same-origin proxy.

The service worker caches only a public offline page. Bookings and account data are not persisted in Cache Storage. Offline navigation shows a reconnect screen; offline mutations are not queued. Updated workers activate naturally after old windows close, avoiding forced reloads.

## Before Android rollout

Verify live login, refresh after expiry, close/reopen, logout/reopen, venue authorization, timezone display, and offline recovery against staging. Install on a real affected Android device and compare startup, scrolling, calendar switching, memory use, and resumed sessions. No Android performance fix is claimed until those checks pass. Keep native Android available until staging and device acceptance pass.

## Browser push rollout

The backend changes are additive and disabled when Web Push configuration is absent. Apply ordered migration `061_admin_web_push.sql` using the existing migration process, then configure `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, and `WEB_PUSH_SUBJECT` (a contact mailto/HTTPS URI) on the API and notification worker. Generate a persistent VAPID key pair securely; never expose the private key in Vite configuration. Existing Expo push tokens and delivery continue independently.

The API accepts admin-owned browser subscriptions; the worker queues and retries delivery separately from Expo. Notifications use the existing notification content and owner-scoped deep-link lookup. Production requires HTTPS and an explicit user permission choice in Account. Verify subscribe, foreground update, closed-window delivery, click-through, disable, and logout against staging before rollout. Migration and VAPID configuration have not been applied by this implementation.
