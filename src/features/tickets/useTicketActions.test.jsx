import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTicketActions } from './useTicketActions.js';

const serviceMocks = vi.hoisted(() => ({
  uploadTicketAttachment: vi.fn(),
  deleteTicketAttachment: vi.fn(),
  persistTickets: vi.fn(),
  events: [],
}));

vi.mock('../../services/ticketsService.js', () => ({
  uploadTicketAttachment: serviceMocks.uploadTicketAttachment,
  deleteTicketAttachment: serviceMocks.deleteTicketAttachment,
  persistTickets: serviceMocks.persistTickets,
}));

const members = ['王泓文', '陳小美'];
const attachmentTicket = {
  id: 'attachment-1',
  title: '原附件',
  ticketType: 'attachment',
  attachmentKind: 'image',
  type: 'image',
  url: 'https://storage.example/old.png',
  storagePath: 'rooms/room-1/tickets/attachment-1/old_old.png',
  audienceType: 'all',
  assignedMembers: [],
  presenterMember: '',
  dayId: 'Day 1',
  createdAt: 100,
  updatedAt: 200,
};
const webTicket = {
  id: 'web-1',
  title: '網頁票券',
  ticketType: 'web-link',
  url: 'https://tickets.example/old',
  audienceType: 'members',
  assignedMembers: ['王泓文'],
  dayId: 'Day 1',
  createdAt: 300,
  updatedAt: 400,
};

const createWebDraft = (overrides = {}) => ({
  id: '',
  title: '新網頁票券',
  ticketType: 'web-link',
  url: 'https://tickets.example/new',
  audienceType: 'all',
  assignedMembers: [],
  dayId: 'Day 1',
  ...overrides,
});

const createExternalDraft = (overrides = {}) => ({
  id: '',
  title: 'App 票券',
  ticketType: 'external-app',
  appName: 'Rail App',
  appUrl: '',
  fallbackUrl: '',
  audienceType: 'all',
  assignedMembers: [],
  dayId: 'Day 1',
  ...overrides,
});

const createAttachmentDraft = (overrides = {}) => ({
  id: '',
  title: '新附件票券',
  ticketType: 'attachment',
  attachmentKind: 'image',
  audienceType: 'all',
  assignedMembers: [],
  dayId: 'Day 1',
  ...overrides,
});

const createDeps = (overrides = {}) => ({
  room: {
    db: { app: 'db' },
    roomId: 'room-1',
    storage: { app: 'storage' },
    ...overrides.room,
  },
  data: {
    tickets: [attachmentTicket, webTicket],
    members,
    ...overrides.data,
  },
  state: {
    setTicketsState: vi.fn(),
    setSyncStatus: vi.fn(),
    ...overrides.state,
  },
  refs: {
    dirtyBranchesRef: { current: { tickets: true } },
    lastLocalWriteAtRef: { current: 0 },
    ticketMutationRef: { current: false },
    ...overrides.refs,
  },
  feedback: {
    confirm: vi.fn().mockResolvedValue(true),
    toast: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    },
    ...overrides.feedback,
  },
  callbacks: {
    closeTicketEditor: vi.fn(),
    ...overrides.callbacks,
  },
});

const renderActions = (overrides = {}) => {
  const deps = createDeps(overrides);
  return {
    deps,
    ...renderHook(() => useTicketActions(deps)),
  };
};

