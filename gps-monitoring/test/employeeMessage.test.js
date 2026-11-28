const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { createDb } = require('../src/db');
const { hashPassword } = require('../src/auth');
const { createApp } = require('../src/app');

function buildAppWithConsentedEmployee() {
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
    'INSERT INTO consents (employee_id, token, status, consented_at) VALUES (?, ?, ?, ?)'
  ).run(employeeId, 'tok-msg', 'consented', now);
  return { app, db, employeeId };
}

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
  ).run('Olim', '+998900000001', 'courier', now);
  db.prepare(
    'INSERT INTO consents (employee_id, token, status) VALUES (?, ?, ?)'
  ).run(employeeId, 'tok-pending', 'pending');
  return { app };
}

test('GET /consent/:token/message with unknown token returns 404', async () => {
  const { app } = buildAppWithConsentedEmployee();
  const res = await request(app).get('/consent/does-not-exist/message');
  assert.strictEqual(res.status, 404);
});

test('GET /consent/:token/message before consent returns 403', async () => {
  const { app } = buildAppWithPendingEmployee();
  const res = await request(app).get('/consent/tok-pending/message');
  assert.strictEqual(res.status, 403);
});

test('GET /consent/:token/message shows a blank panel: a message box and nothing else (no banner, no map, no admin UI)', async () => {
  const { app } = buildAppWithConsentedEmployee();
  const res = await request(app).get('/consent/tok-msg/message');
  assert.strictEqual(res.status, 200);
  assert.match(res.text, /<textarea/);
  assert.doesNotMatch(res.text, /GPS kuzatuv FAOL/);
  assert.doesNotMatch(res.text, /Roziman/);
  assert.doesNotMatch(res.text, /Xodimlar/); // no admin nav leaking onto the employee page
});

test('POST /consent/:token/message before consent is rejected (403), nothing stored', async () => {
  const { app } = buildAppWithPendingEmployee();
  const res = await request(app).post('/consent/tok-pending/message').send({ message: 'Salom' });
  assert.strictEqual(res.status, 403);
});

test('POST /consent/:token/message with unknown token returns 404', async () => {
  const { app } = buildAppWithConsentedEmployee();
  const res = await request(app).post('/consent/does-not-exist/message').send({ message: 'Salom' });
  assert.strictEqual(res.status, 404);
});

test('POST /consent/:token/message rejects an empty message', async () => {
  const { app, db, employeeId } = buildAppWithConsentedEmployee();
  const res = await request(app).post('/consent/tok-msg/message').send({ message: '   ' });
  assert.strictEqual(res.status, 400);
  const row = db.prepare("SELECT * FROM alerts WHERE employee_id = ? AND type = 'employee_message'").get(employeeId);
  assert.strictEqual(row, undefined);
});

test('POST /consent/:token/message stores the message as an alert the admin can see', async () => {
  const { app, db, employeeId } = buildAppWithConsentedEmployee();
  const res = await request(app).post('/consent/tok-msg/message').send({ message: 'Yordam kerak, mashina buzildi' });
  assert.strictEqual(res.status, 204);

  const row = db.prepare("SELECT * FROM alerts WHERE employee_id = ? AND type = 'employee_message'").get(employeeId);
  assert.ok(row);
  assert.strictEqual(row.details, 'Yordam kerak, mashina buzildi');
  assert.strictEqual(row.resolved, 0);
});
