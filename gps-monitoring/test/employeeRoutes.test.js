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

test('POST /consent/:token/locations is rejected before consent', async () => {
  const { app } = buildAppWithPendingEmployee();
  const res = await request(app)
    .post('/consent/tok-123/locations')
    .send({ points: [{ lat: 41.3, lng: 69.2, recorded_at: new Date().toISOString() }] });
  assert.strictEqual(res.status, 403);
});

test('POST /consent/:token/locations rejects an empty or missing points array', async () => {
  const { app } = buildAppWithPendingEmployee();
  await request(app).post('/consent/tok-123');

  const res = await request(app).post('/consent/tok-123/locations').send({ points: [] });
  assert.strictEqual(res.status, 400);
});

test('POST /consent/:token/locations accepts a batch after consent, stores all points, oldest first', async () => {
  const { app, db, employeeId } = buildAppWithPendingEmployee();
  await request(app).post('/consent/tok-123');

  const older = new Date(Date.now() - 60 * 1000).toISOString();
  const newer = new Date().toISOString();
  // sent out of order on purpose — the server must sort by recorded_at itself
  const res = await request(app)
    .post('/consent/tok-123/locations')
    .send({ points: [
      { lat: 41.31, lng: 69.21, recorded_at: newer },
      { lat: 41.3, lng: 69.2, recorded_at: older },
    ] });
  assert.strictEqual(res.status, 204);

  const rows = db.prepare('SELECT * FROM locations WHERE employee_id = ? ORDER BY recorded_at ASC').all(employeeId);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].recorded_at, older);
  assert.strictEqual(rows[1].recorded_at, newer);
});
