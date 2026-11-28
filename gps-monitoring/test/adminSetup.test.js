const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { createDb } = require('../src/db');
const { createApp } = require('../src/app');

// An app with NO admin password seeded — simulates a fresh production deploy
// where ADMIN_PASSWORD is not provided, so first-run setup should kick in.
function buildUnconfiguredApp() {
  const db = createDb(':memory:');
  const app = createApp(db, { adminUsername: 'admin', sessionSecret: 'test-secret' });
  return { app, db };
}

test('when no admin is configured, /admin/login redirects to the setup screen', async () => {
  const { app } = buildUnconfiguredApp();
  const res = await request(app).get('/admin/login');
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.headers.location, '/admin/setup');
});

test('the setup screen is shown when unconfigured', async () => {
  const { app } = buildUnconfiguredApp();
  const res = await request(app).get('/admin/setup');
  assert.strictEqual(res.status, 200);
  assert.match(res.text, /parol/i);
});

test('completing setup configures the admin and logs them in', async () => {
  const { app } = buildUnconfiguredApp();
  const agent = request.agent(app);
  const res = await agent.post('/admin/setup').send({
    username: 'admin', password: 'mening-parolim', confirm: 'mening-parolim',
  });
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.headers.location, '/admin');
  // session is authenticated right after setup
  assert.strictEqual((await agent.get('/admin')).status, 200);

  // and a fresh login with the chosen password works
  const fresh = request.agent(app);
  await fresh.post('/admin/login').send({ username: 'admin', password: 'mening-parolim' });
  assert.strictEqual((await fresh.get('/admin')).status, 200);
});

test('setup is refused once an admin already exists (no takeover)', async () => {
  const { app } = buildUnconfiguredApp();
  const agent = request.agent(app);
  await agent.post('/admin/setup').send({ username: 'admin', password: 'first-pass', confirm: 'first-pass' });

  // a second setup attempt must NOT change the password
  const attacker = request.agent(app);
  const res = await attacker.post('/admin/setup').send({ username: 'admin', password: 'hijack-pass', confirm: 'hijack-pass' });
  assert.notStrictEqual(res.headers.location, '/admin'); // not treated as a successful setup

  // original password still works, hijack password does not
  const good = request.agent(app);
  await good.post('/admin/login').send({ username: 'admin', password: 'first-pass' });
  assert.strictEqual((await good.get('/admin')).status, 200);
  const bad = request.agent(app);
  await bad.post('/admin/login').send({ username: 'admin', password: 'hijack-pass' });
  assert.strictEqual((await bad.get('/admin')).status, 302);
});

test('mismatched confirm password is rejected', async () => {
  const { app } = buildUnconfiguredApp();
  const res = await request(app).post('/admin/setup').send({
    username: 'admin', password: 'abcd1234', confirm: 'different',
  });
  assert.notStrictEqual(res.headers.location, '/admin');
});
