import { useGlobalModal } from './useGlobalModal.js';

export function useConfirm() {
  return useGlobalModal().confirm;
}
