import { describe, expect, it, vi } from 'vitest';

import { estimateParkingCost } from './parkingEstimate.js';
import { createParkingFacility } from './parkingFacilityModel.js';
import { isDrivingContext } from './parkingDrivingContext.js';
import {
  getParkingMatchConfidence,
  mergeParkingProviders,
  normalizeParkingIdentityText,
} from './parkingProviderMerge.js';
import { sanitizeParkingPlan, updatePlaceParkingPlan } from './parkingPersistencePolicy.js';
import { scoreParkingFacility, sortParkingFacilities } from './parkingRanking.js';
import { getMaximumLabel, parseParkingTariff } from './parkingTariffModel.js';

describe('parking domain', () => {
  it('normalizes unknown values without using zero', () => {
    const facility = createParkingFacility({ provider: 'google', googlePlaceId: 'p1' });
    expect(facility.location).toEqual({ lat: null, lng: null });
    expect(facility.availability.availableSpaces).toBeNull();
    expect(facility.tariff.displaySummary).toBe('費率資料未提供');
  });

  it.each([
    [{ metaTransport: '汽車 🚗' }, true],
    [{ metaTransport: '大眾運輸', nextLegMode: 'AUTO' }, true],
    [{ metaTransport: '電車', nextLegMode: 'TRANSIT' }, false],
  ])('detects driving context centrally', (input, expected) => {
    expect(isDrivingContext(input)).toBe(expected);
  });

  it('preserves raw text and safely converts a linear rate', () => {
    const tariff = parseParkingTariff('每 30 分鐘 30 元');
    expect(tariff.rawText).toBe('每 30 分鐘 30 元');
    expect(tariff.hourlyEquivalent).toBe(60);
    expect(tariff.confidence).toBe('high');
  });

  it('keeps conditional maximum labels', () => {
    const tariff = parseParkingTariff('08:00–22:00 每 30 分鐘 50 元；08:00–22:00 最高 300 元');
    expect(tariff.hourlyEquivalent).toBeNull();
    expect(getMaximumLabel(tariff)).toBe('08:00–22:00最高 NT$300');
  });

  it('parses a qualified Japanese maximum without guessing an hourly rate', () => {
    const tariff = parseParkingTariff('入場後 12 小時最高 1,500 日圓');
    expect(tariff.currency).toBe('JPY');
    expect(tariff.hourlyEquivalent).toBeNull();
    expect(getMaximumLabel(tariff)).toBe('入場後 12 小時最高 ¥1,500');
  });

  it('does not flatten complex tariffs into one hourly price', () => {
    const tariff = parseParkingTariff('首小時 50 元，之後每 30 分鐘 30 元');
    expect(tariff.rawText).toContain('首小時');
    expect(tariff.hourlyEquivalent).toBeNull();
    expect(tariff.confidence).toBe('low');
  });

  it('estimates a complete linear tariff and applies a daily cap', () => {
    const tariff = parseParkingTariff('每小時 60 元；當日最高 100 元');
    expect(estimateParkingCost({ tariff, stayTime: 180, arrivalTime: '09:00' })).toEqual({
      amount: 100,
      message: '估計約 NT$100',
    });
  });

  it('refuses estimates when arrival or rules are incomplete', () => {
    expect(estimateParkingCost({ tariff: parseParkingTariff('活動特別費率'), stayTime: 120, arrivalTime: '09:00' }).amount).toBeNull();
    expect(estimateParkingCost({ tariff: parseParkingTariff('每小時 60 元'), stayTime: 120 }).amount).toBeNull();
    expect(estimateParkingCost({ tariff: parseParkingTariff('每小時 60 元；當日最高 300 元'), stayTime: 180, arrivalTime: '23:00' }).amount).toBeNull();
  });

  it('normalizes names and uses conservative distance matching', () => {
    expect(normalizeParkingIdentityText('台北 101 停車場')).toBe('台北101');
    const google = { name: '台北 101 停車場', address: '台北市信義路五段7號', location: { lat: 25.033, lng: 121.5654 } };
    expect(getParkingMatchConfidence(google, { name: '台北101停車場', address: '台北市信義路五段7號', location: { lat: 25.0331, lng: 121.5654 } })).toBe('high');
    expect(getParkingMatchConfidence(google, { name: '其他停車場', address: '另一地址', location: { lat: 25.035, lng: 121.5654 } })).toBe('low');
  });

  it('does not attach precise official data for a low confidence match', () => {
    const google = createParkingFacility({ provider: 'google', googlePlaceId: 'g', name: 'A', location: { lat: 25, lng: 121 } });
    const official = createParkingFacility({ provider: 'tdx', providerFacilityId: 't', name: 'B', location: { lat: 25.02, lng: 121.02 }, tariff: { rawText: '每小時 60 元' } });
    const result = mergeParkingProviders([google], [official]);
    expect(result).toHaveLength(2);
    expect(result[0].tariff.rawText).toBeNull();
  });

  it('uses official identity fields for a confident merged result so Google content is not persisted', () => {
    const google = createParkingFacility({ provider: 'google', googlePlaceId: 'g', name: 'Google name', address: 'Google address', location: { lat: 25, lng: 121 } });
    const official = createParkingFacility({ provider: 'tdx', providerFacilityId: 't', googlePlaceId: 'g', name: '官方名稱', address: '官方地址', location: { lat: 25, lng: 121 }, tariff: { rawText: '每小時 60 元' } });
    const [merged] = mergeParkingProviders([google], [official]);
    expect(merged).toMatchObject({ provider: 'google+tdx', name: '官方名稱', address: '官方地址' });
    expect(sanitizeParkingPlan(merged)).toMatchObject({ name: '官方名稱', address: '官方地址', googlePlaceId: 'g' });
  });

  it('ranks using the approved suitability weights', () => {
    vi.setSystemTime(new Date('2026-08-05T00:00:00Z'));
    const near = createParkingFacility({ id: 'near', distanceToDestinationMeters: 100, opening: { isOpen: true }, availability: { availableSpaces: 5 }, tariff: { rawText: '每小時 60 元', confidence: 'high', rules: [] }, source: { fetchedAt: '2026-08-05T00:00:00Z' } });
    const far = createParkingFacility({ id: 'far', distanceToDestinationMeters: 900, opening: { isOpen: false } });
    expect(scoreParkingFacility(near)).toBeGreaterThan(scoreParkingFacility(far));
    expect(sortParkingFacilities([far, near])[0].id).toBe('near');
    vi.useRealTimers();
  });

  it('stores only Place ID for Google content and stores official snapshots for TDX', () => {
    const googlePlan = sanitizeParkingPlan(createParkingFacility({ provider: 'google', googlePlaceId: 'g', name: 'Do not persist', address: 'Do not persist' }), '2026-08-05T00:00:00Z');
    expect(googlePlan.googlePlaceId).toBe('g');
    expect(googlePlan).not.toHaveProperty('name');
    const tdxPlan = sanitizeParkingPlan(createParkingFacility({ provider: 'tdx', providerFacilityId: 't', name: '官方停車場', tariff: { rawText: '每小時 60 元' } }), '2026-08-05T00:00:00Z');
    expect(tdxPlan.name).toBe('官方停車場');
    expect(tdxPlan.tariffSnapshot.rawText).toBe('每小時 60 元');
  });

  it('adds and removes optional parkingPlan without touching other place fields', () => {
    const itinerary = { 'Day 1': [{ id: 'p1', name: '景點', memo: 'keep' }] };
    const saved = updatePlaceParkingPlan(itinerary, 'Day 1', 'p1', { schemaVersion: 1 });
    expect(saved['Day 1'][0]).toMatchObject({ name: '景點', memo: 'keep', parkingPlan: { schemaVersion: 1 } });
    expect(updatePlaceParkingPlan(saved, 'Day 1', 'p1', null)).toEqual(itinerary);
  });
});
