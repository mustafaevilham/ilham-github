const test = require('node:test');
const assert = require('node:assert');
const { pointKey, enqueue, removeSent } = require('../public/offline-queue');

test('enqueue appends a point to the queue', () => {
  const q = enqueue([], { lat: 1, lng: 2, recorded_at: 't1' });
  assert.deepStrictEqual(q, [{ lat: 1, lng: 2, recorded_at: 't1' }]);
});

test('removeSent drops exactly the sent points, keeping ones added during the send', () => {
  const a = { lat: 1, lng: 1, recorded_at: 't1' };
  const b = { lat: 2, lng: 2, recorded_at: 't2' };
  const c = { lat: 3, lng: 3, recorded_at: 't3' };
  const e = { lat: 5, lng: 5, recorded_at: 't5' }; // queued while [a,b,c] was in flight

  // server accepted [a,b,c]; current queue now holds [a,b,c,e]
  const remaining = removeSent([a, b, c, e], [a, b, c]);

  assert.deepStrictEqual(remaining, [e]); // e preserved, never dropped
});

test('removeSent does not drop an un-sent point that shares nothing with sent', () => {
  const a = { lat: 1, lng: 1, recorded_at: 't1' };
  const d = { lat: 4, lng: 4, recorded_at: 't4' };
  const remaining = removeSent([a, d], [a]);
  assert.deepStrictEqual(remaining, [d]);
});

test('pointKey is stable for identical coordinates and timestamp', () => {
  assert.strictEqual(
    pointKey({ lat: 1, lng: 2, recorded_at: 't1' }),
    pointKey({ lat: 1, lng: 2, recorded_at: 't1' })
  );
});
