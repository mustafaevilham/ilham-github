const express = require('express');
const { runAnomalyChecks } = require('../anomalyRunner');

function employeeRoutes(db) {
  const router = express.Router();

  const findConsent = (token) =>
    db.prepare('SELECT * FROM consents WHERE token = ?').get(token);

  // Show consent screen (pending) or tracking screen (consented).
  router.get('/:token', (req, res) => {
    const consent = findConsent(req.params.token);
    if (!consent) return res.status(404).send('Topilmadi');

    const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(consent.employee_id);
    if (consent.status === 'consented') {
      return res.render('consent-tracking', { token: req.params.token, employee });
    }
    return res.render('consent-pending', { token: req.params.token, employee });
  });

  // Record consent.
  router.post('/:token', (req, res) => {
    const consent = findConsent(req.params.token);
    if (!consent) return res.status(404).send('Topilmadi');

    if (consent.status === 'pending') {
      db.prepare('UPDATE consents SET status = ?, consented_at = ? WHERE token = ?')
        .run('consented', new Date().toISOString(), req.params.token);
    }
    return res.redirect(`/consent/${req.params.token}`);
  });

  // Accept a batch of queued locations.
  router.post('/:token/locations', (req, res) => {
    const consent = findConsent(req.params.token);
    if (!consent) return res.status(404).send('Topilmadi');
    if (consent.status !== 'consented') return res.status(403).send('Rozilik berilmagan');

    const points = req.body && req.body.points;
    if (!Array.isArray(points) || points.length === 0) {
      return res.status(400).json({ error: 'points array required' });
    }
    for (const p of points) {
      const latOk = typeof p.lat === 'number' && Number.isFinite(p.lat);
      const lngOk = typeof p.lng === 'number' && Number.isFinite(p.lng);
      const timeOk = p.recorded_at && !Number.isNaN(new Date(p.recorded_at).getTime());
      if (!latOk || !lngOk || !timeOk) {
        return res.status(400).json({ error: 'invalid point' });
      }
    }

    const sorted = [...points].sort(
      (a, b) => new Date(a.recorded_at) - new Date(b.recorded_at)
    );
    const insertLocation = db.prepare(
      'INSERT INTO locations (employee_id, lat, lng, recorded_at) VALUES (?, ?, ?, ?)'
    );
    for (const p of sorted) {
      insertLocation.run(consent.employee_id, p.lat, p.lng, p.recorded_at);
      runAnomalyChecks(db, consent.employee_id, {
        lat: p.lat, lng: p.lng, recorded_at: p.recorded_at,
      });
    }
    return res.status(204).end();
  });

  return router;
}

module.exports = { employeeRoutes };
