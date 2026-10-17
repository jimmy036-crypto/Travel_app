import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryPhotos } from './MemoryPhotos.jsx';
import { useMemoryArchive } from './useMemoryArchive.js';

const mocks = vi.hoisted(() => ({ listeners: [], read: vi.fn() }));
vi.mock('../../firebase.js', () => ({ db: {}, storage: {} }));
vi.mock('firebase/database', () => ({ ref: (_, path) => path, onValue: (path, success, error) => { const stop = vi.fn(); mocks.listeners.push({ path, success, error, stop }); return stop; } }));
vi.mock('firebase/storage', () => ({ ref: (_, path) => path, getBlob: mocks.read }));
function Photos({ uid }) { const archive = useMemoryArchive(uid, 'a'); return <><MemoryPhotos photos={archive.photos} accountUid={uid} roomId="a" />{archive.error ? <p role="alert">{archive.error}</p> : null}</>; }
const photo = { storagePath: 'travelMemories/alice/a/op/p', name: '雪景', contentType: 'image/jpeg' };
describe('protected permanent memory photos', () => {
  beforeEach(() => { mocks.listeners.length = 0; mocks.read.mockResolvedValue(new Blob(['photo'])); URL.createObjectURL = vi.fn(() => 'blob:photo'); URL.revokeObjectURL = vi.fn(); });
  it('reads authenticated personal photos and removes them immediately when the account changes', async () => {
    const { rerender } = render(<Photos uid="alice" />);
    await act(async () => mocks.listeners.find((entry) => entry.path.endsWith('/photos')).success({ val: () => ({ p: photo }) }));
    expect(screen.getByRole('img', { name: '雪景' })).toHaveAttribute('src', 'blob:photo');
    expect(mocks.listeners.every((entry) => entry.path.startsWith('travelMemoryArchives/alice/a/'))).toBe(true);
    rerender(<Photos uid="bob" />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:photo');
  });
  it('clears previews when the archive realtime listener loses permission', async () => {
    render(<Photos uid="alice" />);
    const listener = mocks.listeners.find((entry) => entry.path.endsWith('/photos'));
    await act(async () => listener.success({ val: () => ({ p: photo }) }));
    expect(screen.getByRole('img')).toBeInTheDocument();
    act(() => listener.error(new Error('permission-denied')));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('這份回憶暫時無法讀取，請重試。');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:photo');
  });
});
