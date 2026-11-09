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

// Seed the admin credentials from env ONLY if none are stored yet. Never
// overwrites an existing (possibly changed) password.
function ensureAdminSeed(db, { username, passwordHash }) {
  if (getSetting(db, 'admin_password_hash') === null) {
    setSetting(db, 'admin_username', username);
    setSetting(db, 'admin_password_hash', passwordHash);
  }
}

function getConsentTemplate(db) {
  return getSetting(db, 'consent_message_template', DEFAULT_CONSENT_TEMPLATE);
}

function renderConsentMessage(template, { name, link }) {
  return template
    .split('{name}').join(name)
    .split('{link}').join(link);
}

module.exports = {
  getSetting,
  setSetting,
  ensureAdminSeed,
  getConsentTemplate,
  renderConsentMessage,
  DEFAULT_CONSENT_TEMPLATE,
};
