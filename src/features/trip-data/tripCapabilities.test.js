import { describe, expect, it } from 'vitest';

import {
  FIREBASE_TRIP_CAPABILITIES,
  LOCAL_EXAMPLE_TRIP_CAPABILITIES,
  TRIP_CAPABILITY_KEYS,
  hasTripCapability,
  normalizeTripCapabilities,
} from './tripCapabilities.js';

describe('trip capabilities', () => {
  it('always returns the complete capability shape', () => {
    const capabilities = normalizeTripCapabilities({ export: true, unknown: true });

    expect(Object.keys(capabilities)).toEqual(TRIP_CAPABILITY_KEYS);
    expect(capabilities.export).toBe(true);
    expect(capabilities.cloudSync).toBe(false);
    expect(capabilities).not.toHaveProperty('unknown');
    expect(Object.isFrozen(capabilities)).toBe(true);
  });

  it('separates cloud and local example abilities', () => {
    expect(FIREBASE_TRIP_CAPABILITIES).toMatchObject({
      cloudSync: true,
      collaboration: true,
      sharing: true,
      firebaseStorage: true,
      localAttachmentStorage: false,
      offlineCache: true,
      resettable: false,
    });
    expect(LOCAL_EXAMPLE_TRIP_CAPABILITIES).toMatchObject({
      cloudSync: false,
      collaboration: false,
      sharing: false,
      firebaseStorage: false,
      localAttachmentStorage: true,
      offlineCache: false,
      resettable: true,
    });
  });

  it('checks only declared capabilities', () => {
    expect(hasTripCapability(LOCAL_EXAMPLE_TRIP_CAPABILITIES, 'googleMaps')).toBe(true);
    expect(hasTripCapability(LOCAL_EXAMPLE_TRIP_CAPABILITIES, 'sharing')).toBe(false);
    expect(hasTripCapability({ arbitrary: true }, 'arbitrary')).toBe(false);
  });
});
