import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CloneMemoryDialog } from './CloneMemoryDialog.jsx';

const source = { roomId: 'source', title: '散步', startDate: '2025-01-01', endDate: '2025-01-02', destination: '台北', destLat: 25, destLng: 121 };
describe('clone retry', () => {
  it.each([
    [{ code: 'functions/failed-precondition', details: { reason: 'clone-attempt-not-published' } }, false],
    [{ code: 'functions/internal' }, true],
    [{ code: 'functions/failed-precondition' }, true],
  ])('changes attempt ID only when the server proves no trip was published (%j)', async (properties, sameId) => {
    const clone = vi.fn().mockRejectedValueOnce(Object.assign(new Error('請重試'), properties)).mockResolvedValue({});
    render(<CloneMemoryDialog memory={source} source={source} onClone={clone} onClose={vi.fn()} isOnline />);
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
