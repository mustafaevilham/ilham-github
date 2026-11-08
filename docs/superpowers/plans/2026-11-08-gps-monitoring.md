# GPS Monitoring App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a consent-based GPS monitoring web app: an admin dashboard for managing employees/zones/alerts, and a token-based employee consent + location-reporting page, with automatic anomaly detection.

**Architecture:** A single Node.js + Express app in `gps-monitoring/`, server-rendered with EJS views, backed by SQLite (`better-sqlite3`). The app is built as a factory function (`createApp(db, options)`) over an injected DB handle so tests can run against an in-memory database. Anomaly-detection math lives in pure, dependency-free functions (`src/anomaly.js`) separated from the DB-wired code that calls them (`src/anomalyRunner.js`), so the rules are unit-testable without a database.

**Tech Stack:** Node.js (v18+), Express, `better-sqlite3`, `ejs`, `express-session`, `bcryptjs`. Tests use Node's built-in `node:test` + `node:assert` runner, plus `supertest` for HTTP-level integration tests.

**Spec:** `docs/superpowers/specs/2026-11-08-gps-monitoring-design.md`

## Global Constraints

- Tracking for an employee may only start after their consent is recorded (`consents.status = 'consented'`); the server must reject location pings for an employee without a stored, consented row.
- While the employee's tracking page is open and active, it must display the persistent banner "🛰️ GPS kuzatuv FAOL".
- No microphone or audio capture of any kind, anywhere in this app.
- No native mobile app; browser-only (`navigator.geolocation`).
- SMS sending is stubbed to the console/log in this phase (`sendSms(phone, message)` is the single swap-in point for a real provider later).
- Employees have no login/account and no admin-side views; their only surface is `/consent/:token`.
- Admin is a single seeded account (session-based login), not self-signup.

## Review Focus

- A location ping arriving for a `pending` (not yet consented) employee must be rejected outright, not silently stored — covered in Task 7.
- An invalid/unknown consent token must return a plain 404 without revealing whether a matching employee/phone exists — covered in Task 7.
- Zone-boundary checks must use true great-circle distance (haversine), so a point just inside vs. just outside the radius is classified correctly — not a naive lat/lng delta — covered in Task 3.
- A work-hours window that wraps past midnight (e.g. a `22:00`–`06:00` night shift) must be evaluated correctly in both the "inside" and "outside" cases — covered in Task 3.
- The long-stop check must not false-positive on a short/sparse location history (e.g. right after an employee first consents) — it must require the stationary run to actually span the full threshold duration — covered in Task 3.

---

## Task 1: Project scaffold & SQLite schema

**Files:**
- Create: `gps-monitoring/package.json`
- Create: `gps-monitoring/src/db.js`
- Test: `gps-monitoring/test/db.test.js`

**Interfaces:**
- Produces: `createDb(path?: string) -> DatabaseInstance` (a `better-sqlite3` `Database`, schema already applied). Default `path` is `'./data/app.db'`; tests pass `':memory:'`.

- [ ] **Step 1: Create `package.json` and install dependencies**

```json
{
  "name": "gps-monitoring",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "start": "node server.js",
    "test": "node --test test/"
  },
  "dependencies": {
    "better-sqlite3": "^11.3.0",
    "bcryptjs": "^2.4.3",
    "ejs": "^3.1.10",
    "express": "^4.21.0",
    "express-session": "^1.18.1"
  },
  "devDependencies": {
    "supertest": "^7.0.0"
  }
}
```

Run `npm install` inside `gps-monitoring/`.

- [ ] **Step 2: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert');
const { createDb } = require('../src/db');

test('createDb creates all five tables', () => {
  const db = createDb(':memory:');
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  ).all().map(r => r.name);
  assert.deepStrictEqual(tables, ['alerts', 'consents', 'employees', 'locations', 'zones']);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test` (from `gps-monitoring/`)
Expected: FAIL — `Cannot find module '../src/db'`

- [ ] **Step 4: Implement `createDb(path = './data/app.db')` in `src/db.js`**

Use `better-sqlite3`. Open the DB at `path`, then `db.exec(...)` the schema below (one `CREATE TABLE IF NOT EXISTS` per table), then return the `db` handle.

```sql
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  position TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS consents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  consented_at TEXT,
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  recorded_at TEXT NOT NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL UNIQUE,
  center_lat REAL NOT NULL,
  center_lng REAL NOT NULL,
  radius_m REAL NOT NULL,
  work_start TEXT NOT NULL,
  work_end TEXT NOT NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);
