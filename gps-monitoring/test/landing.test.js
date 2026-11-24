const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { createDb } = require('../src/db');
const { createApp } = require('../src/app');

function buildApp() {
  const db = createDb(':memory:');
  return createApp(db, { adminUsername: 'admin', sessionSecret: 's' });
}

test('GET / serves a landing page with the manifest link and app name (for PWA/APK tools)', async () => {
  const app = buildApp();
  const res = await request(app).get('/');
  assert.strictEqual(res.status, 200);
  assert.match(res.text, /rel="manifest"/);
  assert.match(res.text, /GPS Monitoring/);
  assert.match(res.text, /serviceWorker/);
});
