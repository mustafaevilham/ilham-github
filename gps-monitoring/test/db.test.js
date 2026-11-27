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

const os = require('node:os');
const path = require('node:path');
const { remoteConfigFromEnv } = require('../src/db');

test('createDb with a remote config opens a libsql embedded replica, syncs, then applies the schema', () => {
  const calls = [];
  class FakeDb {
    constructor(p, opts) { calls.push(['open', p, opts]); }
    pragma() { calls.push(['pragma']); }
    exec() { calls.push(['exec']); }
    sync() { calls.push(['sync']); }
  }
  const replica = path.join(os.tmpdir(), 'gps-test-replica', 'app.db');
  createDb(replica, { url: 'libsql://x.turso.io', authToken: 'tok', DatabaseImpl: FakeDb });

  assert.deepStrictEqual(calls[0], ['open', replica, { syncUrl: 'libsql://x.turso.io', authToken: 'tok' }]);
  const names = calls.map((c) => c[0]);
  assert.ok(names.includes('sync'), 'must pull from the remote on startup');
  assert.ok(names.includes('exec'), 'must apply the schema');
  assert.ok(names.indexOf('sync') < names.indexOf('exec'), 'sync before schema');
  assert.ok(!names.includes('pragma'), 'no WAL/foreign_keys pragma on a replica');
});

test('remoteConfigFromEnv: both vars -> config, none -> null, only one -> throws', () => {
  assert.deepStrictEqual(
    remoteConfigFromEnv({ TURSO_DATABASE_URL: 'libsql://a.turso.io', TURSO_AUTH_TOKEN: 't' }),
    { url: 'libsql://a.turso.io', authToken: 't' }
  );
  assert.strictEqual(remoteConfigFromEnv({}), null);
  assert.throws(() => remoteConfigFromEnv({ TURSO_DATABASE_URL: 'libsql://a.turso.io' }), /TURSO_AUTH_TOKEN/);
  assert.throws(() => remoteConfigFromEnv({ TURSO_AUTH_TOKEN: 't' }), /TURSO_DATABASE_URL/);
});
