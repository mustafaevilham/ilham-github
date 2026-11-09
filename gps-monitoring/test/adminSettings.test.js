const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { createDb } = require('../src/db');
const { hashPassword } = require('../src/auth');
const { createApp } = require('../src/app');
const { getSetting, getConsentTemplate } = require('../src/settings');

function buildApp() {
  const db = createDb(':memory:');
  const app = createApp(db, {
    adminUsername: 'admin',
    adminPasswordHash: hashPassword('test-pass'),
    sessionSecret: 'test-secret',
  });
  return { app, db };
}

async function login(app, password = 'test-pass') {
  const agent = request.agent(app);
  await agent.post('/admin/login').send({ username: 'admin', password });
  return agent;
}

test('admin credentials are seeded into settings on app creation', () => {
  const { db } = buildApp();
  assert.strictEqual(getSetting(db, 'admin_username', null), 'admin');
  assert.ok(getSetting(db, 'admin_password_hash', null));
});

test('changing the password: old password stops working, new one works', async () => {
  const { app } = buildApp();
  const agent = await login(app);

  const res = await agent.post('/admin/settings/password').send({
    current_password: 'test-pass',
    new_password: 'brand-new-pass',
  });
  assert.strictEqual(res.status, 302);

  // a fresh agent can log in with the NEW password
  const freshNew = request.agent(app);
  await freshNew.post('/admin/login').send({ username: 'admin', password: 'brand-new-pass' });
  assert.strictEqual((await freshNew.get('/admin')).status, 200);

  // and NOT with the old one
  const freshOld = request.agent(app);
  await freshOld.post('/admin/login').send({ username: 'admin', password: 'test-pass' });
  assert.strictEqual((await freshOld.get('/admin')).status, 302);
});

test('changing the password with a wrong current password is rejected and leaves it unchanged', async () => {
  const { app } = buildApp();
  const agent = await login(app);

  const res = await agent.post('/admin/settings/password').send({
    current_password: 'WRONG',
    new_password: 'brand-new-pass',
  });
  assert.notStrictEqual(res.status, 302); // not a success redirect

  // original password still works
  const fresh = request.agent(app);
  await fresh.post('/admin/login').send({ username: 'admin', password: 'test-pass' });
  assert.strictEqual((await fresh.get('/admin')).status, 200);
});

test('editing the consent message template persists and is used for new employees', async () => {
  const { app, db } = buildApp();
  const agent = await login(app);

  const tpl = 'Assalomu alaykum {name}! Kuzatuvga rozilik: {link}';
  const res = await agent.post('/admin/settings/message').send({ template: tpl });
  assert.strictEqual(res.status, 302);
  assert.strictEqual(getConsentTemplate(db), tpl);

  // creating an employee now sends the customized message
  const lines = [];
  const originalLog = console.log;
  console.log = (l) => lines.push(l);
  try {
    await agent.post('/admin/employees').send({ name: 'Nodir', phone: '+998901112233', position: 'kuryer' });
  } finally {
    console.log = originalLog;
  }
  assert.ok(lines.some(l => l.includes('Assalomu alaykum Nodir!')));
});
