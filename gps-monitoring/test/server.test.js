const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

test('server.js starts, serves /health, and can be stopped', async () => {
  const { spawn } = require('node:child_process');
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: {
      ...process.env,
      PORT: '4123',
      ADMIN_USERNAME: 'admin',
      ADMIN_PASSWORD: 'test-pass',
      SESSION_SECRET: 'test-secret',
      DB_PATH: ':memory:',
    },
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('server did not start in time')), 3000);
      child.stdout.on('data', (chunk) => {
        if (chunk.toString().includes('listening')) { clearTimeout(timer); resolve(); }
      });
      child.on('error', reject);
    });
    const res = await fetch('http://localhost:4123/health');
    assert.strictEqual(res.status, 200);
  } finally {
    child.kill();
  }
});
