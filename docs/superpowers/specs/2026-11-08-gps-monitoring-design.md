# GPS Monitoring App — Design Spec

Date: 2026-11-08
Status: Approved by user, ready for implementation planning

## Purpose

A corruption-control GPS monitoring tool for a company's field employees
(e.g., couriers, drivers). Employees are tracked **with their informed,
recorded consent**, obtained via a personal one-time consent link. The
system flags location anomalies (leaving an assigned zone, moving outside
work hours, unexplained long stops, lost signal) for the admin to review.

**Hard constraint (non-negotiable, confirmed with the user):**
- Tracking starts only after the employee has explicitly consented via
  their link, and consent is timestamped and stored.
- While the consent/tracking page is open, it must display a persistent,
  visible banner: "🛰️ GPS kuzatuv FAOL" — the employee must always be
  able to see that tracking is active while it is happening.
- No microphone / audio capture of any kind. Location data only.
- No feature may be added that works covertly or without the employee's
  visible knowledge while it is active.

## Users

- **Admin** (manager/compliance officer): the only user with an account
  and a dashboard. Manages employees, zones, views the map, consent
  status, and alerts.
- **Employee**: has no account, no login, and no dashboard. Their only
  touchpoint is a personal link (`/consent/:token`) they open themselves.
  That same page, after consent, becomes the page that streams their
  location while kept open, continuing to show the active-tracking
  banner. Nothing else is visible to them (no map, no other employees,
  no settings).

## Consent Flow

1. Admin adds an employee (name, phone, position) in the dashboard.
2. The system generates a unique consent token and consent URL
   (`/consent/<token>`), and a consent SMS message. Since no SMS
   provider is wired up yet, the message + link are written to the
   server log/console in this phase (swap-in point for a real provider
   later — e.g. Eskiz.uz — is a single function, `sendSms()`).
3. Employee opens the link. Page shows: who is asking, why (corruption
   control via GPS location monitoring — explicit, in plain language),
   and a single "Roziman" (I consent) button. No tracking happens before
   this click.
4. On consent, the server timestamps it (`consented_at`) and the same
   page switches into tracking mode: shows the "GPS kuzatuv FAOL" banner
   and begins reading the browser's geolocation every 30 seconds via
   `navigator.geolocation.getCurrentPosition`, for as long as the page
   stays open — no app installation, nothing beyond the browser tab.
5. If the employee revisits the link after consenting, they go straight
   to the tracking page (consent is remembered server-side by token).
6. If an employee has not yet consented, admin sees status "kutilmoqda"
   (pending) for them, and location data is neither requested nor
   accepted for that employee (server rejects location submissions for
   an employee without a stored consent).

## Offline Handling

The employee's phone does not need a constant internet connection.
Each GPS reading is first stored in the browser's local storage
(client-side queue), independent of connectivity. The page then tries
to send the queued readings to the server as a batch:
- On every reading, and
- Immediately when the browser reports it is back online
  (`window.addEventListener('online', ...)`).

A send only clears an item from the local queue once the server has
accepted it (HTTP success). If sending fails (no connection), the
readings stay queued and are retried on the next attempt — nothing is
collected only to be silently dropped. This means a reading taken while
offline is still recorded locally and reaches the server, with its true
original timestamp, as soon as connectivity returns; the server
processes a batch of points in timestamp order so zone/work-hours/
long-stop/signal-loss checks apply to each point as if it had arrived
individually. The local queue lives only in that browser tab/profile —
if the employee clears site data before reconnecting, those unsent
readings are lost (acceptable for the MVP; a durable server-side queue
is future work, not in scope here).

## Anomaly Detection (MVP rules)

Run as a simple rule check on each incoming location ping:

1. **Zone violation**: point falls outside the employee's assigned work
   zone (a circle: center lat/lng + radius in meters).
2. **Outside work hours**: ping arrives outside the employee's
   configured work-hours window.
3. **Unexplained long stop**: employee's position hasn't moved more than
   ~50m for 15+ minutes, and the stop location isn't a declared zone
   (e.g. depot/break point) — placeholder rule, kept simple for MVP.
4. **Signal loss**: no ping received for 10+ minutes during work hours
   while consent is active.

Each triggered rule writes a row to `alerts` (employee_id, type, details,
timestamp, resolved: boolean) and shows up in the admin dashboard's
alerts list. No automatic action beyond that (no auto-notification
channel in MVP beyond the dashboard itself).

## Data Model (SQLite)

- `employees`: id, name, phone, position, created_at
- `consents`: id, employee_id, token (unique), status (pending |
  consented), consented_at
- `locations`: id, employee_id, lat, lng, recorded_at
- `zones`: id, employee_id, center_lat, center_lng, radius_m,
  work_start, work_end (work-hours window)
- `alerts`: id, employee_id, type, details, created_at, resolved

## Architecture

- **Backend**: Node.js + Express, SQLite via `better-sqlite3` (no
  separate DB server to run).
- **Views**: server-rendered EJS templates — no frontend build step.
  - Admin: `/admin/login`, `/admin` (employee list + add), `/admin/map`
    (Leaflet + OpenStreetMap tiles — no API key needed), `/admin/alerts`.
  - Employee: `/consent/:token` (serves either the consent screen or,
    post-consent, the tracking screen, based on stored status).
- **Admin auth**: single admin account, session-based login (seeded via
  env var or a setup script on first run) — simple, no self-signup.
- **Anomaly checks**: run synchronously right after each location insert
  (simplest for MVP; revisit if volume grows).
- **SMS**: `sendSms(phone, message)` function that currently
  `console.log`s / writes to a log file; swapping in Eskiz.uz later is a
  one-function change.

## Testing

- Unit tests (e.g. with `node:test` or `vitest`) for the anomaly rules:
  zone-violation distance calculation, work-hours check, stop detection,
  signal-loss detection — pure functions, easy to test in isolation.
- A couple of integration-level tests for the consent flow (POST
  location rejected before consent, accepted after).

## Explicitly out of scope

- Microphone / audio capture (explicitly declined by user).
- Native mobile app (web-only, browser geolocation).
- Real SMS delivery (stubbed to console/log for this phase).
- Any tracking that is not visibly indicated to the employee while active.
