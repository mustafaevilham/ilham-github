const {
  isOutsideZone,
  isOutsideWorkHours,
  detectLongStop,
  detectSignalLoss,
} = require('./anomaly');

// Assumes newLocation has ALREADY been inserted into `locations` by the
// caller. Looks up the previous location itself, so it gives correct
// results whether newLocation is a single live ping or one point from a
// batch of offline-queued points replayed in timestamp order.
function runAnomalyChecks(db, employeeId, newLocation) {
  const zone = db.prepare('SELECT * FROM zones WHERE employee_id = ?').get(employeeId);
  const alertTypes = [];

  const insertAlert = (type, details) => {
    db.prepare(
      'INSERT INTO alerts (employee_id, type, details, created_at, resolved) VALUES (?, ?, ?, ?, 0)'
    ).run(employeeId, type, details, new Date().toISOString());
    alertTypes.push(type);
  };

  if (zone) {
    if (isOutsideZone(newLocation.lat, newLocation.lng, zone)) {
      insertAlert(
        'zone_violation',
        `Ruxsat etilgan hududdan tashqarida: ${newLocation.lat}, ${newLocation.lng}`
      );
    }
    if (isOutsideWorkHours(new Date(newLocation.recorded_at), zone)) {
      insertAlert(
        'outside_hours',
        `Ish vaqtidan tashqari harakat: ${newLocation.recorded_at}`
      );
    }
  }

  // Long-stop check: points in the 30 minutes up to and including this one.
  const windowStart = new Date(
    new Date(newLocation.recorded_at).getTime() - 30 * 60 * 1000
  ).toISOString();
  const recentPoints = db.prepare(
    'SELECT lat, lng, recorded_at FROM locations WHERE employee_id = ? AND recorded_at >= ? AND recorded_at <= ? ORDER BY recorded_at ASC'
  ).all(employeeId, windowStart, newLocation.recorded_at);
  if (detectLongStop(recentPoints)) {
    insertAlert('long_stop', `Uzoq to'xtash aniqlandi: ${newLocation.recorded_at}`);
  }

  // Signal-loss check: gap between this point and the previous stored one.
  const previous = db.prepare(
    'SELECT recorded_at FROM locations WHERE employee_id = ? AND recorded_at < ? ORDER BY recorded_at DESC LIMIT 1'
  ).get(employeeId, newLocation.recorded_at);
  if (previous) {
    if (detectSignalLoss(previous.recorded_at, new Date(newLocation.recorded_at))) {
      insertAlert(
        'signal_loss',
        `Signal uzilishi: oldingi ${previous.recorded_at}, keyingi ${newLocation.recorded_at}`
      );
    }
  }

  return alertTypes;
}

module.exports = { runAnomalyChecks };
