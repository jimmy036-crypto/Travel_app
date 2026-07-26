import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TripCard } from './TripCard.jsx';

const trip = {
  roomId: 'room-1',
  title: '京都五日行',
  destination: '京都',
  startDate: '2026-10-01',
  endDate: '2026-10-05',
  transport: '電車',
  members: ['小明', '小美'],
};

describe('TripCard', () => {
  it('renders the common trip metadata and opens from the card', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<TripCard trip={trip} onOpen={onOpen} />);

    expect(screen.getByTestId('trip-card')).toHaveAttribute('data-room-id', 'room-1');
    expect(screen.getByTestId('trip-card')).toHaveTextContent('京都五日行');
    expect(screen.getByTestId('trip-card')).toHaveTextContent('小明, 小美');
    await user.click(screen.getByTestId('trip-card-title'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('keeps card actions from opening the trip', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(
      <TripCard
        trip={trip}
        onOpen={onOpen}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    await user.click(screen.getByRole('button', { name: /編輯/ }));
    await user.click(screen.getByRole('button', { name: '刪除' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });
});
