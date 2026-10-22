import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase.js';

export function createJournalClient(instance = functions) {
  const invoke = async (name, payload) => {
    if (!instance) throw new Error('雲端回憶服務尚未設定。');
    try { return (await httpsCallable(instance, name)(payload)).data; }
    catch (error) {
      if (String(error.code).endsWith('aborted')) error.message = '這份紀錄已在另一個畫面更新，請比較內容後再儲存。';
      throw error;
    }
  };
  return {
    saveMemory: async (payload) => {
      const result = await invoke('saveTravelMemory', payload);
      const requested = payload.cities || {};
      const saved = result.memory?.cities || {};
      const fields = ['cityId', 'city', 'country', 'cityLat', 'cityLng'];
      if (Object.keys(requested).length !== Object.keys(saved).length || Object.entries(requested).some(([id, city]) => fields.some((field) => city[field] !== saved[id]?.[field]))) {
        throw new Error('城市足跡尚未完整儲存，草稿仍保留。請稍後再試。');
      }
      return result;
    },
    saveCollection: (payload) => invoke('saveTravelCollection', payload),
    cloneTrip: (payload) => invoke('cloneMemoryTrip', payload),
    preserveMemory: (payload) => invoke('requestTravelMemoryPreservation', payload),
    deleteMemory: (payload) => invoke('deleteTravelMemory', payload),
  };
}
