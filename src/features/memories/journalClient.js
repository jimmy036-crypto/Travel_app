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
    saveMemory: (payload) => invoke('saveTravelMemory', payload),
    saveCollection: (payload) => invoke('saveTravelCollection', payload),
    cloneTrip: (payload) => invoke('cloneMemoryTrip', payload),
    preserveMemory: (payload) => invoke('requestTravelMemoryPreservation', payload),
    deleteMemory: (payload) => invoke('deleteTravelMemory', payload),
  };
}
