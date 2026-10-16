import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase.js';

export function createJournalClient(instance = functions) {
  const invoke = async (name, payload) => {
    if (!instance) throw new Error('雲端回憶服務尚未設定。');
    try { return (await httpsCallable(instance, name)(payload)).data; }
    catch (error) {
      if (String(error.code).endsWith('aborted')) throw new Error('這份紀錄已在另一個畫面更新。請關閉後重新開啟，確認最新內容再儲存。');
      throw error;
    }
  };
  return {
    saveMemory: (payload) => invoke('saveTravelMemory', payload),
    saveCollection: (payload) => invoke('saveTravelCollection', payload),
    cloneTrip: (payload) => invoke('cloneMemoryTrip', payload),
  };
}
