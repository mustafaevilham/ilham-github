// Key/value settings stored in the DB, so the admin can change things at
// runtime (password, the consent invite message) without redeploying.

const DEFAULT_CONSENT_TEMPLATE =
  "Hurmatli {name}, siz ish vaqtida GPS orqali kuzatilasiz — " +
  "korrupsiya nazorati uchun. Rozilik berish uchun: {link}";

function getSetting(db, key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setSetting(db, key, value) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

// Seed the admin credentials ONLY if a passwordHash is provided AND none is
// stored yet. With no passwordHash, nothing is seeded and the app stays
// "unconfigured", which triggers the first-run setup screen. Never overwrites
// an existing (possibly changed) password.
function ensureAdminSeed(db, { username, passwordHash }) {
  if (passwordHash && getSetting(db, 'admin_password_hash') === null) {
    setSetting(db, 'admin_username', username);
    setSetting(db, 'admin_password_hash', passwordHash);
  }
}

// True once an admin password has been set (via env seed or first-run setup).
function isAdminConfigured(db) {
  return getSetting(db, 'admin_password_hash') !== null;
}

function getConsentTemplate(db) {
  return getSetting(db, 'consent_message_template', DEFAULT_CONSENT_TEMPLATE);
}

function renderConsentMessage(template, { name, link }) {
  return template
    .split('{name}').join(name)
    .split('{link}').join(link);
}

// The persistent banner/notification text shown while tracking is active —
// on the web page ("GPS kuzatuv FAOL") and, when running inside the native
// app, as the Android foreground-service notification title too.
const DEFAULT_TRACKING_TITLE = "🛰️ GPS kuzatuv FAOL";

function getTrackingTitle(db) {
  return getSetting(db, 'tracking_title', DEFAULT_TRACKING_TITLE);
}

module.exports = {
  getSetting,
  setSetting,
  ensureAdminSeed,
  isAdminConfigured,
  getConsentTemplate,
  renderConsentMessage,
  DEFAULT_CONSENT_TEMPLATE,
  getTrackingTitle,
  DEFAULT_TRACKING_TITLE,
};
