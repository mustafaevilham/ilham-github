const { createDb } = require('./src/db');
const { createApp } = require('./src/app');
const { sweepSignalLoss } = require('./src/anomalyRunner');

const port = Number(process.env.PORT) || 3000;
const adminUsername = process.env.ADMIN_USERNAME || 'admin';
const sessionSecret = process.env.SESSION_SECRET || require('crypto').randomBytes(32).toString('hex');
const dbPath = process.env.DB_PATH || './data/app.db';

// No password is read from the environment: on first run the app shows a
// setup screen where the operator chooses their own admin password. This is
// deterministic (always first-run setup on a fresh database) and never puts a
// password in the repo or relies on a hosting env var the operator can't read.
const db = createDb(dbPath);
const app = createApp(db, {
  adminUsername,
  adminPasswordHash: undefined,
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
