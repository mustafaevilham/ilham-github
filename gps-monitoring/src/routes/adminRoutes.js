const crypto = require('crypto');
const express = require('express');
const { verifyPassword, hashPassword, requireAdminAuth } = require('../auth');
const { sendSms } = require('../sms');
const {
  getSetting, setSetting, getConsentTemplate, renderConsentMessage,
} = require('../settings');

function adminRoutes(db, options) {
  const router = express.Router();

  // --- Auth ---
  router.get('/login', (req, res) => {
    res.render('admin-login', { error: null });
  });

  router.post('/login', (req, res) => {
    const { username, password } = req.body;
    // Read current credentials from settings (so a changed password works).
    const storedUser = getSetting(db, 'admin_username', options.adminUsername);
    const storedHash = getSetting(db, 'admin_password_hash', options.adminPasswordHash);
    const ok = username === storedUser && verifyPassword(password || '', storedHash);
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
    const message = renderConsentMessage(getConsentTemplate(db), {
      name,
      link: consentUrl,
    });
    sendSms(phone, message);

    res.redirect('/admin');
  });

  // --- Settings: change password & edit consent message ---
  router.get('/settings', (req, res) => {
    res.render('admin-settings', {
      template: getConsentTemplate(db),
      message: req.query.msg || null,
      error: req.query.err || null,
    });
  });

  router.post('/settings/password', (req, res) => {
    const { current_password, new_password } = req.body;
    const storedHash = getSetting(db, 'admin_password_hash', options.adminPasswordHash);
    if (!verifyPassword(current_password || '', storedHash)) {
      return res.status(200).render('admin-settings', {
        template: getConsentTemplate(db),
        message: null,
        error: 'Joriy parol noto’g’ri',
      });
    }
    if (!new_password || new_password.length < 4) {
      return res.status(200).render('admin-settings', {
        template: getConsentTemplate(db),
        message: null,
        error: 'Yangi parol kamida 4 belgidan iborat bo’lsin',
      });
    }
    setSetting(db, 'admin_password_hash', hashPassword(new_password));
    res.redirect('/admin/settings?msg=' + encodeURIComponent('Parol o’zgartirildi'));
  });

  router.post('/settings/message', (req, res) => {
    const { template } = req.body;
    if (!template || !template.includes('{link}')) {
      return res.status(200).render('admin-settings', {
        template: template || getConsentTemplate(db),
        message: null,
        error: 'Matnda {link} bo’lishi shart (havola shu yerga qo’yiladi)',
      });
    }
    setSetting(db, 'consent_message_template', template);
    res.redirect('/admin/settings?msg=' + encodeURIComponent('Matn saqlandi'));
  });

  // --- Zone editing ---
  router.get('/employees/:id/zone', (req, res) => {
    const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
    if (!employee) return res.status(404).send('Topilmadi');
    const zone = db.prepare('SELECT * FROM zones WHERE employee_id = ?').get(req.params.id);
    res.render('admin-zone', { employee, zone });
  });

  // --- Map ---
  router.get('/map', (req, res) => {
    const employees = db.prepare(`
      SELECT e.id, e.name, e.phone, e.position,
             l.lat, l.lng, l.recorded_at,
             z.center_lat, z.center_lng, z.radius_m
      FROM employees e
      LEFT JOIN locations l
        ON l.id = (SELECT id FROM locations WHERE employee_id = e.id ORDER BY recorded_at DESC LIMIT 1)
      LEFT JOIN zones z ON z.employee_id = e.id
      ORDER BY e.name ASC
    `).all();
    res.render('admin-map', { employees });
  });

  // --- Alerts ---
  router.get('/alerts', (req, res) => {
    const alerts = db.prepare(`
      SELECT a.*, e.name AS employee_name
      FROM alerts a
      JOIN employees e ON e.id = a.employee_id
      ORDER BY a.created_at DESC
    `).all();
    res.render('admin-alerts', { alerts });
  });

  router.post('/alerts/:id/resolve', (req, res) => {
    db.prepare('UPDATE alerts SET resolved = 1 WHERE id = ?').run(req.params.id);
    res.redirect('/admin/alerts');
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
