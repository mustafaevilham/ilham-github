// Eskiz.uz SMS client. Dependency-injected (fetchImpl, now) so the auth/token
// caching and send logic are unit-testable without real network calls.
// Docs: https://documenter.getpostman.com/view/663428/RzfmES4z
function createEskizClient({
  email,
  password,
  from = '4546',
  baseUrl = 'https://notify.eskiz.uz/api',
  fetchImpl = fetch,
  now = () => Date.now(),
}) {
  let token = null;
  let tokenExpiry = 0;
  const TOKEN_TTL_MS = 25 * 24 * 60 * 60 * 1000; // Eskiz tokens last ~30 days

  async function getToken() {
    if (token && now() < tokenExpiry) return token;
    const body = new URLSearchParams({ email, password });
    const res = await fetchImpl(`${baseUrl}/auth/login`, {
      method: 'POST',
      body,
    });
    if (!res.ok) throw new Error(`Eskiz login failed: ${res.status}`);
    const data = await res.json();
    token = data && data.data && data.data.token;
    if (!token) throw new Error('Eskiz login returned no token');
    tokenExpiry = now() + TOKEN_TTL_MS;
    return token;
  }

  async function sendSms(phone, message) {
    const t = await getToken();
    const body = new URLSearchParams({
      mobile_phone: String(phone).replace(/\D/g, ''),
      message,
      from,
    });
    const res = await fetchImpl(`${baseUrl}/message/sms/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}` },
      body,
    });
    if (!res.ok) throw new Error(`Eskiz send failed: ${res.status}`);
    return res.json();
  }

  return { getToken, sendSms };
}

module.exports = { createEskizClient };
