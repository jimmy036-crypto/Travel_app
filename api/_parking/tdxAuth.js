const TOKEN_URL = 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token';
let cachedToken = null;

export const resetTdxTokenCacheForTest = () => { cachedToken = null; };

export async function getTdxAccessToken({ clientId, clientSecret, fetchImpl = fetch, now = Date.now(), timeoutMs = 5000 } = {}) {
  if (!clientId || !clientSecret) return null;
  if (cachedToken && cachedToken.expiresAt > now + 60000) return cachedToken.value;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    });
    const response = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`TDX auth failed (${response.status})`);
    const payload = await response.json();
    if (!payload?.access_token) throw new Error('TDX auth returned no access token.');
    cachedToken = {
      value: String(payload.access_token),
      expiresAt: now + (Math.max(60, Number(payload.expires_in) || 300) * 1000),
    };
    return cachedToken.value;
  } finally {
    clearTimeout(timer);
  }
}
