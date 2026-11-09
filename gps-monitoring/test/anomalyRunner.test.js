const test = require('node:test');
const assert = require('node:assert');
const { createDb } = require('../src/db');
const { runAnomalyChecks, sweepSignalLoss } = require('../src/anomalyRunner');

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

  const types = runAnomalyChecks(db, employeeId, newLocation);

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

  const types = runAnomalyChecks(db, employeeId, newLocation);

  assert.deepStrictEqual(types, []);
});

function insertStationaryRun(db, employeeId, lat, lng) {
  // three pings over 16 minutes at (lat,lng) — a long stop
  const base = Date.now();
  const times = [base - 16 * 60000, base - 8 * 60000, base];
  for (const t of times) {
    db.prepare('INSERT INTO locations (employee_id, lat, lng, recorded_at) VALUES (?, ?, ?, ?)')
      .run(employeeId, lat, lng, new Date(t).toISOString());
  }
  return { lat, lng, recorded_at: new Date(base).toISOString() };
}

test('runAnomalyChecks: does NOT flag long_stop when the stationary run is inside the employee zone', () => {
  const db = createDb(':memory:');
  const employeeId = seedEmployeeWithZone(db); // zone center 41.3,69.2 radius 1000
  const last = insertStationaryRun(db, employeeId, 41.3, 69.2); // at zone center

  const types = runAnomalyChecks(db, employeeId, last);

  assert.ok(!types.includes('long_stop'));
});

test('runAnomalyChecks: flags long_stop when the stationary run is outside the zone', () => {
  const db = createDb(':memory:');
  const employeeId = seedEmployeeWithZone(db);
  const last = insertStationaryRun(db, employeeId, 41.5, 69.2); // ~22km north, outside

  const types = runAnomalyChecks(db, employeeId, last);

  assert.ok(types.includes('long_stop'));
});

test('runAnomalyChecks: flags signal_loss when the gap since the previous DB row exceeds the threshold', () => {
  const db = createDb(':memory:');
  const employeeId = seedEmployeeWithZone(db);
  const earlier = new Date(Date.now() - 20 * 60 * 1000).toISOString(); // 20 min ago
  db.prepare(
    'INSERT INTO locations (employee_id, lat, lng, recorded_at) VALUES (?, ?, ?, ?)'
  ).run(employeeId, 41.3, 69.2, earlier);

  const newLocation = { lat: 41.3, lng: 69.2, recorded_at: new Date().toISOString() };
  db.prepare(
    'INSERT INTO locations (employee_id, lat, lng, recorded_at) VALUES (?, ?, ?, ?)'
  ).run(employeeId, newLocation.lat, newLocation.lng, newLocation.recorded_at);

  const types = runAnomalyChecks(db, employeeId, newLocation);

  assert.ok(types.includes('signal_loss'));
});

function seedConsentedEmployeeWithAlwaysOnZone(db, lastSeenMinutesAgo) {
  const now = new Date().toISOString();
  const { lastInsertRowid: employeeId } = db.prepare(
    'INSERT INTO employees (name, phone, position, created_at) VALUES (?, ?, ?, ?)'
  ).run('Dark Employee', '+998900000001', 'courier', now);
  db.prepare('INSERT INTO consents (employee_id, token, status, consented_at) VALUES (?, ?, ?, ?)')
    .run(employeeId, 'tok-' + employeeId, 'consented', now);
  db.prepare(
    'INSERT INTO zones (employee_id, center_lat, center_lng, radius_m, work_start, work_end) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(employeeId, 41.3, 69.2, 1000, '00:00', '23:59');
  if (lastSeenMinutesAgo != null) {
    const ts = new Date(Date.now() - lastSeenMinutesAgo * 60000).toISOString();
    db.prepare('INSERT INTO locations (employee_id, lat, lng, recorded_at) VALUES (?, ?, ?, ?)')
      .run(employeeId, 41.3, 69.2, ts);
  }
  return employeeId;
}

test('sweepSignalLoss: inserts an alert for a consented employee gone dark during work hours', () => {
  const db = createDb(':memory:');
  const employeeId = seedConsentedEmployeeWithAlwaysOnZone(db, 20); // last ping 20 min ago

  const inserted = sweepSignalLoss(db, new Date());

  assert.deepStrictEqual(inserted, [employeeId]);
  const row = db.prepare("SELECT * FROM alerts WHERE employee_id = ? AND type = 'signal_loss'").get(employeeId);
  assert.ok(row);
});

test('sweepSignalLoss: does not duplicate the alert on a second sweep', () => {
  const db = createDb(':memory:');
  const employeeId = seedConsentedEmployeeWithAlwaysOnZone(db, 20);

  sweepSignalLoss(db, new Date());
  const second = sweepSignalLoss(db, new Date());

  assert.deepStrictEqual(second, []);
  const count = db.prepare("SELECT COUNT(*) AS n FROM alerts WHERE employee_id = ? AND type = 'signal_loss'").get(employeeId);
  assert.strictEqual(count.n, 1);
});

test('sweepSignalLoss: does not alert when the last ping is recent', () => {
  const db = createDb(':memory:');
  const employeeId = seedConsentedEmployeeWithAlwaysOnZone(db, 3); // 3 min ago, within threshold

  const inserted = sweepSignalLoss(db, new Date());

  assert.deepStrictEqual(inserted, []);
});

test('sweepSignalLoss: ignores employees who have not consented', () => {
  const db = createDb(':memory:');
  const now = new Date().toISOString();
  const { lastInsertRowid: employeeId } = db.prepare(
    'INSERT INTO employees (name, phone, position, created_at) VALUES (?, ?, ?, ?)'
  ).run('Pending', '+998900000002', 'courier', now);
  db.prepare('INSERT INTO consents (employee_id, token, status) VALUES (?, ?, ?)')
    .run(employeeId, 'tok-p', 'pending');
  db.prepare('INSERT INTO zones (employee_id, center_lat, center_lng, radius_m, work_start, work_end) VALUES (?, ?, ?, ?, ?, ?)')
    .run(employeeId, 41.3, 69.2, 1000, '00:00', '23:59');
  db.prepare('INSERT INTO locations (employee_id, lat, lng, recorded_at) VALUES (?, ?, ?, ?)')
    .run(employeeId, 41.3, 69.2, new Date(Date.now() - 20 * 60000).toISOString());

  const inserted = sweepSignalLoss(db, new Date());

  assert.deepStrictEqual(inserted, []);
});
