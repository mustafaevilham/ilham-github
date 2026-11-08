const test = require('node:test');
const assert = require('node:assert');
const { sendSms } = require('../src/sms');

test('sendSms logs the phone and message', () => {
  const lines = [];
  const originalLog = console.log;
  console.log = (line) => lines.push(line);
  try {
    sendSms('+998901234567', 'Roziman: http://example.test/consent/abc');
  } finally {
    console.log = originalLog;
  }
  assert.strictEqual(lines.length, 1);
  assert.match(lines[0], /\+998901234567/);
  assert.match(lines[0], /Roziman: http:\/\/example\.test\/consent\/abc/);
});
