import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CloneMemoryDialog } from './CloneMemoryDialog.jsx';

const source = { roomId: 'source', title: '散步', startDate: '2025-01-01', endDate: '2025-01-02', destination: '台北', destLat: 25, destLng: 121 };
describe('clone retry', () => {
  beforeEach(() => localStorage.clear());
  it.each([
    [{ code: 'functions/failed-precondition', details: { reason: 'clone-attempt-not-published' } }, false],
    [{ code: 'functions/internal' }, true],
    [{ code: 'functions/failed-precondition' }, true],
  ])('changes attempt ID only when the server proves no trip was published (%j)', async (properties, sameId) => {
    const clone = vi.fn().mockRejectedValueOnce(Object.assign(new Error('請重試'), properties)).mockResolvedValue({});
    render(<CloneMemoryDialog accountUid="alice" memory={source} source={source} onClone={clone} onClose={vi.fn()} isOnline />);
    fireEvent.change(screen.getByLabelText('新出發日期'), { target: { value: '2027-01-01' } });
    fireEvent.change(screen.getByLabelText('新回程日期'), { target: { value: '2027-01-02' } });
    fireEvent.click(screen.getByRole('button', { name: '建立新的旅行' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('請重試');
    expect(screen.getByLabelText('新出發日期')).toHaveValue('2027-01-01');
    fireEvent.click(screen.getByRole('button', { name: '建立新的旅行' }));
    await waitFor(() => expect(clone).toHaveBeenCalledTimes(2));
    expect(clone.mock.calls[0][0].roomId === clone.mock.calls[1][0].roomId).toBe(sameId);
  });
});


it('infers duration across month boundaries and offers opening the new trip', async () => {
  const clone = vi.fn().mockResolvedValue({});
  const open = vi.fn();
  render(<CloneMemoryDialog accountUid="alice" memory={source} source={source} onClone={clone} onClose={vi.fn()} onOpenTrip={open} isOnline />);
  fireEvent.change(screen.getByLabelText('新出發日期'), { target: { value: '2028-02-28' } });
  expect(screen.getByLabelText('新回程日期')).toHaveValue('2028-02-29');
  fireEvent.click(screen.getByRole('button', { name: '建立新的旅行' }));
  fireEvent.click(await screen.findByRole('button', { name: '開啟新的旅行' }));
  expect(open).toHaveBeenCalledWith(clone.mock.calls[0][0].roomId);
});
it('shows invalid duration before submission and prevents a short clone', () => {
  const clone = vi.fn();
  render(<CloneMemoryDialog accountUid="bob" memory={source} source={source} onClone={clone} onClose={vi.fn()} isOnline />);
  fireEvent.change(screen.getByLabelText('新出發日期'), { target: { value: '2027-01-01' } });
  fireEvent.change(screen.getByLabelText('新回程日期'), { target: { value: '2027-01-01' } });
  expect(screen.getByRole('alert')).toHaveTextContent('至少 2 天');
  expect(screen.getByRole('button', { name: '建立新的旅行' })).toBeDisabled();
});


it('restores a clone draft and attempt ID after network failure and remount, without account leakage', async () => {
  localStorage.clear();
  const clone = vi.fn().mockRejectedValue(new Error('連線中斷'));
  const props = { memory: source, source, onClone: clone, onClose: vi.fn(), isOnline: true };
  const first = render(<CloneMemoryDialog accountUid="alice" {...props} />);
  fireEvent.change(screen.getByLabelText('新旅程名稱'), { target: { value: 'Alice 再出發' } });
  fireEvent.change(screen.getByLabelText('新出發日期'), { target: { value: '2027-12-31' } });
  fireEvent.click(screen.getByRole('button', { name: '建立新的旅行' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('連線中斷');
  first.unmount();
  const second = render(<CloneMemoryDialog accountUid="alice" {...props} />);
  expect(screen.getByLabelText('新旅程名稱')).toHaveValue('Alice 再出發');
  expect(screen.getByLabelText('新回程日期')).toHaveValue('2028-01-01');
  fireEvent.click(screen.getByRole('button', { name: '建立新的旅行' }));
  await waitFor(() => expect(clone).toHaveBeenCalledTimes(2));
  expect(clone.mock.calls[1][0].roomId).toBe(clone.mock.calls[0][0].roomId);
  second.rerender(<CloneMemoryDialog accountUid="bob" {...props} />);
  expect(screen.getByLabelText('新旅程名稱')).toHaveValue('散步・再出發');
  expect(screen.getByLabelText('新出發日期')).toHaveValue('');
});
