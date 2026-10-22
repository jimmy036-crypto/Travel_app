import { beforeEach, expect, it, vi } from 'vitest';
import { createJournalClient } from './journalClient.js';
const invoke = vi.hoisted(() => vi.fn());
vi.mock('firebase/functions', () => ({ httpsCallable: () => invoke }));
vi.mock('../../firebase.js', () => ({ functions: {} }));
beforeEach(() => vi.clearAllMocks());
it('does not acknowledge city data that the server failed to preserve', async () => {
  const client = createJournalClient({});
  const payload = { cities: { kyoto: { cityId: 'kyoto', city: '京都', country: '日本', cityLat: 35, cityLng: 135 } } };
  invoke.mockResolvedValue({ data: { memory: { revision: 1 } } });
  await expect(client.saveMemory(payload)).rejects.toThrow('城市');
  invoke.mockResolvedValue({ data: { memory: { revision: 2, cities: payload.cities } } });
  await expect(client.saveMemory(payload)).resolves.toMatchObject({ memory: { cities: payload.cities } });
});
