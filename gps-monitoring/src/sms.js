const { createEskizClient } = require('./eskiz');

// SMS dispatch. When Eskiz.uz credentials are configured via environment
// variables (ESKIZ_EMAIL + ESKIZ_PASSWORD), messages are sent through Eskiz;
// otherwise the message is logged to the console (development / unconfigured).
// The public signature stays `sendSms(phone, message) -> void` so callers are
// unchanged; the Eskiz send is fire-and-forget with a console fallback on error.
let cachedClient = null;

function getEskizClient() {
  if (!process.env.ESKIZ_EMAIL || !process.env.ESKIZ_PASSWORD) return null;
  if (!cachedClient) {
    cachedClient = createEskizClient({
      email: process.env.ESKIZ_EMAIL,
      password: process.env.ESKIZ_PASSWORD,
      from: process.env.ESKIZ_FROM || '4546',
    });
  }
  return cachedClient;
}

function sendSms(phone, message) {
  const client = getEskizClient();
  if (!client) {
    console.log(`[SMS -> ${phone}] ${message}`);
    return;
  }
  client.sendSms(phone, message).catch((err) => {
    // Never lose the message: fall back to logging it if Eskiz fails.
    console.error('Eskiz SMS failed, falling back to log:', err.message);
    console.log(`[SMS -> ${phone}] ${message}`);
  });
}

module.exports = { sendSms };
