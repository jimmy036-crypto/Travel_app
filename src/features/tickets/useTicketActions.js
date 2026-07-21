import { useCallback, useMemo, useRef, useState } from 'react';

import { generateId } from '../../helpers.js';
import {
  deleteTicketAttachment,
  persistTickets,
  uploadTicketAttachment,
} from '../../services/ticketsService.js';
import {
  TICKET_TYPES,
  normalizeTicket,
} from './ticketModel.js';

const FIREBASE_FORBIDDEN_KEY_CHARS = /[.#$[\]/]/;
const VALID_ATTACHMENT_ACTIONS = new Set(['keep', 'replace', 'remove']);
const CLEANUP_WARNING_DESCRIPTION = '舊附件暫時無法清除，稍後可再次整理儲存空間。';

const trimText = (value) => String(value ?? '').trim();

const assertWritableRoom = (db, roomId) => {
  if (!db) throw new Error('Firebase Database is required for ticket mutations.');
  const safeRoomId = trimText(roomId);
  if (!safeRoomId || FIREBASE_FORBIDDEN_KEY_CHARS.test(safeRoomId)) {
    throw new Error('roomId is invalid for ticket mutations.');
  }
  return safeRoomId;
};

const normalizeAttachmentChange = (attachmentChange) => {
  const action = trimText(attachmentChange?.action);
  if (!VALID_ATTACHMENT_ACTIONS.has(action)) {
    throw new Error('attachmentChange action is invalid.');
  }
  const file = attachmentChange?.file ?? null;
  if (action === 'replace' && !file) {
    throw new Error('A replacement attachment file is required.');
  }
  if (action !== 'replace' && file) {
    throw new Error(`${action} attachmentChange cannot include a file.`);
  }
  return { action, file };
};

const isValidAttachment = (ticket) => (
  ticket?.ticketType === TICKET_TYPES.ATTACHMENT
  && ['image', 'pdf'].includes(ticket.attachmentKind)
  && Boolean(ticket.url || ticket.storagePath)
);

const showCleanupWarning = (toast, title) => {
  const notify = toast?.warning || toast?.info;
  notify?.({
    title,
    description: CLEANUP_WARNING_DESCRIPTION,
  });
};

const clearNonAttachmentFields = (ticket) => {
  if (ticket.ticketType === TICKET_TYPES.ATTACHMENT) return ticket;
  return {
    ...ticket,
    attachmentKind: '',
    type: '',
    storagePath: '',
    url: ticket.ticketType === TICKET_TYPES.WEB_LINK ? ticket.url : '',
  };
};

export function useTicketActions({
  room,
  data,
  state,
  refs,
  feedback,
  callbacks,
}) {
  const { db, roomId, storage } = room;
  const { tickets, members } = data;
  const { setTicketsState, setSyncStatus } = state;
  const {
    dirtyBranchesRef,
    lastLocalWriteAtRef,
    ticketMutationRef,
  } = refs;
  const { confirm, toast } = feedback;
  const { closeTicketEditor } = callbacks;
  const internalMutationRef = useRef(false);
  const activeMutationRef = ticketMutationRef || internalMutationRef;
  const [isSavingTicket, setIsSavingTicket] = useState(false);
  const [deletingTicketId, setDeletingTicketId] = useState('');
  const [uploadProgress, setUploadProgress] = useState(null);

  const markWriteStarted = useCallback(() => {
    setSyncStatus('saving');
    lastLocalWriteAtRef.current = Date.now();
  }, [lastLocalWriteAtRef, setSyncStatus]);

  const markWriteSucceeded = useCallback((nextTickets) => {
    dirtyBranchesRef.current.tickets = false;
    setTicketsState(nextTickets);
    lastLocalWriteAtRef.current = Date.now();
    setSyncStatus('saved');
  }, [dirtyBranchesRef, lastLocalWriteAtRef, setSyncStatus, setTicketsState]);

  const saveTicket = useCallback(async ({ ticket, attachmentChange } = {}) => {
    if (activeMutationRef.current) {
      throw new Error('A ticket mutation is already in progress.');
    }
    const safeRoomId = assertWritableRoom(db, roomId);
    if (!ticket || typeof ticket !== 'object' || Array.isArray(ticket)) {
      throw new Error('A canonical ticket draft is required.');
    }

    const change = normalizeAttachmentChange(attachmentChange);
    const safeTickets = Array.isArray(tickets) ? tickets : [];
    const normalizedDraft = clearNonAttachmentFields(normalizeTicket(ticket, { members }));
    const requestedId = trimText(normalizedDraft.id);
    const isCreate = !requestedId;
    const existingIndex = isCreate
      ? -1
      : safeTickets.findIndex((item) => trimText(item?.id) === requestedId);
    if (!isCreate && existingIndex < 0) throw new Error('Ticket to edit was not found.');

    const existingTicket = existingIndex >= 0
      ? normalizeTicket(safeTickets[existingIndex], { members })
      : null;
    const existingAttachment = isValidAttachment(existingTicket);
    const nextIsAttachment = normalizedDraft.ticketType === TICKET_TYPES.ATTACHMENT;

    if (change.action === 'keep') {
      if (nextIsAttachment && (isCreate || !existingAttachment)) {
        throw new Error('A new or invalid attachment ticket cannot keep an existing attachment.');
      }
      if (existingAttachment && !nextIsAttachment) {
        throw new Error('Changing an attachment ticket type requires remove.');
      }
    }
    if (change.action === 'replace' && !nextIsAttachment) {
      throw new Error('Replacement files require attachment ticketType.');
    }
    if (change.action === 'remove' && (!existingAttachment || nextIsAttachment)) {
      throw new Error('Attachment removal requires an existing attachment and a non-attachment ticketType.');
    }

    const nextId = isCreate ? generateId() : requestedId;
    const timestamp = Date.now();
    const oldStoragePath = trimText(existingTicket?.storagePath);
    let uploadedAttachment = null;

    activeMutationRef.current = true;
    setIsSavingTicket(true);
    setUploadProgress(change.action === 'replace' ? 0 : null);
    markWriteStarted();

    try {
      let attachmentFields = {
        attachmentKind: normalizedDraft.attachmentKind,
        type: normalizedDraft.type,
        url: normalizedDraft.url,
        storagePath: normalizedDraft.storagePath,
      };

      if (change.action === 'keep' && nextIsAttachment) {
        attachmentFields = {
          attachmentKind: existingTicket.attachmentKind,
          type: existingTicket.type,
          url: existingTicket.url,
          storagePath: existingTicket.storagePath,
        };
      }

      if (change.action === 'replace') {
        try {
          uploadedAttachment = await uploadTicketAttachment({
            storage,
            roomId: safeRoomId,
            ticketId: nextId,
            file: change.file,
            onProgress: setUploadProgress,
          });
        } catch (error) {
          setSyncStatus('error');
          toast.error({
            title: '附件上傳失敗',
            description: '請確認檔案格式與網路連線後再試一次。',
          });
          throw error;
        }

        if (oldStoragePath && uploadedAttachment.storagePath === oldStoragePath) {
          try {
            await deleteTicketAttachment({ storage, storagePath: uploadedAttachment.storagePath });
          } catch (cleanupError) {
            console.warn('Rollback duplicate ticket attachment path failed:', cleanupError);
          }
          setSyncStatus('error');
          toast.error({
            title: '附件上傳失敗',
            description: '新附件路徑無法安全取代舊附件，請再試一次。',
          });
          throw new Error('Replacement attachment must use a new storagePath.');
        }

        attachmentFields = {
          attachmentKind: uploadedAttachment.attachmentKind,
          type: uploadedAttachment.attachmentKind,
          url: uploadedAttachment.url,
          storagePath: uploadedAttachment.storagePath,
        };
      }

      if (change.action === 'remove') {
        attachmentFields = {
          attachmentKind: '',
          type: '',
          url: normalizedDraft.ticketType === TICKET_TYPES.WEB_LINK ? normalizedDraft.url : '',
          storagePath: '',
        };
      }

      const nextTicket = normalizeTicket({
        ...normalizedDraft,
        ...attachmentFields,
        id: nextId,
        createdAt: isCreate ? timestamp : existingTicket.createdAt,
        updatedAt: timestamp,
      }, { members });
      const nextTickets = isCreate
        ? [...safeTickets, nextTicket]
        : safeTickets.map((item, index) => (index === existingIndex ? nextTicket : item));

      try {
        await persistTickets({ db, roomId: safeRoomId, tickets: nextTickets });
      } catch (error) {
        if (uploadedAttachment?.storagePath) {
          try {
            await deleteTicketAttachment({ storage, storagePath: uploadedAttachment.storagePath });
          } catch (rollbackError) {
            console.warn('Rollback uploaded ticket attachment failed:', rollbackError);
          }
        }
        setSyncStatus('error');
        toast.error({
          title: isCreate ? '無法新增票券' : '無法更新票券',
          description: '票券資料尚未儲存，請稍後再試。',
        });
        throw error;
      }

      markWriteSucceeded(nextTickets);

      let cleanupFailed = false;
      const shouldDeleteOldAttachment = Boolean(oldStoragePath)
        && (change.action === 'replace' || change.action === 'remove');
      if (shouldDeleteOldAttachment) {
        try {
          await deleteTicketAttachment({ storage, storagePath: oldStoragePath });
        } catch (error) {
          cleanupFailed = true;
          console.warn('Delete old ticket attachment failed:', error);
          showCleanupWarning(toast, '票券已儲存');
        }
      }

      closeTicketEditor();
      if (!cleanupFailed) {
        toast.success({
          title: isCreate ? '票券已新增' : '票券已更新',
          description: '票券夾已更新。',
        });
      }
      return nextTicket;
    } finally {
      activeMutationRef.current = false;
      setIsSavingTicket(false);
      setUploadProgress(null);
    }
  }, [
    activeMutationRef,
    closeTicketEditor,
    db,
    markWriteStarted,
    markWriteSucceeded,
    members,
    roomId,
    setSyncStatus,
    storage,
    tickets,
    toast,
  ]);

  const deleteTicket = useCallback(async (ticketId) => {
    if (activeMutationRef.current) return false;
    activeMutationRef.current = true;

    try {
      const shouldDelete = await confirm({
        title: '刪除這張票券？',
        description: '刪除後，這張票券會從所有旅伴的票券夾中移除。',
        cancelLabel: '保留票券',
        confirmLabel: '刪除票券',
        danger: true,
      });
      if (!shouldDelete) return false;

      const safeRoomId = assertWritableRoom(db, roomId);
      const targetId = trimText(ticketId);
      const safeTickets = Array.isArray(tickets) ? tickets : [];
      const targetTicket = safeTickets.find((item) => trimText(item?.id) === targetId);
      if (!targetId || !targetTicket) return false;
      const nextTickets = safeTickets.filter((item) => trimText(item?.id) !== targetId);
      const oldStoragePath = trimText(targetTicket.storagePath);

      setDeletingTicketId(targetId);
      markWriteStarted();

      try {
        await persistTickets({ db, roomId: safeRoomId, tickets: nextTickets });
      } catch {
        setSyncStatus('error');
        toast.error({
          title: '無法刪除票券',
          description: '票券仍保留在票券夾中，請稍後再試。',
        });
        return false;
      }

      markWriteSucceeded(nextTickets);
      let cleanupFailed = false;
      if (oldStoragePath) {
        try {
          await deleteTicketAttachment({ storage, storagePath: oldStoragePath });
        } catch (error) {
          cleanupFailed = true;
          console.warn('Delete ticket attachment after record deletion failed:', error);
          showCleanupWarning(toast, '票券已刪除');
        }
      }

      if (!cleanupFailed) {
        toast.success({
          title: '票券已刪除',
          description: '票券已從所有旅伴的票券夾移除。',
        });
      }
      return true;
    } finally {
      activeMutationRef.current = false;
      setDeletingTicketId('');
    }
  }, [
    activeMutationRef,
    confirm,
    db,
    markWriteStarted,
    markWriteSucceeded,
    roomId,
    setSyncStatus,
    storage,
    tickets,
    toast,
  ]);

  return useMemo(() => ({
    saveTicket,
    deleteTicket,
    isSavingTicket,
    deletingTicketId,
    uploadProgress,
  }), [deleteTicket, deletingTicketId, isSavingTicket, saveTicket, uploadProgress]);
}
