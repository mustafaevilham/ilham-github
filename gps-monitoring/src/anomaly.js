// Pure, dependency-free anomaly-detection helpers. No DB access here — the
// DB-wired caller lives in anomalyRunner.js. Keeping these pure makes the
// rules unit-testable in isolation.

const EARTH_RADIUS_M = 6371000;

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

function haversineDistanceMeters(lat1, lng1, lat2, lng2) {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

function isOutsideZone(lat, lng, zone) {
  return haversineDistanceMeters(lat, lng, zone.center_lat, zone.center_lng) > zone.radius_m;
}

// Parse "HH:MM" into minutes-of-day.
function minutesOfDay(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function isOutsideWorkHours(date, zone) {
  const minute = date.getHours() * 60 + date.getMinutes();
  const start = minutesOfDay(zone.work_start);
  const end = minutesOfDay(zone.work_end);
  let inside;
  if (start <= end) {
    inside = minute >= start && minute <= end;
  } else {
    // window wraps past midnight (e.g. 22:00–06:00)
    inside = minute >= start || minute <= end;
  }
  return !inside;
}

function timeMs(iso) {
  return new Date(iso).getTime();
}

function detectLongStop(points, thresholdMeters = 50, thresholdMinutes = 15) {
  if (points.length < 2) return false;
  const last = points[points.length - 1];
  let earliestInRun = last;
  // Walk backward while each point is within thresholdMeters of the last point.
  for (let i = points.length - 2; i >= 0; i--) {
    const p = points[i];
    if (haversineDistanceMeters(p.lat, p.lng, last.lat, last.lng) <= thresholdMeters) {
      earliestInRun = p;
    } else {
      break;
    }
  }
  const spanMs = timeMs(last.recorded_at) - timeMs(earliestInRun.recorded_at);
  return spanMs >= thresholdMinutes * 60 * 1000;
}

function detectSignalLoss(lastRecordedAt, now, thresholdMinutes = 10) {
  if (lastRecordedAt === null) return true;
  return now.getTime() - timeMs(lastRecordedAt) >= thresholdMinutes * 60 * 1000;
}

module.exports = {
  haversineDistanceMeters,
  isOutsideZone,
  isOutsideWorkHours,
  detectLongStop,
  detectSignalLoss,
};
