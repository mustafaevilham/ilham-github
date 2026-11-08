const { createDb } = require('./src/db');
const { createApp } = require('./src/app');
const { hashPassword } = require('./src/auth');

const port = Number(process.env.PORT) || 3000;
const adminUsername = process.env.ADMIN_USERNAME || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD;
const sessionSecret = process.env.SESSION_SECRET;
const dbPath = process.env.DB_PATH || './data/app.db';

if (!adminPassword) {
  throw new Error('ADMIN_PASSWORD environment variable is required');
}
if (!sessionSecret) {
  throw new Error('SESSION_SECRET environment variable is required');
}

const db = createDb(dbPath);
const app = createApp(db, {
  adminUsername,
  adminPasswordHash: hashPassword(adminPassword),
  sessionSecret,
});

app.listen(port, () => {
  console.log(`listening on ${port}`);
});
