import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
vi.mock('./MemoryPhotos.jsx', () => ({ MemoryPhotos: () => <div>個人保存照片</div> }));
import { MemoryDetail } from './MemoryDetail.jsx';
const memory = { roomId: 'a', title: '京都散步', startDate: '2025-01-01', note: '河邊的光', visits: {} };
it('reads preserved itinerary without source access and never infers visits', () => {
  const edit = vi.fn();
  render(<MemoryDetail accountUid="alice" memory={memory} archive={{ summary: { state: 'complete' }, itinerary: { 'Day 1': [{ id: 'p', name: '美術館' }] }, photos: {} }} onEdit={edit} onClose={() => {}} onClone={() => {}} isOnline />);
  expect(screen.getByText('美術館')).toBeVisible();
  expect(screen.getByText('尚未確認到訪')).toBeVisible();
  expect(screen.getByRole('button', { name: '開啟原行程' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '複製成新旅程' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: '補充回憶與到訪' }));
  expect(edit).toHaveBeenCalledWith('a');
});
it('offers retry for incomplete photos rather than claiming preservation', () => {
  const preserve = vi.fn();
  render(<MemoryDetail accountUid="alice" memory={memory} archive={{ summary: { state: 'partial', saved: 4, total: 12, error: '來源照片已不存在' }, itinerary: {}, photos: {} }} onPreserve={preserve} onClose={() => {}} isOnline canReadSource />);
  expect(screen.getByText(/4\/12/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '重試未完成照片' }));
  expect(preserve).toHaveBeenCalledOnce();
});

it('reads original planning text and permits snapshot cloning when one photo is missing', () => {
  render(<MemoryDetail accountUid="alice" memory={memory} archive={{ summary: { state: 'partial', operationId: 'op', saved: 1, total: 2 }, itinerary: { 'Day 1': [{ id: 'p', name: '美術館', time: '09:00', memo: '提前預約展覽', address: '京都河邊 8 號' }, { id: 'train', name: '搭車前往大阪', type: 'transit', notes: '搭乘第二節車廂' }] }, photos: {} }} onClose={() => {}} isOnline />);
  expect(screen.getByText('提前預約展覽')).toBeVisible();
  expect(screen.getByText('京都河邊 8 號')).toBeVisible();
  expect(screen.getByText('搭車前往大阪')).toBeVisible();
  expect(screen.getByText('搭乘第二節車廂')).toBeVisible();
  expect(screen.getByRole('button', { name: '複製成新旅程' })).toBeEnabled();
});
