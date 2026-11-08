const crypto = require('crypto');
const express = require('express');
const { verifyPassword, requireAdminAuth } = require('../auth');
const { sendSms } = require('../sms');

function adminRoutes(db, options) {
  const router = express.Router();

  // --- Auth ---
  router.get('/login', (req, res) => {
    res.render('admin-login', { error: null });
  });

  router.post('/login', (req, res) => {
    const { username, password } = req.body;
    const ok =
      username === options.adminUsername &&
      verifyPassword(password || '', options.adminPasswordHash);
    if (ok) {
      req.session.isAdmin = true;
      return res.redirect('/admin');
    }
    return res.status(200).render('admin-login', { error: 'Login yoki parol xato' });
  });

  router.post('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/admin/login'));
  });

  // Everything below requires auth.
  router.use(requireAdminAuth);

  // --- Dashboard ---
  router.get('/', (req, res) => {
    const employees = db.prepare(`
      SELECT e.*, c.status AS consent_status, c.token AS consent_token, c.consented_at,
             (SELECT MAX(recorded_at) FROM locations l WHERE l.employee_id = e.id) AS last_seen
      FROM employees e
      LEFT JOIN consents c ON c.employee_id = e.id
      ORDER BY e.created_at DESC
    `).all();
    res.render('admin-dashboard', { employees });
  });

  // --- Create employee + consent + SMS ---
  router.post('/employees', (req, res) => {
    const { name, phone, position } = req.body;
    const now = new Date().toISOString();
    const { lastInsertRowid: employeeId } = db.prepare(
      'INSERT INTO employees (name, phone, position, created_at) VALUES (?, ?, ?, ?)'
    ).run(name, phone, position || null, now);

    const token = crypto.randomUUID();
    db.prepare(
      'INSERT INTO consents (employee_id, token, status) VALUES (?, ?, ?)'
    ).run(employeeId, token, 'pending');

    const consentUrl = `${req.protocol}://${req.get('host')}/consent/${token}`;
    const message =
      `Hurmatli ${name}, siz ish vaqtida GPS orqali kuzatilasiz — ` +
      `korrupsiya nazorati uchun. Rozilik berish uchun: ${consentUrl}`;
    sendSms(phone, message);

    res.redirect('/admin');
  });

  // --- Zone editing ---
  router.get('/employees/:id/zone', (req, res) => {
    const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
    if (!employee) return res.status(404).send('Topilmadi');
    const zone = db.prepare('SELECT * FROM zones WHERE employee_id = ?').get(req.params.id);
    res.render('admin-zone', { employee, zone });
  });

  router.post('/employees/:id/zone', (req, res) => {
    const { center_lat, center_lng, radius_m, work_start, work_end } = req.body;
    db.prepare(`
      INSERT INTO zones (employee_id, center_lat, center_lng, radius_m, work_start, work_end)
      VALUES (@id, @lat, @lng, @radius, @start, @end)
      ON CONFLICT(employee_id) DO UPDATE SET
        center_lat = @lat, center_lng = @lng, radius_m = @radius,
        work_start = @start, work_end = @end
    `).run({
      id: Number(req.params.id),
      lat: Number(center_lat),
      lng: Number(center_lng),
      radius: Number(radius_m),
      start: work_start,
      end: work_end,
    });
    res.redirect('/admin');
  });

  return router;
}

module.exports = { adminRoutes };
