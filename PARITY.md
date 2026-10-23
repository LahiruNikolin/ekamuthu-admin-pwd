# Admin mobile → Android PWA coverage

This inventory maps the native admin routes to independent browser implementations. Browser actions call the existing API contracts; native gesture controls are represented by browser buttons, forms, and a windowed timeline. New booking and play-area creation use the flexible model. Legacy slots remain readable/actionable for existing bookings.

| Native area | PWA route | Implemented actions |
|---|---|---|
| Login | `/login` | Email/phone, password visibility, session refresh, role gate, return destination |
| Dashboard | `/` | Today’s games first, monthly revenue/occupancy, booking/calendar/report shortcuts; venue selection in Settings only |
| Reports | `/reports` | Today/month/last month/all time/custom dates; venue and sys-admin platform summaries, paginated tables |
| Court calendar | `/calendar` | Monday–Sunday overview with nested play-area lanes, all assigned venue scope, sticky time axis, windowed rendering, pinch zoom, fullscreen, booking dialogs, range selection, refresh |
| Booking creation | `/bookings/new` | One-time booking, blocked time, weekly recurring, batch ranges, historical game, customer phone lookup |
| Booking details | `/bookings/:id` | Contact changes, full/partial release, connected legacy slot release, cancel game/slot, admin no-show, customer call/WhatsApp |
| Recurring reservations | Booking details | Contact changes, skip occurrence, end series, add/remove overrides |
| Games list/detail | `/games`, `/games/:id` | Status/date filters, paginated game cards, summary, organiser contacts, player roster, cancellation reason, management disclosures for cancellation/no-show/strikes |
| Players | `/players`, `/players/:id` | Debounced search, strike history, issue strike against game |
| Play areas | `/areas` | Single/group creation, group unit names, sports/surface/presets/minimum duration, player visibility, blocking relationships, edit/deactivate |
| Templates | `/templates`, `/templates/new`, `/templates/:id/edit` | Dedicated create/edit pages, single or paired weekday/weekend schedules, hourly pricing for new flexible ranges, overnight offsets, review, legacy range-price editing and quick fill, validation, delete, area-scoped activate/suspend |
| Closures | `/closures` | Facility/selected-area shutdowns, dates/reason, create/edit/delete |
| Venue photos | `/photos` | Resize/compress/upload, set cover, backend-synchronized delete |
| Venue overview/settings | `/venue`, `/settings` | Details, half-hour booking setting, late cancellation strike window, Maps share link |
| Promotions | `/promotions` | Active/ended, area/price/date/weekday/time filters, create/edit/end |
| Account | `/account` | Profile, password change, logout, notification preferences, legal links |
| Notifications | `/notifications` | All updates/Unread tabs, venue-time date groups, unread indicators, pagination, mark read/all, booking/game/calendar deep links |
| Browser push | Account + service worker | Permission/subscribe/unsubscribe, worker delivery outbox, click routing, foreground query refresh |
| Legal | `/terms`, `/privacy` | Public terms/privacy adapted for browser storage and notifications |

## Verification boundary

`npm test` exercises timezone conversion (including DST), refresh deduplication, logout failure/success, private-data cache exclusion, and push click origin safety. `npm run test:browser` uses a production build, intercepted APIs, a 393px viewport, 4× CPU slowdown, and 2,000 calendar entries. `npm run test:parity` exercises create/edit/destructive workflows against intercepted API fixtures, including conflict feedback and preservation of form values. These tests do not mutate real business data.

Build budgets enforce ≤90,000 initial and ≤130,000 total gzip JavaScript bytes. Agenda rows and timeline cells are windowed; games, notifications, and report tables are paginated. Route code is loaded on demand.

Live staging API authorization, database migration, provider push delivery, and installation/responsiveness on the affected Android hardware still require rollout validation. Browser fixtures prove UI/request behavior, not successful real database effects. No production migration or deployment is performed by these changes.

Price template range validation has unit coverage for duplicates, nested/reordered ranges, overnight offsets, recurring weekday/weekend boundaries, and conflicts with the active opposite day type on selected play areas. Mobile browser review verified renamed controls, disabled activation and an unsaved invalid recurring range. The updated parity fixture has not been rerun in this change.

Mobile UI refresh: dashboard, game list/details, notifications, account, player directory/history and report layouts reviewed against local staging-backed pages. Existing unit checks pass; parity selectors now open the game management disclosures, but the full mutation fixture has not been rerun for this UI change. No live booking or destructive action was submitted for visual review.
