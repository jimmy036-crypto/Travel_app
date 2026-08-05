import { validateParkingSearchQuery } from '../_parking/parkingRequestValidation.js';
import { searchTdxParking } from '../_parking/tdxParkingProvider.js';

const send = (response, status, payload) => response.status(status).json(payload);

export default async function handler(request, response) {
  if (request.method !== 'GET') return send(response, 405, { error: 'method_not_allowed' });
  let input;
  try {
    input = validateParkingSearchQuery(request.query);
  } catch (error) {
    return send(response, 400, { error: 'invalid_request', message: error.message });
  }
  try {
    const result = await searchTdxParking({
      ...input,
      clientId: globalThis.process?.env?.TDX_CLIENT_ID,
      clientSecret: globalThis.process?.env?.TDX_CLIENT_SECRET,
    });
    response.setHeader('Cache-Control', result.providerStatus === 'ok' ? 's-maxage=180, stale-while-revalidate=120' : 'no-store');
    return send(response, 200, result);
  } catch (error) {
    const timeout = error?.name === 'AbortError';
    return send(response, 200, {
      providerStatus: timeout ? 'timeout' : 'unavailable',
      facilities: [],
      fetchedAt: new Date().toISOString(),
    });
  }
}
