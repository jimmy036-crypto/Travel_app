import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getBlob: vi.fn() }));
vi.mock('../../firebase.js', () => ({ storage: {} }));
vi.mock('firebase/storage', () => ({ ref: (_, path) => path, getBlob: mocks.getBlob }));
import { MemoryPhotos } from './MemoryPhotos.jsx';
const photo = { storagePath: 'travelMemories/alice/trip/op/photo', name: '河邊', contentType: 'image/jpeg' };
describe('independent private photo reading', () => {
  beforeEach(() => { mocks.getBlob.mockResolvedValue(new Blob(['image'])); URL.createObjectURL = vi.fn(() => 'blob:private'); URL.revokeObjectURL = vi.fn(); });
  it('uses authenticated bounded reads and opens a full photo', async () => {
    render(<MemoryPhotos accountUid="alice" roomId="trip" photos={{ p: photo }} />);
    expect(await screen.findByRole('img', { name: '河邊' })).toHaveAttribute('src', 'blob:private');
    expect(mocks.getBlob).toHaveBeenCalledWith(photo.storagePath, 5 * 1024 * 1024);
    fireEvent.click(screen.getByRole('button', { name: '放大照片：河邊' }));
    expect(screen.getByRole('dialog', { name: '河邊' })).toBeVisible();
  });
  it('removes private previews immediately on account switch and ignores late reads', async () => {
    let done; mocks.getBlob.mockReturnValue(new Promise((resolve) => { done = resolve; }));
    const { rerender } = render(<MemoryPhotos accountUid="alice" roomId="trip" photos={{ p: photo }} />);
    rerender(<MemoryPhotos accountUid="bob" roomId="trip" photos={{ p: photo }} />);
    await act(async () => done(new Blob(['image'])));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(mocks.getBlob).toHaveBeenCalledTimes(1);
  });
  it('clears a denied read and offers retry without source fallback', async () => {
    mocks.getBlob.mockRejectedValue(new Error('denied'));
    render(<MemoryPhotos accountUid="alice" roomId="trip" photos={{ p: photo }} />);
    expect(await screen.findByText(/照片暫時無法載入/)).toBeVisible();
    mocks.getBlob.mockResolvedValue(new Blob(['image']));
    fireEvent.click(screen.getByRole('button', { name: '重新載入照片' }));
    await waitFor(() => expect(screen.getByRole('img')).toBeVisible());
  });
});

it('waits until a cover approaches the viewport before downloading its private blob', async () => {
  let observe;
  vi.stubGlobal('IntersectionObserver', class { constructor(callback) { observe = callback; } observe() {} disconnect() {} });
  render(<MemoryPhotos accountUid="alice" roomId="trip" photos={{ p: photo }} cover />);
  expect(mocks.getBlob).not.toHaveBeenCalled();
  await act(async () => observe([{ isIntersecting: true }]));
  expect(await screen.findByRole('img', { name: '河邊' })).toBeVisible();
  vi.unstubAllGlobals();
});
it('loads additional photos without downloading completed thumbnails again', async () => {
  const photos = Object.fromEntries(Array.from({ length: 13 }, (_, index) => [index, { ...photo, storagePath: `${photo.storagePath}-${index}`, name: `照片 ${index}` }]));
  render(<MemoryPhotos accountUid="alice" roomId="trip" photos={photos} />);
  await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(12));
  fireEvent.click(screen.getByRole('button', { name: '載入更多照片' }));
  await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(13));
  expect(mocks.getBlob).toHaveBeenCalledTimes(13);
});
