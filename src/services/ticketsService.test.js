import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildTicketStoragePath,
  createTicketAttachmentRevision,
  deleteTicketAttachment,
  persistTickets,
  sanitizeTicketFileName,
  uploadTicketAttachment,
} from './ticketsService.js';

const firebaseMocks = vi.hoisted(() => ({
  dbRef: vi.fn((_db, path) => ({ path })),
  update: vi.fn(async () => undefined),
  storageRef: vi.fn((_storage, path) => ({ path })),
  uploadBytesResumable: vi.fn(),
  getDownloadURL: vi.fn(async () => 'https://storage.example/download'),
  deleteObject: vi.fn(async () => undefined),
  uploadTasks: [],
}));

vi.mock('firebase/database', () => ({
  ref: firebaseMocks.dbRef,
  update: firebaseMocks.update,
}));

vi.mock('firebase/storage', () => ({
  ref: firebaseMocks.storageRef,
  uploadBytesResumable: firebaseMocks.uploadBytesResumable,
  getDownloadURL: firebaseMocks.getDownloadURL,
  deleteObject: firebaseMocks.deleteObject,
}));

const createUploadTask = ({
  progress = [{ bytesTransferred: 5, totalBytes: 10 }],
  error = null,
  complete = true,
} = {}) => {
  const task = {
    snapshot: { ref: { path: 'uploaded-ref' } },
    cancel: vi.fn(() => true),
    on: vi.fn((_event, onProgress, onError, onComplete) => {
      queueMicrotask(() => {
        progress.forEach((snapshot) => onProgress(snapshot));
        if (error) onError(error);
        else if (complete) onComplete();
      });
    }),
  };
  firebaseMocks.uploadTasks.push(task);
  return task;
};

const upload = (overrides = {}) => uploadTicketAttachment({
  storage: { app: 'storage' },
  roomId: 'room-1',
  ticketId: 'ticket-1',
  file: new File(['image'], 'ticket.png', { type: 'image/png' }),
  ...overrides,
});