describe('useTicketActions save and delete orchestration', () => {
  beforeEach(() => {
    serviceMocks.events.length = 0;
    serviceMocks.uploadTicketAttachment.mockReset();
    serviceMocks.uploadTicketAttachment.mockImplementation(async ({ onProgress }) => {
      serviceMocks.events.push('upload');
      onProgress?.(45);
      return {
        url: 'https://storage.example/new.png',
        storagePath: 'rooms/room-1/tickets/new/revision_new.png',
        attachmentKind: 'image',
        fileName: 'new.png',
        contentType: 'image/png',
        size: 5,
      };
    });
    serviceMocks.persistTickets.mockReset();
    serviceMocks.persistTickets.mockImplementation(async () => {
      serviceMocks.events.push('database');
    });
    serviceMocks.deleteTicketAttachment.mockReset();
    serviceMocks.deleteTicketAttachment.mockImplementation(async ({ storagePath }) => {
      serviceMocks.events.push(`delete:${storagePath}`);
      return { deleted: true, reason: 'deleted' };
    });
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('generated-ticket-id');
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('ACTIONS-01 creates a normalized web-link ticket', async () => {
    const view = renderActions({ data: { tickets: [] } });

    let saved;
    await act(async () => {
      saved = await view.result.current.saveTicket({
        ticket: createWebDraft(),
        attachmentChange: { action: 'keep', file: null },
      });
    });

    expect(saved.ticketType).toBe('web-link');
    expect(serviceMocks.persistTickets).toHaveBeenCalledTimes(1);
    expect(view.deps.feedback.toast.success).toHaveBeenCalledWith(expect.objectContaining({ title: '票券已新增' }));
  });

  it('ACTIONS-02 creates an external-app manual-mode record without appUrl', async () => {
    const view = renderActions({ data: { tickets: [] } });

    let saved;
    await act(async () => {
      saved = await view.result.current.saveTicket({
        ticket: createExternalDraft(),
        attachmentChange: { action: 'keep', file: null },
      });
    });

    expect(saved).toMatchObject({ ticketType: 'external-app', appName: 'Rail App', appUrl: '' });
  });

  it('ACTIONS-03 creates an attachment by uploading before Database persistence', async () => {
    const view = renderActions({ data: { tickets: [] } });
    const file = new File(['image'], 'new.png', { type: 'image/png' });

    await act(async () => {
      await view.result.current.saveTicket({
        ticket: createAttachmentDraft(),
        attachmentChange: { action: 'replace', file },
      });
    });

    expect(serviceMocks.events.slice(0, 2)).toEqual(['upload', 'database']);
    expect(serviceMocks.persistTickets.mock.calls[0][0].tickets[0]).toMatchObject({
      url: 'https://storage.example/new.png',
      attachmentKind: 'image',
    });
  });

  it('ACTIONS-04 generates a new ID for create', async () => {
    const view = renderActions({ data: { tickets: [] } });

    await act(async () => {
      await view.result.current.saveTicket({
        ticket: createWebDraft(), attachmentChange: { action: 'keep', file: null },
      });
    });

    expect(serviceMocks.persistTickets.mock.calls[0][0].tickets[0].id).toBe('room_generated-ticket-id');
  });

  it('ACTIONS-05 sets createdAt and updatedAt for create', async () => {
    const view = renderActions({ data: { tickets: [] } });

    await act(async () => {
      await view.result.current.saveTicket({
        ticket: createWebDraft(), attachmentChange: { action: 'keep', file: null },
      });
    });

    expect(serviceMocks.persistTickets.mock.calls[0][0].tickets[0]).toMatchObject({
      createdAt: 1_000,
      updatedAt: 1_000,
    });
  });

  it('ACTIONS-06 preserves createdAt and updates updatedAt for edit', async () => {
    const view = renderActions();

    await act(async () => {
      await view.result.current.saveTicket({
        ticket: { ...webTicket, title: '已更新' },
        attachmentChange: { action: 'keep', file: null },
      });
    });

    const updated = serviceMocks.persistTickets.mock.calls[0][0].tickets[1];
    expect(updated).toMatchObject({ createdAt: 300, updatedAt: 1_000, title: '已更新' });
  });

  it('ACTIONS-07 keeps an existing attachment without Storage operations', async () => {
    const view = renderActions();
    const edited = { ...attachmentTicket, title: '文字已更新', url: '', storagePath: '' };

    await act(async () => {
      await view.result.current.saveTicket({
        ticket: edited,
        attachmentChange: { action: 'keep', file: null },
      });
    });

    const saved = serviceMocks.persistTickets.mock.calls[0][0].tickets[0];
    expect(saved).toMatchObject({
      url: attachmentTicket.url,
      storagePath: attachmentTicket.storagePath,
      attachmentKind: 'image',
      type: 'image',
    });
    expect(serviceMocks.uploadTicketAttachment).not.toHaveBeenCalled();
    expect(serviceMocks.deleteTicketAttachment).not.toHaveBeenCalled();
  });

  it('ACTIONS-08 replaces an attachment and persists the new attachment metadata', async () => {
    const view = renderActions();
    const file = new File(['image'], 'new.png', { type: 'image/png' });

    await act(async () => {
      await view.result.current.saveTicket({
        ticket: attachmentTicket,
        attachmentChange: { action: 'replace', file },
      });
    });

    expect(serviceMocks.persistTickets.mock.calls[0][0].tickets[0].storagePath)
      .toBe('rooms/room-1/tickets/new/revision_new.png');
  });

  it('ACTIONS-09 requires replacement storagePath to differ from the old attachment', async () => {
    serviceMocks.uploadTicketAttachment.mockResolvedValueOnce({
      url: 'https://storage.example/new.png',
      storagePath: attachmentTicket.storagePath,
      attachmentKind: 'image',
    });
    const view = renderActions();

    await expect(act(async () => {
      await view.result.current.saveTicket({
        ticket: attachmentTicket,
        attachmentChange: { action: 'replace', file: new File(['x'], 'same.png', { type: 'image/png' }) },
      });
    })).rejects.toThrow('new storagePath');

    expect(serviceMocks.persistTickets).not.toHaveBeenCalled();
    expect(serviceMocks.deleteTicketAttachment).toHaveBeenCalledWith({
      storage: view.deps.room.storage,
      storagePath: attachmentTicket.storagePath,
    });
  });

  it('ACTIONS-10 changes attachment to web-link and clears attachment metadata', async () => {
    const view = renderActions();

    await act(async () => {
      await view.result.current.saveTicket({
        ticket: { ...attachmentTicket, ticketType: 'web-link', url: 'https://tickets.example/web' },
        attachmentChange: { action: 'remove', file: null },
      });
    });

    expect(serviceMocks.persistTickets.mock.calls[0][0].tickets[0]).toMatchObject({
      ticketType: 'web-link',
      url: 'https://tickets.example/web',
      storagePath: '',
      attachmentKind: '',
    });
  });

  it('ACTIONS-11 changes attachment to external-app and removes the old URL', async () => {
    const view = renderActions();

    await act(async () => {
      await view.result.current.saveTicket({
        ticket: {
          ...attachmentTicket,
          ticketType: 'external-app',
          appName: 'Rail App',
          appUrl: '',
        },
        attachmentChange: { action: 'remove', file: null },
      });
    });

    expect(serviceMocks.persistTickets.mock.calls[0][0].tickets[0]).toMatchObject({
      ticketType: 'external-app', appName: 'Rail App', url: '', storagePath: '',
    });
  });

  it('ACTIONS-12 changes non-attachment to attachment with a replacement upload', async () => {
    const view = renderActions();

    await act(async () => {
      await view.result.current.saveTicket({
        ticket: { ...webTicket, ticketType: 'attachment', attachmentKind: 'image', url: '' },
        attachmentChange: { action: 'replace', file: new File(['x'], 'new.png', { type: 'image/png' }) },
      });
    });

    expect(serviceMocks.uploadTicketAttachment).toHaveBeenCalledTimes(1);
    expect(serviceMocks.persistTickets.mock.calls[0][0].tickets[1].ticketType).toBe('attachment');
  });

  it('ACTIONS-13 does not write Database when upload fails', async () => {
    serviceMocks.uploadTicketAttachment.mockRejectedValueOnce(new Error('upload failed'));
    const view = renderActions({ data: { tickets: [] } });

    await expect(act(async () => {
      await view.result.current.saveTicket({
        ticket: createAttachmentDraft(),
        attachmentChange: { action: 'replace', file: new File(['x'], 'new.png', { type: 'image/png' }) },
      });
    })).rejects.toThrow('upload failed');

    expect(serviceMocks.persistTickets).not.toHaveBeenCalled();
    expect(view.deps.feedback.toast.error).toHaveBeenCalledWith(expect.objectContaining({ title: '附件上傳失敗' }));
  });

  it('ACTIONS-14 rolls back the new attachment after Database failure', async () => {
    serviceMocks.persistTickets.mockRejectedValueOnce(new Error('database failed'));
    const view = renderActions();

    await expect(act(async () => {
      await view.result.current.saveTicket({
        ticket: attachmentTicket,
        attachmentChange: { action: 'replace', file: new File(['x'], 'new.png', { type: 'image/png' }) },
      });
    })).rejects.toThrow('database failed');

    expect(serviceMocks.deleteTicketAttachment).toHaveBeenCalledTimes(1);
    expect(serviceMocks.deleteTicketAttachment).toHaveBeenCalledWith(expect.objectContaining({
      storagePath: 'rooms/room-1/tickets/new/revision_new.png',
    }));
  });

  it('ACTIONS-15 preserves the old attachment after Database failure', async () => {
    serviceMocks.persistTickets.mockRejectedValueOnce(new Error('database failed'));
    const view = renderActions();

    await expect(act(async () => {
      await view.result.current.saveTicket({
        ticket: attachmentTicket,
        attachmentChange: { action: 'replace', file: new File(['x'], 'new.png', { type: 'image/png' }) },
      });
    })).rejects.toThrow('database failed');

    expect(serviceMocks.deleteTicketAttachment).not.toHaveBeenCalledWith(expect.objectContaining({
      storagePath: attachmentTicket.storagePath,
    }));
  });

  it('ACTIONS-16 deletes the old attachment only after Database succeeds', async () => {
    const view = renderActions();

    await act(async () => {
      await view.result.current.saveTicket({
        ticket: attachmentTicket,
        attachmentChange: { action: 'replace', file: new File(['x'], 'new.png', { type: 'image/png' }) },
      });
    });

    expect(serviceMocks.events).toEqual([
      'upload',
      'database',
      `delete:${attachmentTicket.storagePath}`,
    ]);
  });

  it('ACTIONS-17 treats old attachment cleanup failure as a successful save warning', async () => {
    serviceMocks.deleteTicketAttachment.mockRejectedValueOnce(new Error('cleanup failed'));
    const view = renderActions();

    let saved;
    await act(async () => {
      saved = await view.result.current.saveTicket({
        ticket: { ...attachmentTicket, ticketType: 'web-link', url: 'https://tickets.example/new' },
        attachmentChange: { action: 'remove', file: null },
      });
    });

    expect(saved.ticketType).toBe('web-link');
    expect(view.deps.state.setSyncStatus).toHaveBeenLastCalledWith('saved');
    expect(view.deps.feedback.toast.warning).toHaveBeenCalledWith({
      title: '票券已儲存',
      description: '舊附件暫時無法清除，稍後可再次整理儲存空間。',
    });
  });

  it('ACTIONS-18 persists a canonical record without File or temporary sensitive fields', async () => {
    const file = new File(['image'], 'new.png', { type: 'image/png' });
    const view = renderActions({ data: { tickets: [] } });

    await act(async () => {
      await view.result.current.saveTicket({
        ticket: {
          ...createAttachmentDraft(),
          pendingFile: file,
          password: 'secret',
          token: 'token',
          cookie: 'cookie',
          verificationCode: '123456',
          decodedDynamicQr: 'private',
        },
        attachmentChange: { action: 'replace', file },
      });
    });

    const record = serviceMocks.persistTickets.mock.calls[0][0].tickets[0];
    expect(record).not.toHaveProperty('pendingFile');
    expect(record).not.toHaveProperty('password');
    expect(record).not.toHaveProperty('token');
    expect(record).not.toHaveProperty('cookie');
    expect(record).not.toHaveProperty('verificationCode');
    expect(record).not.toHaveProperty('decodedDynamicQr');
    expect(Object.values(record).some((value) => value instanceof File)).toBe(false);
  });

  it('ACTIONS-19 blocks save and delete while a mutation ref is active', async () => {
    const mutationRef = { current: true };
    const view = renderActions({ refs: { ticketMutationRef: mutationRef } });

    await expect(view.result.current.saveTicket({
      ticket: webTicket,
      attachmentChange: { action: 'keep', file: null },
    })).rejects.toThrow('already in progress');
    await expect(view.result.current.deleteTicket('web-1')).resolves.toBe(false);
    expect(view.deps.feedback.confirm).not.toHaveBeenCalled();
    expect(serviceMocks.persistTickets).not.toHaveBeenCalled();
  });

  it('ACTIONS-20 updates raw local state only after save persistence succeeds', async () => {
    const view = renderActions({ data: { tickets: [] } });

    await act(async () => {
      await view.result.current.saveTicket({
        ticket: createWebDraft(), attachmentChange: { action: 'keep', file: null },
      });
    });

    expect(view.deps.state.setTicketsState).toHaveBeenCalledWith(
      serviceMocks.persistTickets.mock.calls[0][0].tickets,
    );
  });

  it('ACTIONS-21 leaves local state unchanged when save persistence fails', async () => {
    serviceMocks.persistTickets.mockRejectedValueOnce(new Error('database failed'));
    const view = renderActions();

    await expect(act(async () => {
      await view.result.current.saveTicket({
        ticket: webTicket,
        attachmentChange: { action: 'keep', file: null },
      });
    })).rejects.toThrow('database failed');

    expect(view.deps.state.setTicketsState).not.toHaveBeenCalled();
    expect(view.deps.state.setSyncStatus).toHaveBeenLastCalledWith('error');
  });

  it('ACTIONS-22 respects delete confirmation cancellation and exact copy', async () => {
    const confirm = vi.fn().mockResolvedValue(false);
    const view = renderActions({ feedback: { confirm } });

    await act(async () => {
      await view.result.current.deleteTicket('web-1');
    });

    expect(confirm).toHaveBeenCalledWith({
      title: '刪除這張票券？',
      description: '刪除後，這張票券會從所有旅伴的票券夾中移除。',
      cancelLabel: '保留票券',
      confirmLabel: '刪除票券',
      danger: true,
    });
    expect(serviceMocks.persistTickets).not.toHaveBeenCalled();
  });

  it('ACTIONS-23 deletes Database record before its Storage object', async () => {
    const view = renderActions();

    await act(async () => {
      await view.result.current.deleteTicket('attachment-1');
    });

    expect(serviceMocks.events).toEqual([
      'database',
      `delete:${attachmentTicket.storagePath}`,
    ]);
    expect(view.deps.state.setTicketsState).toHaveBeenCalledWith([webTicket]);
  });

  it('ACTIONS-24 does not clean Storage or local state when delete persistence fails', async () => {
    serviceMocks.persistTickets.mockRejectedValueOnce(new Error('database failed'));
    const view = renderActions();

    let deleted;
    await act(async () => {
      deleted = await view.result.current.deleteTicket('attachment-1');
    });

    expect(deleted).toBe(false);
    expect(serviceMocks.deleteTicketAttachment).not.toHaveBeenCalled();
    expect(view.deps.state.setTicketsState).not.toHaveBeenCalled();
    expect(view.deps.feedback.toast.error).toHaveBeenCalledWith(expect.objectContaining({ title: '無法刪除票券' }));
  });

  it('ACTIONS-25 keeps a deleted ticket removed when Storage cleanup fails', async () => {
    serviceMocks.deleteTicketAttachment.mockRejectedValueOnce(new Error('cleanup failed'));
    const view = renderActions();

    let deleted;
    await act(async () => {
      deleted = await view.result.current.deleteTicket('attachment-1');
    });

    expect(deleted).toBe(true);
    expect(view.deps.state.setTicketsState).toHaveBeenCalledWith([webTicket]);
    expect(view.deps.state.setSyncStatus).toHaveBeenLastCalledWith('saved');
    expect(view.deps.feedback.toast.warning).toHaveBeenCalledWith(expect.objectContaining({ title: '票券已刪除' }));
  });

  it('ACTIONS-26 treats object-not-found cleanup as delete success', async () => {
    serviceMocks.deleteTicketAttachment.mockResolvedValueOnce({ deleted: false, reason: 'not-found' });
    const view = renderActions();

    let deleted;
    await act(async () => {
      deleted = await view.result.current.deleteTicket('attachment-1');
    });

    expect(deleted).toBe(true);
    expect(view.deps.feedback.toast.success).toHaveBeenCalledWith(expect.objectContaining({ title: '票券已刪除' }));
    expect(view.deps.feedback.toast.warning).not.toHaveBeenCalled();
  });

  it('ACTIONS-27 transitions sync status saving to saved on save and delete', async () => {
    const saveView = renderActions({ data: { tickets: [] } });
    await act(async () => {
      await saveView.result.current.saveTicket({
        ticket: createWebDraft(), attachmentChange: { action: 'keep', file: null },
      });
    });
    expect(saveView.deps.state.setSyncStatus.mock.calls.map(([value]) => value))
      .toEqual(['saving', 'saved']);

    const deleteView = renderActions();
    await act(async () => {
      await deleteView.result.current.deleteTicket('web-1');
    });
    expect(deleteView.deps.state.setSyncStatus.mock.calls.map(([value]) => value))
      .toEqual(['saving', 'saved']);
  });

  it('ACTIONS-28 resets the tickets dirty flag after successful persistence', async () => {
    const view = renderActions({ data: { tickets: [] } });

    await act(async () => {
      await view.result.current.saveTicket({
        ticket: createWebDraft(), attachmentChange: { action: 'keep', file: null },
      });
    });

    expect(view.deps.refs.dirtyBranchesRef.current.tickets).toBe(false);
    expect(view.deps.refs.lastLocalWriteAtRef.current).toBe(1_000);
  });

  it('ACTIONS-29 closes the editor only after a successful Database save', async () => {
    const success = renderActions({ data: { tickets: [] } });
    await act(async () => {
      await success.result.current.saveTicket({
        ticket: createWebDraft(), attachmentChange: { action: 'keep', file: null },
      });
    });
    expect(success.deps.callbacks.closeTicketEditor).toHaveBeenCalledTimes(1);

    serviceMocks.persistTickets.mockRejectedValueOnce(new Error('database failed'));
    const failure = renderActions({ data: { tickets: [] } });
    await expect(act(async () => {
      await failure.result.current.saveTicket({
        ticket: createWebDraft(), attachmentChange: { action: 'keep', file: null },
      });
    })).rejects.toThrow('database failed');
    expect(failure.deps.callbacks.closeTicketEditor).not.toHaveBeenCalled();
  });

  it('ACTIONS-30 uses exact update and delete success Toast titles', async () => {
    const saveView = renderActions();
    await act(async () => {
      await saveView.result.current.saveTicket({
        ticket: webTicket, attachmentChange: { action: 'keep', file: null },
      });
    });
    expect(saveView.deps.feedback.toast.success).toHaveBeenCalledWith(expect.objectContaining({ title: '票券已更新' }));

    const deleteView = renderActions();
    await act(async () => {
      await deleteView.result.current.deleteTicket('web-1');
    });
    expect(deleteView.deps.feedback.toast.success).toHaveBeenCalledWith(expect.objectContaining({ title: '票券已刪除' }));
  });

  it('ACTIONS-31 exposes saving state and upload progress while attachment save is pending', async () => {
    let resolveUpload;
    serviceMocks.uploadTicketAttachment.mockImplementationOnce(({ onProgress }) => {
      onProgress(45);
      return new Promise((resolve) => {
        resolveUpload = resolve;
      });
    });
    const view = renderActions({ data: { tickets: [] } });
    let pendingSave;

    act(() => {
      pendingSave = view.result.current.saveTicket({
        ticket: createAttachmentDraft(),
        attachmentChange: { action: 'replace', file: new File(['x'], 'new.png', { type: 'image/png' }) },
      });
    });

    await waitFor(() => {
      expect(view.result.current.isSavingTicket).toBe(true);
      expect(view.result.current.uploadProgress).toBe(45);
    });

    await act(async () => {
      resolveUpload({
        url: 'https://storage.example/new.png',
        storagePath: 'rooms/room-1/tickets/new/revision_new.png',
        attachmentKind: 'image',
      });
      await pendingSave;
    });
    expect(view.result.current.isSavingTicket).toBe(false);
    expect(view.result.current.uploadProgress).toBeNull();
  });

  it('ACTIONS-32 prevents duplicate delete confirmation while the first confirm is pending', async () => {
    let resolveConfirm;
    const confirm = vi.fn(() => new Promise((resolve) => {
      resolveConfirm = resolve;
    }));
    const view = renderActions({ feedback: { confirm } });
    let firstDelete;

    act(() => {
      firstDelete = view.result.current.deleteTicket('web-1');
    });
    await act(async () => {
      await view.result.current.deleteTicket('web-1');
    });
    expect(confirm).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveConfirm(false);
      await firstDelete;
    });
  });

  it('ACTIONS-33 exposes deletingTicketId only while confirmed deletion is pending', async () => {
    let resolvePersist;
    serviceMocks.persistTickets.mockImplementationOnce(() => new Promise((resolve) => {
      resolvePersist = resolve;
    }));
    const view = renderActions();
    let pendingDelete;

    act(() => {
      pendingDelete = view.result.current.deleteTicket('web-1');
    });
    await waitFor(() => expect(view.result.current.deletingTicketId).toBe('web-1'));

    await act(async () => {
      resolvePersist();
      await pendingDelete;
    });
    expect(view.result.current.deletingTicketId).toBe('');
  });

  it('ACTIONS-34 rejects inconsistent keep/remove attachment payloads before writes', async () => {
    const createView = renderActions({ data: { tickets: [] } });
    await expect(createView.result.current.saveTicket({
      ticket: createAttachmentDraft(),
      attachmentChange: { action: 'keep', file: null },
    })).rejects.toThrow('cannot keep');

    const editView = renderActions();
    await expect(editView.result.current.saveTicket({
      ticket: attachmentTicket,
      attachmentChange: { action: 'remove', file: null },
    })).rejects.toThrow('non-attachment');
    expect(serviceMocks.persistTickets).not.toHaveBeenCalled();
  });
});
