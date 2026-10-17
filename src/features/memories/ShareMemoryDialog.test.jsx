import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShareMemoryDialog } from './ShareMemoryDialog.jsx';

const memories = { a: { title: '京都散步', startDate: '2025-01-01', destination: '京都', note: '私人的感想' } };
afterEach(() => vi.unstubAllGlobals());

describe('selected sharing fields', () => {
  it('excludes personal notes until selected and removes dates and cities independently', () => {
    render(<ShareMemoryDialog memories={memories} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('checkbox', { name: '京都散步' }));
    expect(screen.getByRole('checkbox', { name: '個人感想' })).not.toBeChecked();
    expect(screen.getByLabelText('分享內容預覽')).not.toHaveValue(expect.stringContaining('私人的感想'));
    fireEvent.click(screen.getByRole('checkbox', { name: '個人感想' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '旅行日期' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '目的地與城市' }));
    expect(screen.getByLabelText('分享內容預覽')).toHaveValue('京都散步\n私人的感想');
  });
  it('uses exactly the edited preview for native share and clipboard without links', async () => {
    const share = vi.fn().mockResolvedValue();
    const writeText = vi.fn().mockResolvedValue();
    vi.stubGlobal('navigator', { share, clipboard: { writeText } });
    render(<ShareMemoryDialog memories={memories} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('checkbox', { name: '京都散步' }));
    fireEvent.change(screen.getByLabelText('分享內容預覽'), { target: { value: '一起去散步' } });
    fireEvent.click(screen.getByRole('button', { name: '分享文字' }));
    await waitFor(() => expect(share).toHaveBeenCalledWith({ text: '一起去散步' }));
    fireEvent.click(screen.getByRole('button', { name: '複製選取的回憶' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('一起去散步'));
  });
});
