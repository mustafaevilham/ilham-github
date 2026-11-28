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

test('GET /static/offline-queue.js is served (tracking page depends on it)', async () => {
  const app = buildTestApp();
  const res = await request(app).get('/static/offline-queue.js');
  assert.strictEqual(res.status, 200);
  assert.match(res.text, /removeSent/);
});
