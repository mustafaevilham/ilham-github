const test = require('node:test');
const assert = require('node:assert');
const { createDb } = require('../src/db');

test('createDb creates all the app tables', () => {
  const db = createDb(':memory:');
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all().map(r => r.name);
  assert.deepStrictEqual(tables, ['alerts', 'consents', 'employees', 'locations', 'settings', 'zones']);
});
