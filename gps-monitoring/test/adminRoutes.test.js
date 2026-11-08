const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { createDb } = require('../src/db');
const { hashPassword } = require('../src/auth');
const { createApp } = require('../src/app');

function buildAdminApp() {
  const db = createDb(':memory:');
  const app = createApp(db, {
    adminUsername: 'admin',
    adminPasswordHash: hashPassword('test-pass'),
    sessionSecret: 'test-secret',
  });
  return { app, db };
}

async function loginAgent(app) {
  const agent = request.agent(app);
  await agent.post('/admin/login').send({ username: 'admin', password: 'test-pass' });
  return agent;
}

test('POST /admin/login with correct credentials, then GET /admin succeeds', async () => {
  const { app } = buildAdminApp();
  const agent = await loginAgent(app);
  const res = await agent.get('/admin');
  assert.strictEqual(res.status, 200);
});

test('POST /admin/login with wrong password does not authenticate', async () => {
  const { app } = buildAdminApp();
  const agent = request.agent(app);
  await agent.post('/admin/login').send({ username: 'admin', password: 'wrong' });
  const res = await agent.get('/admin');
  assert.strictEqual(res.status, 302);
});

test('POST /admin/employees creates employee + pending consent and logs SMS', async () => {
  const { app, db } = buildAdminApp();
  const agent = await loginAgent(app);
  const lines = [];
  const originalLog = console.log;
  console.log = (line) => lines.push(line);
  try {
    const res = await agent.post('/admin/employees').send({
      name: 'Jasur', phone: '+998901112233', position: 'courier',
    });
    assert.strictEqual(res.status, 302);
  } finally {
    console.log = originalLog;
  }

  const employee = db.prepare('SELECT * FROM employees WHERE phone = ?').get('+998901112233');
  assert.ok(employee);
  const consent = db.prepare('SELECT * FROM consents WHERE employee_id = ?').get(employee.id);
  assert.strictEqual(consent.status, 'pending');
  assert.ok(lines.some(l => l.includes('+998901112233')));
});

test('dashboard shows the consent link so the admin can send it to the employee', async () => {
  const { app, db } = buildAdminApp();
  const agent = await loginAgent(app);
  const now = new Date().toISOString();
  const { lastInsertRowid: employeeId } = db.prepare(
    'INSERT INTO employees (name, phone, position, created_at) VALUES (?, ?, ?, ?)'
  ).run('Jasur', '+998901112233', 'courier', now);
  db.prepare('INSERT INTO consents (employee_id, token, status) VALUES (?, ?, ?)')
    .run(employeeId, 'tok-abc', 'pending');

  const res = await agent.get('/admin');
  assert.strictEqual(res.status, 200);
  assert.match(res.text, /consent\/tok-abc/);
});

test('POST /admin/employees/:id/zone upserts the zone', async () => {
  const { app, db } = buildAdminApp();
  const agent = await loginAgent(app);
  const now = new Date().toISOString();
  const { lastInsertRowid: employeeId } = db.prepare(
    'INSERT INTO employees (name, phone, position, created_at) VALUES (?, ?, ?, ?)'
  ).run('Jasur', '+998901112233', 'courier', now);

  const res = await agent.post(`/admin/employees/${employeeId}/zone`).send({
    center_lat: '41.3', center_lng: '69.2', radius_m: '1000',
    work_start: '09:00', work_end: '18:00',
  });
  assert.strictEqual(res.status, 302);

  const zone = db.prepare('SELECT * FROM zones WHERE employee_id = ?').get(employeeId);
  assert.strictEqual(zone.radius_m, 1000);
  assert.strictEqual(zone.work_start, '09:00');
});
