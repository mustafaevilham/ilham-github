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
