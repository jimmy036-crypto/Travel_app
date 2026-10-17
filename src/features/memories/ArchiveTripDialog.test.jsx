import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ArchiveTripDialog } from './ArchiveTripDialog.jsx';
it('archives without requiring a story or claiming visited places', async () => {
  const archive = vi.fn().mockResolvedValue({}); const view = vi.fn();
  render(<ArchiveTripDialog trip={{ roomId: 'a', title: '七天散步' }} onArchive={archive} onView={view} onClose={() => {}} isOnline />);
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '收好這趟旅行' }));
  await waitFor(() => expect(archive).toHaveBeenCalledOnce());
  expect(screen.getByText('回憶已收好')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '查看回憶' }));
  expect(view).toHaveBeenCalledWith('a');
});
it('does not pretend photos are preserved when queuing fails', async () => {
  render(<ArchiveTripDialog trip={{ roomId: 'a', title: '旅行' }} onArchive={async () => ({ preservationError: '照片還沒開始保存，請重試。' })} onClose={() => {}} onView={() => {}} isOnline />);
  fireEvent.click(screen.getByRole('button', { name: '收好這趟旅行' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('照片還沒開始保存');
  expect(screen.queryByText('已永久保存')).not.toBeInTheDocument();
});
