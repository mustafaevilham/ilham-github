const test = require('node:test');
const assert = require('node:assert');
const { createEskizClient } = require('../src/eskiz');

// A tiny fake fetch that records calls and returns scripted responses.
function makeFakeFetch(responses) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    const next = responses.shift();
    return {
      ok: next.ok !== false,
      status: next.status || 200,
      json: async () => next.body,
    };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

test('getToken logs in once and caches the token', async () => {
  const fetchImpl = makeFakeFetch([
    { body: { data: { token: 'tok-xyz' } } },
  ]);
  const client = createEskizClient({
    email: 'a@b.uz', password: 'pw', fetchImpl, now: () => 1000,
  });

  const t1 = await client.getToken();
  const t2 = await client.getToken();

  assert.strictEqual(t1, 'tok-xyz');
  assert.strictEqual(t2, 'tok-xyz');
  // only one login call despite two getToken calls
  assert.strictEqual(fetchImpl.calls.length, 1);
  assert.match(fetchImpl.calls[0].url, /\/auth\/login$/);
});

test('sendSms authenticates then posts to the send endpoint with a Bearer token and digit-only phone', async () => {
  const fetchImpl = makeFakeFetch([
    { body: { data: { token: 'tok-xyz' } } },      // login
    { body: { status: 'waiting', id: '123' } },     // send
  ]);
  const client = createEskizClient({
    email: 'a@b.uz', password: 'pw', from: '4546', fetchImpl, now: () => 1000,
  });

  await client.sendSms('+998 90 123 45 67', 'Salom');

  assert.strictEqual(fetchImpl.calls.length, 2);
  const sendCall = fetchImpl.calls[1];
  assert.match(sendCall.url, /\/message\/sms\/send$/);
  assert.strictEqual(sendCall.opts.headers.Authorization, 'Bearer tok-xyz');
  // body is URLSearchParams; phone stripped to digits
  const body = sendCall.opts.body.toString();
  assert.match(body, /mobile_phone=998901234567/);
  assert.match(body, /message=Salom/);
});

test('sendSms throws when the send endpoint returns a non-OK status', async () => {
  const fetchImpl = makeFakeFetch([
    { body: { data: { token: 'tok-xyz' } } },
    { ok: false, status: 400, body: { message: 'bad' } },
  ]);
  const client = createEskizClient({ email: 'a@b.uz', password: 'pw', fetchImpl, now: () => 1000 });

  await assert.rejects(() => client.sendSms('+998901234567', 'x'), /400/);
});
