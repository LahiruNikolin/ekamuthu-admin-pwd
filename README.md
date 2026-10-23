# Ekamuthu Admin PWA

Independent Android-focused React/Vite browser app. The initial screens were copied from the operator console; this project imports no files from the React Native apps or other web projects. It has its own dependencies, build, service worker, and deployment. Existing iOS/Android release configuration is unchanged.

## Performance is the first priority

Route-level lazy loading keeps login JavaScript around 76 KB gzipped; the build fails above 90 KB for initial JS or 130 KB for all JS. The calendar mounts at most 14 fixed-height rows even with 2,000 entries. Search is debounced, obsolete calendar/search requests are cancelled, requests have bounded retries, and queries have a 30-second freshness window. Blurred headers and native WebView bridge code are absent.

The mobile browser smoke uses 4× CPU slowdown and a 2,000-entry fixture, asserts bounded DOM size and no horizontal overflow, and prints scroll-to-last-row latency. This is desktop simulation, not an Android benchmark. Run on the affected Android device before rollout. Large API payloads still need network/JSON decoding work; if real calendar responses are large, backend pagination should be a separate coordinated change.

## Current scope

The PWA includes booking and recurring reservation management, games and strikes, play areas/groups, schedules, shutdowns, photos, promotions, venue settings, reporting, accounts, and notifications. See [PARITY.md](PARITY.md) for the native-screen/action inventory and verification boundaries. All frontend code and dependencies stay inside this project; the additive backend changes support browser notifications.

## Local development

```sh
npm ci
cp .env.example .env
npm run dev
```

Open http://localhost:3002. `PROD=false` proxies `/api` to staging; `PROD=true` selects the production API. The explicit flag takes precedence over an old `API_PROXY_TARGET`. To use a local backend, remove `PROD` and set `API_PROXY_TARGET` (default http://localhost:8080). Restart the dev server after changing environment variables. Vite preview is only for checking the static build; it does not configure a production API proxy.

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

## Vercel

This standalone repository uses root directory `./`. The checked-in `vercel.mjs` selects Vite, runs `npm ci` and `npm run build`, and publishes `dist`. Select **Vite** in the import screen if it still shows Other; keep output directory `dist` and build command `npm run build`.

Set **PROD** in each Vercel project's Environment Variables, then redeploy:

| Value | API |
|---|---|
| `PROD=true` | Production Railway API |
| `PROD=false` | Staging Railway API |

Use `PROD=true` on the production PWA project and `PROD=false` on the separate staging project. Scope the variable to the intended Vercel environment (Production, Preview or Development); a preview should not inherit production access unintentionally. If `PROD` is missing, deployed routes default to staging. Invalid or empty values stop configuration with an actionable error. This replaces hostname-based API selection, so custom domains follow the same project setting.

Keep `VITE_API_URL=/api/v1` or remove it to use that default. This preserves same-origin HTTP-only refresh cookies. An explicit `PROD` rejects a conflicting direct `VITE_API_URL` rather than silently bypassing the selected proxy. `PROD` controls API routing only; it does not change Vite's built-in `import.meta.env.PROD`, minification or service-worker behavior. `API_PROXY_TARGET` is only a local-development fallback when `PROD` is absent. No backend origin allowlist changes are made by a frontend deployment.

SPA routes fall back to `index.html`; API paths and static assets are excluded from that fallback. API responses are not cached, and service-worker/manifest/offline assets revalidate. Browser-push migration and VAPID configuration remain separate backend rollout steps.

The production build uses Terser with two compression passes while retaining lazy route loading and both JavaScript size budgets. Do not bypass the performance check when configuring Vercel.
