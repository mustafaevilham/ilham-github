const bcrypt = require('bcryptjs');

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

// Express middleware: allow through only an authenticated admin session.
function requireAdminAuth(req, res, next) {
  if (req.session && req.session.isAdmin === true) {
    return next();
  }
  return res.redirect('/admin/login');
}

module.exports = { hashPassword, verifyPassword, requireAdminAuth };
