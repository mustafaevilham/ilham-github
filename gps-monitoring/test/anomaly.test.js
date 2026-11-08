const test = require('node:test');
const assert = require('node:assert');
const {
  haversineDistanceMeters, isOutsideZone, isOutsideWorkHours,
  detectLongStop, detectSignalLoss,
} = require('../src/anomaly');

test('haversineDistanceMeters: same point is ~0m', () => {
  assert.ok(haversineDistanceMeters(41.3, 69.2, 41.3, 69.2) < 0.001);
});

test('isOutsideZone: point just inside the radius is not outside', () => {
  const zone = { center_lat: 41.3, center_lng: 69.2, radius_m: 1000 };
  // ~900m north of center
  assert.strictEqual(isOutsideZone(41.30809, 69.2, zone), false);
});

test('isOutsideZone: point just outside the radius is outside', () => {
  const zone = { center_lat: 41.3, center_lng: 69.2, radius_m: 1000 };
  // ~1100m north of center
  assert.strictEqual(isOutsideZone(41.30989, 69.2, zone), true);
});

test('isOutsideWorkHours: normal (non-wrapping) window', () => {
  const zone = { work_start: '09:00', work_end: '18:00' };
  assert.strictEqual(isOutsideWorkHours(new Date('2026-11-08T10:00:00'), zone), false);
  assert.strictEqual(isOutsideWorkHours(new Date('2026-11-08T20:00:00'), zone), true);
});

test('isOutsideWorkHours: midnight-wrapping night shift', () => {
  const zone = { work_start: '22:00', work_end: '06:00' };
  assert.strictEqual(isOutsideWorkHours(new Date('2026-11-08T23:00:00'), zone), false); // inside, after wrap
  assert.strictEqual(isOutsideWorkHours(new Date('2026-11-08T02:00:00'), zone), false); // inside, before wrap
  assert.strictEqual(isOutsideWorkHours(new Date('2026-11-08T12:00:00'), zone), true);  // outside, midday
});

test('detectLongStop: true when stationary for >= threshold', () => {
  const points = [
    { lat: 41.3, lng: 69.2, recorded_at: '2026-11-08T10:00:00Z' },
    { lat: 41.3, lng: 69.2, recorded_at: '2026-11-08T10:08:00Z' },
    { lat: 41.3, lng: 69.2, recorded_at: '2026-11-08T10:16:00Z' },
  ];
  assert.strictEqual(detectLongStop(points, 50, 15), true);
});

test('detectLongStop: false on sparse/short history (no false positive right after consent)', () => {
  const points = [
    { lat: 41.3, lng: 69.2, recorded_at: '2026-11-08T10:00:00Z' },
    { lat: 41.3, lng: 69.2, recorded_at: '2026-11-08T10:02:00Z' },
  ];
  assert.strictEqual(detectLongStop(points, 50, 15), false);
});

test('detectSignalLoss: true when gap exceeds threshold', () => {
  assert.strictEqual(
    detectSignalLoss('2026-11-08T10:00:00Z', new Date('2026-11-08T10:11:00Z'), 10),
    true
  );
});

test('detectSignalLoss: false when gap is within threshold', () => {
  assert.strictEqual(
    detectSignalLoss('2026-11-08T10:00:00Z', new Date('2026-11-08T10:05:00Z'), 10),
    false
  );
});