describe('ticketsService filename and storage paths', () => {
  beforeEach(() => {
    firebaseMocks.uploadTasks.length = 0;
    firebaseMocks.dbRef.mockClear();
    firebaseMocks.update.mockReset();
    firebaseMocks.update.mockResolvedValue(undefined);
    firebaseMocks.storageRef.mockClear();
    firebaseMocks.uploadBytesResumable.mockReset();
    firebaseMocks.uploadBytesResumable.mockImplementation(() => createUploadTask());
    firebaseMocks.getDownloadURL.mockReset();
    firebaseMocks.getDownloadURL.mockResolvedValue('https://storage.example/download');
    firebaseMocks.deleteObject.mockReset();
    firebaseMocks.deleteObject.mockResolvedValue(undefined);
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('revision-0001');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('SERVICE-01 sanitizes unsafe ticket filenames', () => {
    expect(sanitizeTicketFileName('  Boarding pass #1 (final).pdf  '))
      .toBe('Boarding_pass_1_final_.pdf');
  });

  it('SERVICE-02 uses a safe fallback for blank filenames', () => {
    expect(sanitizeTicketFileName('  ')).toBe('ticket');
  });

  it('SERVICE-03 creates different paths for different revisions', () => {
    const first = buildTicketStoragePath({
      roomId: 'room-1', ticketId: 'ticket-1', revision: 'revision-a', fileName: 'ticket.pdf',
    });
    const second = buildTicketStoragePath({
      roomId: 'room-1', ticketId: 'ticket-1', revision: 'revision-b', fileName: 'ticket.pdf',
    });

    expect(first).not.toBe(second);
  });

  it('SERVICE-04 preserves the room and ticket hierarchy in storage paths', () => {
    expect(buildTicketStoragePath({
      roomId: 'room-123', ticketId: 'ticket-456', revision: 'revision-a', fileName: 'pass.pdf',
    })).toBe('rooms/room-123/tickets/ticket-456/revision-a_pass.pdf');
  });

  it('SERVICE-05 prefers crypto.randomUUID for a safe revision', () => {
    expect(createTicketAttachmentRevision()).toBe('revision-0001');
    expect(globalThis.crypto.randomUUID).toHaveBeenCalled();
  });

  it('SERVICE-06 rejects unsafe path segments and revisions', () => {
    expect(() => buildTicketStoragePath({
      roomId: 'room/unsafe', ticketId: 'ticket', revision: 'revision', fileName: 'pass.pdf',
    })).toThrow('roomId is invalid');
    expect(() => buildTicketStoragePath({
      roomId: 'room', ticketId: 'ticket', revision: 'bad/revision', fileName: 'pass.pdf',
    })).toThrow('revision is invalid');
  });

  it('SERVICE-07 uploads a supported image and returns canonical attachment metadata', async () => {
    await expect(upload()).resolves.toEqual({
      url: 'https://storage.example/download',
      storagePath: 'rooms/room-1/tickets/ticket-1/revision-0001_ticket.png',
      attachmentKind: 'image',
      fileName: 'ticket.png',
      contentType: 'image/png',
      size: 5,
    });
  });

  it('SERVICE-08 uploads a PDF as attachmentKind pdf', async () => {
    const file = new File(['pdf'], 'boarding-pass.pdf', { type: 'application/pdf' });

    await expect(upload({ file })).resolves.toMatchObject({
      attachmentKind: 'pdf',
      contentType: 'application/pdf',
      fileName: 'boarding-pass.pdf',
    });
  });

  it('SERVICE-09 reports clamped upload progress from zero through completion', async () => {
    firebaseMocks.uploadBytesResumable.mockImplementationOnce(() => createUploadTask({
      progress: [
        { bytesTransferred: 5, totalBytes: 10 },
        { bytesTransferred: 15, totalBytes: 10 },
      ],
    }));
    const onProgress = vi.fn();

    await upload({ onProgress });

    expect(onProgress.mock.calls.map(([value]) => value)).toEqual([0, 50, 100, 100]);
  });

  it('SERVICE-10 sends content type and room/ticket custom metadata', async () => {
    const file = new File(['pdf'], 'pass.pdf', { type: 'application/pdf' });

    await upload({ file });

    expect(firebaseMocks.uploadBytesResumable).toHaveBeenCalledWith(
      { path: 'rooms/room-1/tickets/ticket-1/revision-0001_pass.pdf' },
      file,
      {
        contentType: 'application/pdf',
        customMetadata: { roomId: 'room-1', ticketId: 'ticket-1' },
      },
    );
  });

  it('SERVICE-11 resolves the download URL from the completed upload snapshot', async () => {
    await upload();

    expect(firebaseMocks.getDownloadURL).toHaveBeenCalledWith({ path: 'uploaded-ref' });
  });

  it('SERVICE-12 cancels and rejects an upload after the timeout', async () => {
    vi.useFakeTimers();
    firebaseMocks.uploadBytesResumable.mockImplementationOnce(() => createUploadTask({
      progress: [],
      complete: false,
    }));

    const promise = upload();
    const rejection = expect(promise).rejects.toMatchObject({ code: 'ticket/upload-timeout' });
    await vi.advanceTimersByTimeAsync(30_000);

    await rejection;
    expect(firebaseMocks.uploadTasks[0].cancel).toHaveBeenCalledTimes(1);
  });

  it('SERVICE-13 propagates Firebase upload errors', async () => {
    firebaseMocks.uploadBytesResumable.mockImplementationOnce(() => createUploadTask({
      error: new Error('upload failed'),
    }));

    await expect(upload()).rejects.toThrow('upload failed');
  });

  it('SERVICE-14 propagates download URL errors', async () => {
    firebaseMocks.getDownloadURL.mockRejectedValueOnce(new Error('download URL failed'));

    await expect(upload()).rejects.toThrow('download URL failed');
  });

  it.each([
    ['image/svg+xml', 'ticket.svg'],
    ['text/html', 'ticket.html'],
    ['application/javascript', 'ticket.js'],
    ['application/x-msdownload', 'ticket.exe'],
  ])('SERVICE-15 rejects unsupported MIME %s', async (type, name) => {
    await expect(upload({ file: new File(['unsafe'], name, { type }) }))
      .rejects.toThrow('MIME type is not allowed');
    expect(firebaseMocks.uploadBytesResumable).not.toHaveBeenCalled();
  });

  it('SERVICE-16 rejects files over the existing 10 MiB limit', async () => {
    const file = new File([new Uint8Array((10 * 1024 * 1024) + 1)], 'large.png', { type: 'image/png' });

    await expect(upload({ file })).rejects.toThrow('10 MiB');
    expect(firebaseMocks.uploadBytesResumable).not.toHaveBeenCalled();
  });

  it('SERVICE-17 validates Storage, roomId, ticketId, and file before upload', async () => {
    await expect(upload({ storage: null })).rejects.toThrow('Firebase Storage is required');
    await expect(upload({ roomId: '' })).rejects.toThrow('roomId is invalid');
    await expect(upload({ ticketId: 'bad/id' })).rejects.toThrow('ticketId is invalid');
    await expect(upload({ file: null })).rejects.toThrow('file is required');
    expect(firebaseMocks.uploadBytesResumable).not.toHaveBeenCalled();
  });

  it('SERVICE-18 accepts a recognized extension when MIME is empty', async () => {
    const file = new File(['pdf'], 'ticket.pdf', { type: '' });

    await expect(upload({ file })).resolves.toMatchObject({
      contentType: 'application/pdf',
      attachmentKind: 'pdf',
    });
  });

  it('SERVICE-19 deletes a ticket attachment successfully', async () => {
    await expect(deleteTicketAttachment({
      storage: { app: 'storage' },
      storagePath: 'rooms/room/tickets/ticket/revision_pass.pdf',
    })).resolves.toEqual({ deleted: true, reason: 'deleted' });
    expect(firebaseMocks.deleteObject).toHaveBeenCalledTimes(1);
  });

  it('SERVICE-20 treats storage/object-not-found as successful cleanup', async () => {
    firebaseMocks.deleteObject.mockRejectedValueOnce({ code: 'storage/object-not-found' });

    await expect(deleteTicketAttachment({
      storage: { app: 'storage' }, storagePath: 'rooms/room/tickets/ticket/missing.pdf',
    })).resolves.toEqual({ deleted: false, reason: 'not-found' });
  });

  it('SERVICE-21 propagates non-not-found delete errors', async () => {
    firebaseMocks.deleteObject.mockRejectedValueOnce(new Error('permission denied'));

    await expect(deleteTicketAttachment({
      storage: { app: 'storage' }, storagePath: 'rooms/room/tickets/ticket/pass.pdf',
    })).rejects.toThrow('permission denied');
  });

  it('SERVICE-22 returns a safe no-op for an empty storagePath before checking storage', async () => {
    await expect(deleteTicketAttachment({ storage: null, storagePath: '  ' }))
      .resolves.toEqual({ deleted: false, reason: 'empty-path' });
    expect(firebaseMocks.deleteObject).not.toHaveBeenCalled();
  });

  it('SERVICE-23 fails clearly when delete requires missing Storage', async () => {
    await expect(deleteTicketAttachment({ storage: null, storagePath: 'rooms/room/ticket.pdf' }))
      .rejects.toThrow('Firebase Storage is required');
  });

  it('SERVICE-24 writes tickets to the existing room path and payload', async () => {
    const db = { app: 'db' };
    const tickets = [{ id: 'ticket-1', title: 'Pass' }];

    await persistTickets({ db, roomId: 'room-123', tickets });

    expect(firebaseMocks.dbRef).toHaveBeenCalledWith(db, 'rooms/room-123');
    expect(firebaseMocks.update).toHaveBeenCalledWith(
      { path: 'rooms/room-123' },
      { tickets },
    );
  });

  it('SERVICE-25 propagates Database persistence failures', async () => {
    firebaseMocks.update.mockRejectedValueOnce(new Error('database failed'));

    await expect(persistTickets({ db: { app: 'db' }, roomId: 'room-1', tickets: [] }))
      .rejects.toThrow('database failed');
  });

  it('SERVICE-26 rejects File and undefined values before Database persistence', async () => {
    const file = new File(['image'], 'ticket.png', { type: 'image/png' });

    expect(() => persistTickets({
      db: { app: 'db' }, roomId: 'room-1', tickets: [{ id: 'ticket', file }],
    })).toThrow('File values');
    expect(() => persistTickets({
      db: { app: 'db' }, roomId: 'room-1', tickets: [{ id: 'ticket', pending: undefined }],
    })).toThrow('undefined');
    expect(firebaseMocks.update).not.toHaveBeenCalled();
  });

  it('SERVICE-27 validates Database, roomId, and tickets before creating a ref', () => {
    expect(() => persistTickets({ db: null, roomId: 'room', tickets: [] }))
      .toThrow('Firebase Database is required');
    expect(() => persistTickets({ db: { app: 'db' }, roomId: 'bad/room', tickets: [] }))
      .toThrow('roomId is invalid');
    expect(() => persistTickets({ db: { app: 'db' }, roomId: 'room', tickets: {} }))
      .toThrow('tickets must be an array');
    expect(firebaseMocks.dbRef).not.toHaveBeenCalled();
  });
});
