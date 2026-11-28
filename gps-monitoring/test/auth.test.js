const test = require('node:test');
const assert = require('node:assert');
const { hashPassword, verifyPassword, requireAdminAuth } = require('../src/auth');

test('hashPassword/verifyPassword round-trip', () => {
  const hash = hashPassword('s3cret');
  assert.strictEqual(verifyPassword('s3cret', hash), true);
  assert.strictEqual(verifyPassword('wrong', hash), false);
});

test('requireAdminAuth redirects when not authenticated', () => {
  const req = { session: {} };
  let redirectedTo = null;
  const res = { redirect: (url) => { redirectedTo = url; } };
  let nextCalled = false;
  requireAdminAuth(req, res, () => { nextCalled = true; });
  assert.strictEqual(redirectedTo, '/admin/login');
  assert.strictEqual(nextCalled, false);
});

test('requireAdminAuth calls next when authenticated', () => {
  const req = { session: { isAdmin: true } };
  const res = { redirect: () => { throw new Error('should not redirect'); } };
  let nextCalled = false;
  requireAdminAuth(req, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true);
});
