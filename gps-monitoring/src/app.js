const path = require('path');
const express = require('express');
const session = require('express-session');
const { requireAdminAuth } = require('./auth');
const { employeeRoutes } = require('./routes/employeeRoutes');

function createApp(db, options) {
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));

  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
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

  // Placeholder — replaced by adminRoutes in Task 8.
  app.get('/admin', requireAdminAuth, (req, res) => {
    res.send('OK');
  });

  return app;
}

module.exports = { createApp };
