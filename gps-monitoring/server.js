const { createDb } = require('./src/db');
const { createApp } = require('./src/app');
const { hashPassword } = require('./src/auth');
const { sweepSignalLoss } = require('./src/anomalyRunner');

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

// Proactively detect employees who have gone dark during work hours.
const SWEEP_INTERVAL_MS = 2 * 60 * 1000; // every 2 minutes
const sweepTimer = setInterval(() => {
  try {
    sweepSignalLoss(db, new Date());
  } catch (err) {
    console.error('signal-loss sweep failed:', err);
  }
}, SWEEP_INTERVAL_MS);
sweepTimer.unref(); // don't keep the process alive just for the sweep

app.listen(port, () => {
  console.log(`listening on ${port}`);
});
