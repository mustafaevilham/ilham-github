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
