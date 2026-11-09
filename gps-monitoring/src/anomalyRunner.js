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
  // Spec rule #3: a long stop only counts when it is NOT inside the
  // employee's declared zone (a stop at the depot/break point is normal).
  const stopOutsideDeclaredZone =
    !zone || isOutsideZone(newLocation.lat, newLocation.lng, zone);
  if (stopOutsideDeclaredZone && detectLongStop(recentPoints)) {
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

// Periodic sweep: raise a signal_loss alert for any consented employee who
// has stopped reporting during work hours. This is the proactive counterpart
// to the per-ping check — an employee who closes the tab or deliberately goes
// dark never sends another ping, so only a sweep can catch it. Returns the
// employee ids newly alerted. Deduplicates: it will not raise a second alert
// for the same silent gap (one already unresolved and newer than last ping).
function sweepSignalLoss(db, now = new Date(), tzOffsetMinutes = 300) {
  const rows = db.prepare(`
    SELECT e.id AS employee_id, z.work_start, z.work_end,
           (SELECT MAX(recorded_at) FROM locations l WHERE l.employee_id = e.id) AS last_seen
    FROM employees e
    JOIN consents c ON c.employee_id = e.id AND c.status = 'consented'
    JOIN zones z ON z.employee_id = e.id
  `).all();

  const inserted = [];
  for (const r of rows) {
    if (!r.last_seen) continue; // consented but never reported yet — grace, no alert
    const zone = { work_start: r.work_start, work_end: r.work_end };
    if (isOutsideWorkHours(now, zone, tzOffsetMinutes)) continue; // only during work hours
    if (!detectSignalLoss(r.last_seen, now)) continue;

    const existing = db.prepare(`
      SELECT 1 FROM alerts
      WHERE employee_id = ? AND type = 'signal_loss' AND resolved = 0 AND created_at > ?
      LIMIT 1
    `).get(r.employee_id, r.last_seen);
    if (existing) continue;

    db.prepare(
      'INSERT INTO alerts (employee_id, type, details, created_at, resolved) VALUES (?, ?, ?, ?, 0)'
    ).run(
      r.employee_id,
      'signal_loss',
      `Signal uzilishi: oxirgi ma'lumot ${r.last_seen}, hozirgacha javob yo'q`,
      now.toISOString()
    );
    inserted.push(r.employee_id);
  }
  return inserted;
}

module.exports = { runAnomalyChecks, sweepSignalLoss };
