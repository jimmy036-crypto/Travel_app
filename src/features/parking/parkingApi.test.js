import { beforeEach, describe, expect, it, vi } from 'vitest';

import { normalizeTdxPayload } from '../../../api/_parking/normalizeTdxParking.js';
import { validateParkingSearchQuery } from '../../../api/_parking/parkingRequestValidation.js';
import { getTdxAccessToken, resetTdxTokenCacheForTest } from '../../../api/_parking/tdxAuth.js';
import { searchTdxParking } from '../../../api/_parking/tdxParkingProvider.js';
import handler from '../../../api/parking/search.js';

const createResponse = () => ({
  statusCode: 200, headers: {}, body: null,
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.body = payload; return this; },
  setHeader(name, value) { this.headers[name] = value; },
});

describe('parking API boundary', () => {
  beforeEach(() => {
    resetTdxTokenCacheForTest();
    delete globalThis.process.env.TDX_CLIENT_ID;
    delete globalThis.process.env.TDX_CLIENT_SECRET;
  });

  it('validates latitude longitude and the radius allow-list', () => {
    expect(validateParkingSearchQuery({ lat: '25', lng: '121', radius: '500' })).toEqual({ lat: 25, lng: 121, radius: 500 });
    expect(() => validateParkingSearchQuery({ lat: 91, lng: 121, radius: 500 })).toThrow();
    expect(() => validateParkingSearchQuery({ lat: 25, lng: 121, radius: 400 })).toThrow();
  });

  it('directly imports the handler and returns not_configured without a 500', async () => {
    const response = createResponse();
    await handler({ method: 'GET', query: { lat: 25.033, lng: 121.5654, radius: 500 } }, response);
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ providerStatus: 'not_configured', facilities: [] });
  });

  it('normalizes malformed requests without contacting providers', async () => {
    const response = createResponse();
    await handler({ method: 'GET', query: { lat: 'bad', lng: 121, radius: 500 } }, response);
    expect(response.statusCode).toBe(400);
    expect(response.body.error).toBe('invalid_request');
  });

  it('mocks TDX token auth and caches before expiry', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ access_token: 'deterministic-mock-token', expires_in: 300 }) });
    await expect(getTdxAccessToken({ clientId: 'id', clientSecret: 'secret', fetchImpl, now: 1000 })).resolves.toBe('deterministic-mock-token');
    await expect(getTdxAccessToken({ clientId: 'id', clientSecret: 'secret', fetchImpl, now: 2000 })).resolves.toBe('deterministic-mock-token');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('normalizes TDX static and availability fields with source timestamps', () => {
    const result = normalizeTdxPayload({
      fetchedAt: '2026-08-05T00:00:00Z',
      carParks: [{ CarParkID: 'T1', CarParkName: { Zh_tw: '官方停車場' }, Address: '台北市', CarParkPosition: { PositionLat: 25.03, PositionLon: 121.56 }, FareDescription: '每小時 60 元' }],
      rates: [],
      availabilities: [{ CarParkID: 'T1', AvailableSpaces: 8, TotalSpaces: 20, SrcUpdateTime: '2026-08-04T23:59:00Z' }],
    });
    expect(result[0]).toMatchObject({
      providerFacilityId: 'T1',
      tariff: { rawText: '每小時 60 元' },
      availability: { availableSpaces: 8, totalSpaces: 20 },
      source: { providerUpdatedAt: '2026-08-04T23:59:00Z', fetchedAt: '2026-08-05T00:00:00Z' },
    });
  });

  it('fetches mocked TDX static rate and availability endpoints with a bearer token', async () => {
    const fetchImpl = vi.fn(async (url, options = {}) => {
      if (String(url).includes('/token')) return { ok: true, json: async () => ({ access_token: 'mock-token', expires_in: 300 }) };
      expect(options.headers.authorization).toBe('Bearer mock-token');
      if (String(url).includes('/CarPark/')) return { ok: true, json: async () => ({ CarParks: [{ CarParkID: 'T2', CarParkName: { Zh_tw: 'TDX 車場' }, Address: '台北市', CarParkPosition: { PositionLat: 25.04, PositionLon: 121.55 }, FareDescription: '每小時 50 元' }] }) };
      if (String(url).includes('/ParkingRate/')) return { ok: true, json: async () => ({ ParkingRates: [{ CarParkID: 'T2' }] }) };
      if (String(url).includes('/ParkingAvailability/')) return { ok: true, json: async () => ({ ParkingAvailabilities: [{ CarParkID: 'T2', AvailableSpaces: 3, TotalSpaces: 10 }] }) };
      throw new Error(`Unexpected URL ${url}`);
    });
    const result = await searchTdxParking({ lat: 25.04, lng: 121.55, radius: 300, clientId: 'id', clientSecret: 'secret', fetchImpl, now: Date.parse('2026-08-05T00:00:00Z') });
    expect(result.providerStatus).toBe('ok');
    expect(result.facilities[0]).toMatchObject({ providerFacilityId: 'T2', availability: { availableSpaces: 3 } });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('normalizes a provider timeout as AbortError without real network access', async () => {
    resetTdxTokenCacheForTest();
    const fetchImpl = vi.fn((_url, options = {}) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    await expect(getTdxAccessToken({ clientId: 'id', clientSecret: 'secret', fetchImpl, timeoutMs: 1 })).rejects.toMatchObject({ name: 'AbortError' });
  });
});
