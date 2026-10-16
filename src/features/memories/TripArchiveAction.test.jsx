import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { TripCard } from '../../components/TripCard.jsx';

it('archives independently of opening or deleting the shared trip', () => {
  const archive = vi.fn(); const open = vi.fn(); const remove = vi.fn();
  render(<TripCard trip={{ roomId: 'a', title: '京都', role: 'owner', accessStatus: 'active' }} onArchive={archive} onOpen={open} onDelete={remove} archiveLabel="完成並收進回憶" />);
  fireEvent.click(screen.getByRole('button', { name: '完成並收進回憶' }));
  expect(archive).toHaveBeenCalledOnce(); expect(open).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled();
});
