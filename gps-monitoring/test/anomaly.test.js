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

// Pings arrive as UTC ISO timestamps; the work-hours window is wall-clock in
// the business timezone (default UTC+5, Tashkent). These use explicit `Z`
// times so they are deterministic regardless of the server's own timezone.
test('isOutsideWorkHours: normal (non-wrapping) window evaluated in business tz (UTC+5)', () => {
  const zone = { work_start: '09:00', work_end: '18:00' };
  // 10:00 Tashkent = 05:00Z -> inside
  assert.strictEqual(isOutsideWorkHours(new Date('2026-11-08T05:00:00Z'), zone), false);
  // 20:00 Tashkent = 15:00Z -> outside
  assert.strictEqual(isOutsideWorkHours(new Date('2026-11-08T15:00:00Z'), zone), true);
});

test('isOutsideWorkHours: midnight-wrapping night shift evaluated in business tz (UTC+5)', () => {
  const zone = { work_start: '22:00', work_end: '06:00' };
  // 23:00 Tashkent = 18:00Z -> inside, after wrap
  assert.strictEqual(isOutsideWorkHours(new Date('2026-11-08T18:00:00Z'), zone), false);
  // 02:00 Tashkent = 21:00Z (prev day) -> inside, before wrap
  assert.strictEqual(isOutsideWorkHours(new Date('2026-11-08T21:00:00Z'), zone), false);
  // 12:00 Tashkent = 07:00Z -> outside, midday
  assert.strictEqual(isOutsideWorkHours(new Date('2026-11-08T07:00:00Z'), zone), true);
});

test('isOutsideWorkHours: a UTC-server evaluation does not shift the window (regression)', () => {
  const zone = { work_start: '09:00', work_end: '18:00' };
  // 09:30 Tashkent = 04:30Z. A naive getHours() on a UTC server would read
  // 04:30 and wrongly call this outside hours. With tz handling it is inside.
  assert.strictEqual(isOutsideWorkHours(new Date('2026-11-08T04:30:00Z'), zone), false);
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
