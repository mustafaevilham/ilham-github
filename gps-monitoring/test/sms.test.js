const test = require('node:test');
const assert = require('node:assert');
const { sendSms } = require('../src/sms');

test('sendSms logs the phone and message when no Eskiz credentials are set', () => {
  const savedEmail = process.env.ESKIZ_EMAIL;
  const savedPw = process.env.ESKIZ_PASSWORD;
  delete process.env.ESKIZ_EMAIL;
  delete process.env.ESKIZ_PASSWORD;
  const lines = [];
  const originalLog = console.log;
  console.log = (line) => lines.push(line);
  try {
    sendSms('+998901234567', 'Roziman: http://example.test/consent/abc');
  } finally {
    console.log = originalLog;
    if (savedEmail !== undefined) process.env.ESKIZ_EMAIL = savedEmail;
    if (savedPw !== undefined) process.env.ESKIZ_PASSWORD = savedPw;
  }
  assert.strictEqual(lines.length, 1);
  assert.match(lines[0], /\+998901234567/);
  assert.match(lines[0], /Roziman: http:\/\/example\.test\/consent\/abc/);
});