```

If `path !== ':memory:'`, ensure the parent directory exists (`fs.mkdirSync(path.dirname(path), { recursive: true })`) before opening.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Add `.gitignore` and commit**

Create `gps-monitoring/.gitignore` with:
```
node_modules/
data/
```

```bash
git add gps-monitoring/package.json gps-monitoring/package-lock.json gps-monitoring/src/db.js gps-monitoring/test/db.test.js gps-monitoring/.gitignore
git commit -m "gps-monitoring: add DB schema (employees, consents, locations, zones, alerts)"
```

---

## Task 2: SMS stub

**Files:**
- Create: `gps-monitoring/src/sms.js`
- Test: `gps-monitoring/test/sms.test.js`

**Interfaces:**
- Produces: `sendSms(phone: string, message: string) -> void`

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert');
const { sendSms } = require('../src/sms');

test('sendSms logs the phone and message', () => {
  const lines = [];
  const originalLog = console.log;
  console.log = (line) => lines.push(line);
  try {
    sendSms('+998901234567', 'Roziman: http://example.test/consent/abc');
  } finally {
    console.log = originalLog;
  }
  assert.strictEqual(lines.length, 1);
  assert.match(lines[0], /\+998901234567/);
  assert.match(lines[0], /Roziman: http:\/\/example\.test\/consent\/abc/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/sms'`

- [ ] **Step 3: Implement `sendSms(phone, message)` in `src/sms.js`**

Logs a single line: `` `[SMS -> ${phone}] ${message}` `` via `console.log`. This is the only function to replace when wiring in a real provider later.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add gps-monitoring/src/sms.js gps-monitoring/test/sms.test.js
git commit -m "gps-monitoring: add SMS stub (logs to console)"
```

---

## Task 3: Anomaly detection — pure functions

**Files:**
- Create: `gps-monitoring/src/anomaly.js`
- Test: `gps-monitoring/test/anomaly.test.js`

**Interfaces:**
- Produces:
  - `haversineDistanceMeters(lat1, lng1, lat2, lng2) -> number`
  - `isOutsideZone(lat, lng, zone: {center_lat, center_lng, radius_m}) -> boolean`
  - `isOutsideWorkHours(date: Date, zone: {work_start: string /* "HH:MM" */, work_end: string}) -> boolean`
  - `detectLongStop(points: Array<{lat: number, lng: number, recorded_at: string}>, thresholdMeters = 50, thresholdMinutes = 15) -> boolean` — `points` must be sorted ascending by `recorded_at`.
  - `detectSignalLoss(lastRecordedAt: string | null, now: Date, thresholdMinutes = 10) -> boolean`

- [ ] **Step 1: Write the failing tests**

```js
const test = require('node:test');
const assert = require('node:assert');
const {
  haversineDistanceMeters, isOutsideZone, isOutsideWorkHours,
  detectLongStop, detectSignalLoss,
} = require('../src/anomaly');

test('haversineDistanceMeters: same point is ~0m', () => {
  assert.ok(haversineDistanceMeters(41.3, 69.2, 41.3, 69.2) < 0.001);
});

test('isOutsideZone: point just inside the radius is not outside', () => {
  const zone = { center_lat: 41.3, center_lng: 69.2, radius_m: 1000 };
  // ~900m north of center
  assert.strictEqual(isOutsideZone(41.30809, 69.2, zone), false);
});

test('isOutsideZone: point just outside the radius is outside', () => {
  const zone = { center_lat: 41.3, center_lng: 69.2, radius_m: 1000 };
  // ~1100m north of center
  assert.strictEqual(isOutsideZone(41.30989, 69.2, zone), true);
});

test('isOutsideWorkHours: normal (non-wrapping) window', () => {
  const zone = { work_start: '09:00', work_end: '18:00' };
  assert.strictEqual(isOutsideWorkHours(new Date('2026-11-08T10:00:00'), zone), false);
  assert.strictEqual(isOutsideWorkHours(new Date('2026-11-08T20:00:00'), zone), true);
});

test('isOutsideWorkHours: midnight-wrapping night shift', () => {
  const zone = { work_start: '22:00', work_end: '06:00' };
  assert.strictEqual(isOutsideWorkHours(new Date('2026-11-08T23:00:00'), zone), false); // inside, after wrap
  assert.strictEqual(isOutsideWorkHours(new Date('2026-11-08T02:00:00'), zone), false); // inside, before wrap
  assert.strictEqual(isOutsideWorkHours(new Date('2026-11-08T12:00:00'), zone), true);  // outside, midday
});

test('detectLongStop: true when stationary for >= threshold', () => {
  const points = [
    { lat: 41.3, lng: 69.2, recorded_at: '2026-11-08T10:00:00Z' },
    { lat: 41.3, lng: 69.2, recorded_at: '2026-11-08T10:08:00Z' },
    { lat: 41.3, lng: 69.2, recorded_at: '2026-11-08T10:16:00Z' },
  ];
  assert.strictEqual(detectLongStop(points, 50, 15), true);
});

test('detectLongStop: false on sparse/short history (no false positive right after consent)', () => {
  const points = [
    { lat: 41.3, lng: 69.2, recorded_at: '2026-11-08T10:00:00Z' },
    { lat: 41.3, lng: 69.2, recorded_at: '2026-11-08T10:02:00Z' },
  ];
  assert.strictEqual(detectLongStop(points, 50, 15), false);
});

