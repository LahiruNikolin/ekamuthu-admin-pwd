# Admin PWA

Read root AGENTS.md first. This project is an independent Android browser client. No imports from sibling apps, no React Native/Expo dependencies, and no changes to iOS routing or the operator web deployment.

Use `npm run build` (typecheck + production build), `npm test` (session/cache regression checks), and `node tests/browser-smoke.mjs` against `npm run preview -- --port 3002` (mocked API). Keep production backend/deployment configuration separate. README documents scope and rollout limitations. Run `npm run test:parity` against the production preview for mutation coverage.

Use the HTTP-only refresh cookie, sessionStorage access token, one in-flight refresh, and central API client. Never cache private API responses in the worker. New operations must use flexible/range booking and court timezone, and must invalidate relevant React Query keys after success. Keep PARITY.md aligned with implemented actions and distinguish fixture coverage from live staging/device verification. Browser push requires migration 061 and VAPID configuration in the backend; never claim it is deployed from a frontend build.

Android responsiveness is the top priority. Keep route bundles lazy, calendar DOM bounded, searches debounced and cancellable, and avoid continuous animation/blur. Preserve build size budgets. Verify large calendars under CPU slowdown, then use real Android hardware before making performance claims.

Calendar UX: default to a Monday–Sunday overview with all play areas visible. The default weekly view has a sticky time axis, seven day groups with nested play-area columns, and duration-positioned bookings. On narrow screens, keep play-area columns readable and horizontally scroll while retaining the time axis. A seven-day jump bar moves to each day without filtering out courts. Render only visible play-area lanes and time-window booking cards. Keep the compact seven-day count matrix in the Booking totals disclosure. Support all assigned venues with each venue’s timezone. Bound the overview to 12 court rows per page and keep detail lists/timeline windowed. Empty overview cells mean no bookings, not confirmed availability.

Calendar booking clicks open the shared booking details inside a native modal dialog. Keep the underlying calendar mounted so week, filters and scroll survive closing. Direct booking URLs remain supported.

Full screen reuses WeekTimeline directly so its appearance, nested day/play-area headers, day jump bar, fixed time axis, scrolling and booking-dialog behavior match the main calendar. The light calendar fills the available mobile viewport in both orientations. Keep only week navigation, refresh and Exit around it. Browser fullscreen is progressive enhancement; the viewport-filling dialog works when the API is unavailable. Keep the regular calendar mounted underneath.

Full screen has no court filter, courts-per-screen selector, or court pagination. Include every play area in the selected venue scope; pan horizontally through the nested columns.

The main calendar also has no play-area/court filter. Always include all play areas in the selected venue scope, even when an older link contains playAreaId. Booking links still carry playAreaId for precise detail lookup.

WeekTimeline supports grid-only two-finger pinch zoom (65–200%) and zoom buttons/reset. Scale lane widths and hourly spacing together, keep the pinch midpoint anchored, preserve native single-finger scrolling, and suppress accidental booking clicks after gestures. Coalesce updates with requestAnimationFrame and retain viewport-only rendering. Do not disable page zoom globally. Zoom preference is stored in sessionStorage after movement settles.

Local HTTPS API proxy uses an IPv4 keep-alive agent because the staging hostname can advertise an unreachable IPv6 route. Keep certificate verification enabled and proxy timeouts bounded. This setting applies to the Vite development proxy, not deployed API clients.

Production builds use Terser with two compression passes and explicit lazy domain chunks (calendar and venue tools). Keep onlyExplicitManualChunks enabled so shared runtime dependencies do not pull the calendar into login. Vite emits a build manifest; the performance gate counts the entry plus transitive static imports for its startup budget. Vercel settings live in vercel.json; its API rewrite targets staging until explicitly changed for production.
