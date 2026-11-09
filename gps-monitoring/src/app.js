const path = require('path');
const express = require('express');
const session = require('express-session');
const { employeeRoutes } = require('./routes/employeeRoutes');
const { adminRoutes } = require('./routes/adminRoutes');
const { ensureAdminSeed } = require('./settings');

function createApp(db, options) {
  // Seed the admin credentials into the DB settings on first boot so they can
  // be changed at runtime. On later boots this never overwrites a changed one.
  ensureAdminSeed(db, {
    username: options.adminUsername,
    passwordHash: options.adminPasswordHash,
  });

  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));

  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use('/static', express.static(path.join(__dirname, '..', 'public')));
  app.use(session({
    secret: options.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true },
  }));

  app.get('/health', (req, res) => {
    res.status(200).json({ ok: true });
  });

  app.use('/consent', employeeRoutes(db));
  app.use('/admin', adminRoutes(db, options));

  return app;
}

module.exports = { createApp };
