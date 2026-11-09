const test = require('node:test');
const assert = require('node:assert');
const { createDb } = require('../src/db');
const {
  getSetting, setSetting, ensureAdminSeed,
  getConsentTemplate, renderConsentMessage, DEFAULT_CONSENT_TEMPLATE,
} = require('../src/settings');

test('getSetting returns the fallback when the key is absent, stored value when present', () => {
  const db = createDb(':memory:');
  assert.strictEqual(getSetting(db, 'missing', 'fallback'), 'fallback');
  setSetting(db, 'missing', 'now-set');
  assert.strictEqual(getSetting(db, 'missing', 'fallback'), 'now-set');
});

test('setSetting upserts (second write replaces the first)', () => {
  const db = createDb(':memory:');
  setSetting(db, 'k', 'v1');
  setSetting(db, 'k', 'v2');
  assert.strictEqual(getSetting(db, 'k', null), 'v2');
});

test('ensureAdminSeed seeds only when no admin exists, and never overwrites a changed password', () => {
  const db = createDb(':memory:');
  ensureAdminSeed(db, { username: 'admin', passwordHash: 'hash-A' });
  assert.strictEqual(getSetting(db, 'admin_username', null), 'admin');
  assert.strictEqual(getSetting(db, 'admin_password_hash', null), 'hash-A');

  // simulate the admin changing their password
  setSetting(db, 'admin_password_hash', 'hash-B');
  // a later boot must NOT clobber it back to the env seed
  ensureAdminSeed(db, { username: 'admin', passwordHash: 'hash-A' });
  assert.strictEqual(getSetting(db, 'admin_password_hash', null), 'hash-B');
});

test('getConsentTemplate returns the default when unset, the stored one when set', () => {
  const db = createDb(':memory:');
  assert.strictEqual(getConsentTemplate(db), DEFAULT_CONSENT_TEMPLATE);
  setSetting(db, 'consent_message_template', 'Salom {name}, havola: {link}');
  assert.strictEqual(getConsentTemplate(db), 'Salom {name}, havola: {link}');
});

test('renderConsentMessage replaces {name} and {link} placeholders (all occurrences)', () => {
  const out = renderConsentMessage('{name}, {name}! Havola: {link}', {
    name: 'Jasur', link: 'http://x/consent/abc',
  });
  assert.strictEqual(out, 'Jasur, Jasur! Havola: http://x/consent/abc');
});
