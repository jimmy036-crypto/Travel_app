import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SourcePhotos } from './SourcePhotos.jsx';

const mocks = vi.hoisted(() => ({ snapshot: null, error: null, read: vi.fn(), dispose: vi.fn() }));
vi.mock('../../firebase.js', () => ({ db: {}, storage: {} }));
vi.mock('../trip-data/firebaseTripRepository.js', () => ({ createFirebaseTripRepository: () => ({
  subscribeTrip: (snapshot, error) => { mocks.snapshot = snapshot; mocks.error = error; return vi.fn(); },
  readAttachment: mocks.read, dispose: mocks.dispose,
}) }));

describe('protected memory photos', () => {
  it('reads authenticated photos and removes them immediately when source access is revoked', async () => {
    mocks.read.mockResolvedValue('blob:photo');
    const { rerender } = render(<SourcePhotos roomId="a" canReadSource />);
    await act(async () => mocks.snapshot({ itinerary: { 'Day 1': [{ id: 'p1', name: '雪景', placePhoto: { storagePath: 'trips/a/places/p1/photo.jpg', contentType: 'image/jpeg' } }] } }));
    expect(screen.getByRole('img', { name: '雪景' })).toHaveAttribute('src', 'blob:photo');
    rerender(<SourcePhotos roomId="a" canReadSource={false} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(mocks.dispose).toHaveBeenCalled();
  });
  it('clears previews when the realtime listener loses permission', async () => {
    render(<SourcePhotos roomId="b" canReadSource />);
    await act(async () => mocks.snapshot({ itinerary: { 'Day 1': [{ id: 'p2', name: '咖啡', placePhoto: { storagePath: 'trips/b/places/p2/photo.jpg', contentType: 'image/jpeg' } }] } }));
    expect(screen.getByRole('img')).toBeInTheDocument();
    act(() => mocks.error(new Error('permission-denied')));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('照片目前無法載入，可開啟原行程重試。')).toBeInTheDocument();
  });
});