test('detectSignalLoss: true when gap exceeds threshold', () => {
  assert.strictEqual(
    detectSignalLoss('2026-11-08T10:00:00Z', new Date('2026-11-08T10:11:00Z'), 10),
    true
  );
});

test('detectSignalLoss: false when gap is within threshold', () => {
  assert.strictEqual(
    detectSignalLoss('2026-11-08T10:00:00Z', new Date('2026-11-08T10:05:00Z'), 10),
    false
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/anomaly'`

- [ ] **Step 3: Implement the five functions in `src/anomaly.js`**

- `haversineDistanceMeters`: standard haversine formula, Earth radius 6,371,000m.
- `isOutsideZone`: `haversineDistanceMeters(lat, lng, zone.center_lat, zone.center_lng) > zone.radius_m`.
- `isOutsideWorkHours`: convert `date`'s local hours/minutes and `work_start`/`work_end` to minutes-of-day; if `start <= end`, inside = `minute >= start && minute <= end`; if `start > end` (wraps midnight), inside = `minute >= start || minute <= end`; return `!inside`.
- `detectLongStop`: if `points.length < 2` return `false`. Let `last = points[points.length - 1]`. Walk backward while each point is within `thresholdMeters` of `last`; track the earliest point in that contiguous run. Return `true` only if `(time(last) - time(earliestInRun)) >= thresholdMinutes * 60 * 1000`.
- `detectSignalLoss`: if `lastRecordedAt === null` return `true`; else return `(now - new Date(lastRecordedAt)) >= thresholdMinutes * 60 * 1000`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all cases in Step 1)

- [ ] **Step 5: Commit**

```bash
git add gps-monitoring/src/anomaly.js gps-monitoring/test/anomaly.test.js
git commit -m "gps-monitoring: add anomaly-detection pure functions"
```

---

## Task 4: Anomaly runner (DB-wired)

**Files:**
- Create: `gps-monitoring/src/anomalyRunner.js`
- Test: `gps-monitoring/test/anomalyRunner.test.js`

**Interfaces:**
- Consumes: `createDb` (Task 1); `haversineDistanceMeters`, `isOutsideZone`, `isOutsideWorkHours`, `detectLongStop`, `detectSignalLoss` (Task 3).
- Produces: `runAnomalyChecks(db, employeeId: number, newLocation: {lat: number, lng: number, recorded_at: string}, previousLocation: {recorded_at: string} | null) -> string[]` — returns the `type`s of every alert it inserted (subset of `['zone_violation', 'outside_hours', 'long_stop', 'signal_loss']`), in that order. Assumes `newLocation` has **already** been inserted into `locations` by the caller before this is called.

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert');
const { createDb } = require('../src/db');
const { runAnomalyChecks } = require('../src/anomalyRunner');

function seedEmployeeWithZone(db) {
  const now = new Date().toISOString();
  const { lastInsertRowid: employeeId } = db.prepare(
    'INSERT INTO employees (name, phone, position, created_at) VALUES (?, ?, ?, ?)'
  ).run('Test Employee', '+998900000000', 'courier', now);
  db.prepare(
    'INSERT INTO zones (employee_id, center_lat, center_lng, radius_m, work_start, work_end) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(employeeId, 41.3, 69.2, 1000, '00:00', '23:59');
  return employeeId;
}

test('runAnomalyChecks: flags a point outside the zone', () => {
  const db = createDb(':memory:');
  const employeeId = seedEmployeeWithZone(db);
  const newLocation = { lat: 41.4, lng: 69.2, recorded_at: new Date().toISOString() };
  db.prepare(
    'INSERT INTO locations (employee_id, lat, lng, recorded_at) VALUES (?, ?, ?, ?)'
  ).run(employeeId, newLocation.lat, newLocation.lng, newLocation.recorded_at);

  const types = runAnomalyChecks(db, employeeId, newLocation, null);

  assert.ok(types.includes('zone_violation'));
  const row = db.prepare('SELECT * FROM alerts WHERE employee_id = ? AND type = ?')
    .get(employeeId, 'zone_violation');
  assert.ok(row);
  assert.strictEqual(row.resolved, 0);
});

test('runAnomalyChecks: no alerts for a normal in-zone, in-hours, first-ever ping', () => {
  const db = createDb(':memory:');
  const employeeId = seedEmployeeWithZone(db);
  const newLocation = { lat: 41.3, lng: 69.2, recorded_at: new Date().toISOString() };
  db.prepare(
    'INSERT INTO locations (employee_id, lat, lng, recorded_at) VALUES (?, ?, ?, ?)'
  ).run(employeeId, newLocation.lat, newLocation.lng, newLocation.recorded_at);

  const types = runAnomalyChecks(db, employeeId, newLocation, null);

  assert.deepStrictEqual(types, []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/anomalyRunner'`

- [ ] **Step 3: Implement `runAnomalyChecks` in `src/anomalyRunner.js`**

1. `const zone = db.prepare('SELECT * FROM zones WHERE employee_id = ?').get(employeeId);`
2. `const alertTypes = [];` and a local `insertAlert(type, details)` helper that runs `INSERT INTO alerts (employee_id, type, details, created_at, resolved) VALUES (?, ?, ?, ?, 0)` with `created_at = new Date().toISOString()`, then pushes `type` onto `alertTypes`.
3. If `zone`: call `isOutsideZone(newLocation.lat, newLocation.lng, zone)`; if true, `insertAlert('zone_violation', ...)`.
4. If `zone`: call `isOutsideWorkHours(new Date(newLocation.recorded_at), zone)`; if true, `insertAlert('outside_hours', ...)`.
5. Fetch recent points for the long-stop check: `db.prepare("SELECT lat, lng, recorded_at FROM locations WHERE employee_id = ? AND recorded_at >= ? ORDER BY recorded_at ASC").all(employeeId, <30 minutes before newLocation.recorded_at as ISO string>)`. Call `detectLongStop(recentPoints)`; if true, `insertAlert('long_stop', ...)`.
6. If `previousLocation` is not `null`: call `detectSignalLoss(previousLocation.recorded_at, new Date(newLocation.recorded_at))`; if true, `insertAlert('signal_loss', ...)`.
7. Return `alertTypes`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add gps-monitoring/src/anomalyRunner.js gps-monitoring/test/anomalyRunner.test.js
git commit -m "gps-monitoring: wire anomaly rules to DB, write alerts"
```

---

## Task 5: Admin auth helpers & middleware

**Files:**
- Create: `gps-monitoring/src/auth.js`
- Test: `gps-monitoring/test/auth.test.js`

**Interfaces:**
- Produces:
  - `hashPassword(password: string) -> string`
  - `verifyPassword(password: string, hash: string) -> boolean`
  - `requireAdminAuth(req, res, next) -> void` — Express middleware. If `req.session && req.session.isAdmin === true`, calls `next()`; otherwise redirects (`res.redirect('/admin/login')`).

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert');
const { hashPassword, verifyPassword, requireAdminAuth } = require('../src/auth');

test('hashPassword/verifyPassword round-trip', () => {
  const hash = hashPassword('s3cret');
  assert.strictEqual(verifyPassword('s3cret', hash), true);
  assert.strictEqual(verifyPassword('wrong', hash), false);
});

test('requireAdminAuth redirects when not authenticated', () => {
  const req = { session: {} };
  let redirectedTo = null;
  const res = { redirect: (url) => { redirectedTo = url; } };
  let nextCalled = false;
  requireAdminAuth(req, res, () => { nextCalled = true; });
  assert.strictEqual(redirectedTo, '/admin/login');
  assert.strictEqual(nextCalled, false);
});

test('requireAdminAuth calls next when authenticated', () => {
  const req = { session: { isAdmin: true } };
  const res = { redirect: () => { throw new Error('should not redirect'); } };
  let nextCalled = false;
  requireAdminAuth(req, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/auth'`

- [ ] **Step 3: Implement `src/auth.js`**

Use `bcryptjs`: `hashPassword` = `bcrypt.hashSync(password, 10)`; `verifyPassword` = `bcrypt.compareSync(password, hash)`. `requireAdminAuth` per the Interfaces description above.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add gps-monitoring/src/auth.js gps-monitoring/test/auth.test.js
git commit -m "gps-monitoring: add admin password hashing and auth middleware"
```

---

## Task 6: Express app factory + health check

**Files:**
- Create: `gps-monitoring/src/app.js`
- Create: `gps-monitoring/views/admin-login.ejs`
- Test: `gps-monitoring/test/app.test.js`

**Interfaces:**
- Consumes: `requireAdminAuth`, `verifyPassword` (Task 5).
- Produces: `createApp(db, options: { adminUsername: string, adminPasswordHash: string, sessionSecret: string }) -> ExpressApp`. The returned app has the view engine set to `ejs` with `views` pointed at `gps-monitoring/views`, `express.urlencoded({ extended: true })` and `express.json()` enabled, and `express-session` configured with `options.sessionSecret`. Mounts a `GET /health` route (`res.status(200).json({ ok: true })`) and a placeholder `GET /admin` that is wrapped in `requireAdminAuth` and currently just renders `'OK'` (routes/views are filled in by Tasks 7–9, which replace this placeholder).

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { createDb } = require('../src/db');
const { hashPassword } = require('../src/auth');
const { createApp } = require('../src/app');

function buildTestApp() {
  const db = createDb(':memory:');
  return createApp(db, {
    adminUsername: 'admin',
    adminPasswordHash: hashPassword('test-pass'),
    sessionSecret: 'test-secret',
  });
}

test('GET /health returns 200 ok', async () => {
  const app = buildTestApp();
  const res = await request(app).get('/health');
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body, { ok: true });
});

test('GET /admin redirects to login when unauthenticated', async () => {
  const app = buildTestApp();
  const res = await request(app).get('/admin');
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.headers.location, '/admin/login');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/app'`

- [ ] **Step 3: Implement `createApp` in `src/app.js`, and `views/admin-login.ejs`**

Wire `express`, `express-session` (`cookie: { httpOnly: true }`, `resave: false`, `saveUninitialized: false`), `view engine` = `ejs`, `views` dir. Add `GET /health`. Add the placeholder `GET /admin` behind `requireAdminAuth`. `admin-login.ejs` can be a minimal form for now (`POST /admin/login` is implemented in Task 8); this task does not need the login POST handler yet — just enough markup to not 500 if rendered later.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add gps-monitoring/src/app.js gps-monitoring/views/admin-login.ejs gps-monitoring/test/app.test.js
git commit -m "gps-monitoring: add Express app factory, session, health check"
```

---

## Task 7: Employee consent & location routes

**Files:**
- Create: `gps-monitoring/src/routes/employeeRoutes.js`
- Create: `gps-monitoring/views/consent-pending.ejs`
- Create: `gps-monitoring/views/consent-tracking.ejs`
- Modify: `gps-monitoring/src/app.js` — mount `employeeRoutes(db)` at `/consent`
- Test: `gps-monitoring/test/employeeRoutes.test.js`

**Interfaces:**
- Consumes: `runAnomalyChecks` (Task 4); `createApp`, `createDb` (Tasks 6, 1).
- Produces: `employeeRoutes(db) -> express.Router()` exposing:
  - `GET /consent/:token` — 404 if no `consents` row matches `token`; else renders `consent-pending.ejs` (status `pending`) or `consent-tracking.ejs` (status `consented`).
  - `POST /consent/:token` — 404 if no match; if `pending`, sets `status = 'consented'`, `consented_at = now ISO`, then redirects to `GET /consent/:token`.
  - `POST /consent/:token/location` — 404 if no match; 403 if not `consented`; else validates `req.body.lat`/`req.body.lng` are finite numbers (400 if not), inserts into `locations` with `recorded_at = now ISO`, fetches the prior last location (before this insert) for signal-loss comparison, calls `runAnomalyChecks`, responds `204`.
- `consent-tracking.ejs` must render the literal text `GPS kuzatuv FAOL` and include a `<script>` that calls `navigator.geolocation.watchPosition` (or a `setInterval` + `getCurrentPosition`) every 30 seconds, POSTing `{ lat, lng }` as JSON to `./location` (relative to the current `/consent/:token` URL).

- [ ] **Step 1: Write the failing tests**

```js
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { createDb } = require('../src/db');
const { hashPassword } = require('../src/auth');
const { createApp } = require('../src/app');

function buildAppWithPendingEmployee() {
  const db = createDb(':memory:');
  const app = createApp(db, {
    adminUsername: 'admin',
    adminPasswordHash: hashPassword('test-pass'),
    sessionSecret: 'test-secret',
  });
  const now = new Date().toISOString();
  const { lastInsertRowid: employeeId } = db.prepare(
    'INSERT INTO employees (name, phone, position, created_at) VALUES (?, ?, ?, ?)'
  ).run('Jasur', '+998901112233', 'courier', now);
  db.prepare(
    'INSERT INTO consents (employee_id, token, status) VALUES (?, ?, ?)'
  ).run(employeeId, 'tok-123', 'pending');
  return { app, db, employeeId };
}

test('GET /consent/:token with unknown token returns 404', async () => {
  const { app } = buildAppWithPendingEmployee();
  const res = await request(app).get('/consent/does-not-exist');
  assert.strictEqual(res.status, 404);
});

test('GET /consent/:token with pending token shows consent screen', async () => {
  const { app } = buildAppWithPendingEmployee();
  const res = await request(app).get('/consent/tok-123');
  assert.strictEqual(res.status, 200);
  assert.match(res.text, /Roziman/);
});

test('POST /consent/:token records consent, then GET shows tracking screen', async () => {
  const { app, db } = buildAppWithPendingEmployee();
  const postRes = await request(app).post('/consent/tok-123');
  assert.strictEqual(postRes.status, 302);

  const row = db.prepare('SELECT status, consented_at FROM consents WHERE token = ?').get('tok-123');
  assert.strictEqual(row.status, 'consented');
  assert.ok(row.consented_at);

  const getRes = await request(app).get('/consent/tok-123');
  assert.match(getRes.text, /GPS kuzatuv FAOL/);
});

test('POST /consent/:token/location is rejected before consent', async () => {
  const { app } = buildAppWithPendingEmployee();
  const res = await request(app).post('/consent/tok-123/location').send({ lat: 41.3, lng: 69.2 });
  assert.strictEqual(res.status, 403);
});

test('POST /consent/:token/location is accepted after consent and stores it', async () => {
  const { app, db, employeeId } = buildAppWithPendingEmployee();
  await request(app).post('/consent/tok-123');

  const res = await request(app).post('/consent/tok-123/location').send({ lat: 41.3, lng: 69.2 });
  assert.strictEqual(res.status, 204);

  const row = db.prepare('SELECT * FROM locations WHERE employee_id = ?').get(employeeId);
  assert.strictEqual(row.lat, 41.3);
  assert.strictEqual(row.lng, 69.2);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/routes/employeeRoutes'` (or 404s where 200/204/403 expected, once `app.js` has no route at all)

- [ ] **Step 3: Implement `employeeRoutes(db)`, the two views, and mount it in `app.js`**

Route logic per the Interfaces block above. For the location POST, query the previous last location (`ORDER BY recorded_at DESC LIMIT 1`) **before** inserting the new row, so Task 4's `previousLocation` argument is correct.

`consent-pending.ejs`: plain explanation of why tracking is requested (corruption-control GPS monitoring) and a form `POST` to the current URL with a "Roziman" submit button.

`consent-tracking.ejs`: the `GPS kuzatuv FAOL` banner plus the geolocation-reporting script described in the Interfaces block.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add gps-monitoring/src/routes/employeeRoutes.js gps-monitoring/views/consent-pending.ejs gps-monitoring/views/consent-tracking.ejs gps-monitoring/src/app.js gps-monitoring/test/employeeRoutes.test.js
git commit -m "gps-monitoring: add employee consent and location-reporting routes"
```

---

## Task 8: Admin login, employee management, zone editing

**Files:**
- Create: `gps-monitoring/src/routes/adminRoutes.js`
- Create: `gps-monitoring/views/admin-dashboard.ejs`
- Create: `gps-monitoring/views/admin-zone.ejs`
- Modify: `gps-monitoring/src/app.js` — mount `adminRoutes(db, options)` at `/admin`, remove the Task 6 placeholder `GET /admin`
- Test: `gps-monitoring/test/adminRoutes.test.js`

**Interfaces:**
- Consumes: `verifyPassword`, `requireAdminAuth` (Task 5); `sendSms` (Task 2); `createApp` (Task 6, modified here).
- Produces: `adminRoutes(db, options: { adminUsername, adminPasswordHash }) -> express.Router()` exposing (all but `/login` behind `requireAdminAuth`):
  - `GET /login`, `POST /login` (sets `req.session.isAdmin = true` on success, else re-renders with an error), `POST /logout` (destroys session, redirects to `/login`).
  - `GET /` — dashboard listing employees joined with their consent status.
  - `POST /employees` (`name`, `phone`, `position` from body) — inserts the employee, inserts a `consents` row with `token = crypto.randomUUID()` and `status = 'pending'`, calls `sendSms(phone, <consent message with the /consent/:token URL>)`, redirects to `GET /`.
  - `GET /employees/:id/zone` — renders `admin-zone.ejs` with the employee's existing zone (or blanks).
  - `POST /employees/:id/zone` (`center_lat`, `center_lng`, `radius_m`, `work_start`, `work_end`) — upserts the `zones` row for that employee (`INSERT ... ON CONFLICT(employee_id) DO UPDATE ...`), redirects to `GET /`.

- [ ] **Step 1: Write the failing tests**

```js
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { createDb } = require('../src/db');
const { hashPassword } = require('../src/auth');
const { createApp } = require('../src/app');

function buildAdminApp() {
  const db = createDb(':memory:');
  const app = createApp(db, {
    adminUsername: 'admin',
    adminPasswordHash: hashPassword('test-pass'),
    sessionSecret: 'test-secret',
  });
  return { app, db };
}

async function loginAgent(app) {
  const agent = request.agent(app);
  await agent.post('/admin/login').send({ username: 'admin', password: 'test-pass' });
  return agent;
}

test('POST /admin/login with correct credentials, then GET /admin succeeds', async () => {
  const { app } = buildAdminApp();
  const agent = await loginAgent(app);
  const res = await agent.get('/admin');
  assert.strictEqual(res.status, 200);
});

test('POST /admin/login with wrong password does not authenticate', async () => {
  const { app } = buildAdminApp();
  const agent = request.agent(app);
  await agent.post('/admin/login').send({ username: 'admin', password: 'wrong' });
  const res = await agent.get('/admin');
  assert.strictEqual(res.status, 302);
});

test('POST /admin/employees creates employee + pending consent and logs SMS', async () => {
  const { app, db } = buildAdminApp();
  const agent = await loginAgent(app);
  const lines = [];
  const originalLog = console.log;
  console.log = (line) => lines.push(line);
  try {
    const res = await agent.post('/admin/employees').send({
      name: 'Jasur', phone: '+998901112233', position: 'courier',
    });
    assert.strictEqual(res.status, 302);
  } finally {
    console.log = originalLog;
  }

  const employee = db.prepare('SELECT * FROM employees WHERE phone = ?').get('+998901112233');
  assert.ok(employee);
  const consent = db.prepare('SELECT * FROM consents WHERE employee_id = ?').get(employee.id);
  assert.strictEqual(consent.status, 'pending');
  assert.ok(lines.some(l => l.includes('+998901112233')));
});

test('POST /admin/employees/:id/zone upserts the zone', async () => {
  const { app, db } = buildAdminApp();
  const agent = await loginAgent(app);
  const now = new Date().toISOString();
  const { lastInsertRowid: employeeId } = db.prepare(
    'INSERT INTO employees (name, phone, position, created_at) VALUES (?, ?, ?, ?)'
  ).run('Jasur', '+998901112233', 'courier', now);

  const res = await agent.post(`/admin/employees/${employeeId}/zone`).send({
    center_lat: '41.3', center_lng: '69.2', radius_m: '1000',
    work_start: '09:00', work_end: '18:00',
  });
  assert.strictEqual(res.status, 302);

  const zone = db.prepare('SELECT * FROM zones WHERE employee_id = ?').get(employeeId);
  assert.strictEqual(zone.radius_m, 1000);
  assert.strictEqual(zone.work_start, '09:00');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/routes/adminRoutes'`

- [ ] **Step 3: Implement `adminRoutes(db, options)`, the two views, and mount it in `app.js`**

`POST /login`: compare `req.body.username === options.adminUsername && verifyPassword(req.body.password, options.adminPasswordHash)`; on success set `req.session.isAdmin = true` and redirect to `/admin`; on failure re-render `admin-login.ejs` with an error message (status 200, but the test above only checks the *unauthenticated follow-up request* redirects — no assertion on the login response body is required).

Consent-message text sent to `sendSms`: include the employee's name, the reason ("ish vaqtida GPS orqali kuzatilasiz — korrupsiya nazorati uchun"), and the full consent URL (build from `req.protocol`/`req.get('host')` + `/consent/<token>`).

`admin-dashboard.ejs`: table of employees with name, phone, position, consent status, and links to "Zona" (`/admin/employees/:id/zone`) and (added in Task 9) map/alerts.

`admin-zone.ejs`: a form with the five zone fields, pre-filled from the existing zone row if present.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add gps-monitoring/src/routes/adminRoutes.js gps-monitoring/views/admin-dashboard.ejs gps-monitoring/views/admin-zone.ejs gps-monitoring/src/app.js gps-monitoring/test/adminRoutes.test.js
git commit -m "gps-monitoring: add admin login, employee management, zone editing"
```

---

## Task 9: Admin map & alerts views

**Files:**
- Modify: `gps-monitoring/src/routes/adminRoutes.js` — add `GET /map` and `GET /alerts` + `POST /alerts/:id/resolve`
- Create: `gps-monitoring/views/admin-map.ejs`
- Create: `gps-monitoring/views/admin-alerts.ejs`
- Test: `gps-monitoring/test/adminMapAlerts.test.js`

**Interfaces:**
- Consumes: `requireAdminAuth` (Task 5); the `employees`/`locations`/`zones`/`alerts` schema (Task 1).
- Produces (added to the router from Task 8, same `adminRoutes(db, options)` factory):
  - `GET /map` — for each employee, their most recent `locations` row (if any) and their `zones` row (if any); passed to `admin-map.ejs`, which renders a Leaflet map (via CDN `<script>`/`<link>` tags, OpenStreetMap tiles, no API key) with one marker per employee that has a location, and one circle per zone.
  - `GET /alerts` — all `alerts` rows joined with the employee's `name`, newest first, each with a "Resolved deb belgilash" form if `resolved = 0`.
  - `POST /alerts/:id/resolve` — sets `resolved = 1` for that alert, redirects to `GET /alerts`.

- [ ] **Step 1: Write the failing tests**

```js
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { createDb } = require('../src/db');
const { hashPassword } = require('../src/auth');
const { createApp } = require('../src/app');

async function buildLoggedInApp() {
  const db = createDb(':memory:');
  const app = createApp(db, {
    adminUsername: 'admin',
    adminPasswordHash: hashPassword('test-pass'),
    sessionSecret: 'test-secret',
  });
  const agent = request.agent(app);
  await agent.post('/admin/login').send({ username: 'admin', password: 'test-pass' });
  return { agent, db };
}

test('GET /admin/map renders without error for an employee with a location', async () => {
  const { agent, db } = await buildLoggedInApp();
  const now = new Date().toISOString();
  const { lastInsertRowid: employeeId } = db.prepare(
    'INSERT INTO employees (name, phone, position, created_at) VALUES (?, ?, ?, ?)'
  ).run('Jasur', '+998901112233', 'courier', now);
  db.prepare('INSERT INTO locations (employee_id, lat, lng, recorded_at) VALUES (?, ?, ?, ?)')
    .run(employeeId, 41.3, 69.2, now);

  const res = await agent.get('/admin/map');
  assert.strictEqual(res.status, 200);
  assert.match(res.text, /Jasur/);
});

test('GET /admin/alerts lists alerts, and resolve marks them resolved', async () => {
  const { agent, db } = await buildLoggedInApp();
  const now = new Date().toISOString();
  const { lastInsertRowid: employeeId } = db.prepare(
    'INSERT INTO employees (name, phone, position, created_at) VALUES (?, ?, ?, ?)'
  ).run('Jasur', '+998901112233', 'courier', now);
  const { lastInsertRowid: alertId } = db.prepare(
    'INSERT INTO alerts (employee_id, type, details, created_at, resolved) VALUES (?, ?, ?, ?, 0)'
  ).run(employeeId, 'zone_violation', 'test', now);

  const listRes = await agent.get('/admin/alerts');
  assert.strictEqual(listRes.status, 200);
  assert.match(listRes.text, /zone_violation/);

  const resolveRes = await agent.post(`/admin/alerts/${alertId}/resolve`);
  assert.strictEqual(resolveRes.status, 302);

  const row = db.prepare('SELECT resolved FROM alerts WHERE id = ?').get(alertId);
  assert.strictEqual(row.resolved, 1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — 404 on `GET /admin/map` / `GET /admin/alerts` (routes don't exist yet)

- [ ] **Step 3: Implement the routes and views**

Map data query: `SELECT e.*, l.lat, l.lng, l.recorded_at FROM employees e LEFT JOIN locations l ON l.id = (SELECT id FROM locations WHERE employee_id = e.id ORDER BY recorded_at DESC LIMIT 1)`, plus a separate query (or join) for each employee's `zones` row.

Alerts query: `SELECT a.*, e.name as employee_name FROM alerts a JOIN employees e ON e.id = a.employee_id ORDER BY a.created_at DESC`.

`admin-map.ejs` loads Leaflet from a CDN (e.g. `unpkg.com/leaflet@1.9.4`) and renders markers/circles from the data passed in.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add gps-monitoring/src/routes/adminRoutes.js gps-monitoring/views/admin-map.ejs gps-monitoring/views/admin-alerts.ejs gps-monitoring/test/adminMapAlerts.test.js
git commit -m "gps-monitoring: add admin map and alerts views"
```

---

## Task 10: Server entry point & run instructions

**Files:**
- Create: `gps-monitoring/server.js`
- Create: `gps-monitoring/README.md`
- Test: `gps-monitoring/test/server.test.js`

**Interfaces:**
- Consumes: `createDb` (Task 1), `createApp` (Task 6), `hashPassword` (Task 5).

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('server.js starts, serves /health, and can be stopped', async () => {
  const { spawn } = require('node:child_process');
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: {
      ...process.env,
      PORT: '4123',
      ADMIN_USERNAME: 'admin',
      ADMIN_PASSWORD: 'test-pass',
      SESSION_SECRET: 'test-secret',
      DB_PATH: ':memory:',
    },
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('server did not start in time')), 3000);
      child.stdout.on('data', (chunk) => {
        if (chunk.toString().includes('listening')) { clearTimeout(timer); resolve(); }
      });
      child.on('error', reject);
    });
    const res = await fetch('http://localhost:4123/health');
    assert.strictEqual(res.status, 200);
  } finally {
    child.kill();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `gps-monitoring/server.js` does not exist / connection refused

- [ ] **Step 3: Implement `server.js`**

Read `PORT` (default `3000`), `ADMIN_USERNAME` (default `'admin'`), `ADMIN_PASSWORD` (required — throw at startup if missing), `SESSION_SECRET` (required — throw if missing), `DB_PATH` (default `./data/app.db`) from `process.env`. Build `const db = createDb(process.env.DB_PATH)`, `const app = createApp(db, { adminUsername, adminPasswordHash: hashPassword(adminPassword), sessionSecret })`, then `app.listen(port, () => console.log(\`listening on \${port}\`))`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Write `README.md`**

Cover: what this app is and the consent model (one paragraph, matching the spec's Purpose section); how to run it (`npm install`, required env vars, `npm start`); how to run tests (`npm test`); where the SMS message is currently printed (console) and that `sendSms` in `src/sms.js` is the single place to swap in a real provider; explicit note that no microphone/audio capture exists or should be added.

- [ ] **Step 6: Commit**

```bash
git add gps-monitoring/server.js gps-monitoring/test/server.test.js gps-monitoring/README.md
git commit -m "gps-monitoring: add server entry point and README"
```
