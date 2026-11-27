const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  position TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS consents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  consented_at TEXT,
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  recorded_at TEXT NOT NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL UNIQUE,
  center_lat REAL NOT NULL,
  center_lng REAL NOT NULL,
  radius_m REAL NOT NULL,
  work_start TEXT NOT NULL,
  work_end TEXT NOT NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

// Remote (Turso/libSQL) settings come from the environment. Both variables
// must be set together; a half-configured setup would silently fall back to
// a database that is wiped on every restart, so that is an error.
function remoteConfigFromEnv(env = process.env) {
  const url = env.TURSO_DATABASE_URL;
  const authToken = env.TURSO_AUTH_TOKEN;
  if (!url && !authToken) return null;
  if (!url) throw new Error("TURSO_DATABASE_URL is required when TURSO_AUTH_TOKEN is set");
  if (!authToken) throw new Error("TURSO_AUTH_TOKEN is required when TURSO_DATABASE_URL is set");
  return { url, authToken };
}

// Without `remote`: a plain local SQLite file (or :memory: in tests).
// With `remote` ({ url, authToken }): a libSQL "embedded replica" — a local
// file that is synced from, and writes through to, the remote Turso database,
// so data survives restarts of a host with an ephemeral disk (e.g. Render free).
// `libsql` has the same synchronous API as better-sqlite3, so nothing else
// in the app changes. `DatabaseImpl` is injectable for tests.
function createDb(dbPath = "./data/app.db", remote = null) {
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  if (remote) {
    const RemoteDatabase = remote.DatabaseImpl || require("libsql");
    const db = new RemoteDatabase(dbPath, { syncUrl: remote.url, authToken: remote.authToken });
    db.sync();        // pull the current data from Turso before using it
    db.exec(SCHEMA);  // CREATE TABLE IF NOT EXISTS ... (runs against Turso)
    return db;
  }

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

module.exports = { createDb, remoteConfigFromEnv };
