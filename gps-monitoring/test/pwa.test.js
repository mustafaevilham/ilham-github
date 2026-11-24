const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { createDb } = require('../src/db');
const { hashPassword } = require('../src/auth');
const { createApp } = require('../src/app');

function buildApp() {
  const db = createDb(':memory:');
  return createApp(db, {
    adminUsername: 'admin',
    adminPasswordHash: hashPassword('test-pass'),
    sessionSecret: 'test-secret',
  });
}

test('manifest is served with the app name and icons', async () => {
  const app = buildApp();
  const res = await request(app).get('/static/manifest.webmanifest');
  assert.strictEqual(res.status, 200);
  const manifest = JSON.parse(res.text);
  assert.strictEqual(manifest.display, 'standalone');
  assert.ok(manifest.icons.some((i) => i.sizes === '512x512'));
});

test('service worker is served from the root scope with a JS content-type', async () => {
  const app = buildApp();
  const res = await request(app).get('/sw.js');
  assert.strictEqual(res.status, 200);
  assert.match(res.headers['content-type'], /javascript/);
  assert.strictEqual(res.headers['service-worker-allowed'], '/');
});

test('the login page links the manifest and registers the service worker', async () => {
  const app = buildApp();
  const res = await request(app).get('/admin/login');
  assert.match(res.text, /rel="manifest"/);
  assert.match(res.text, /serviceWorker/);
});

test('PWA icons are served', async () => {
  const app = buildApp();
  const res = await request(app).get('/static/icons/icon-192.png');
  assert.strictEqual(res.status, 200);
  assert.match(res.headers['content-type'], /image\/png/);
});
