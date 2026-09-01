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
  role: 'owner',
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
    await user.click(screen.getByRole('button', { name: '永久刪除旅程：京都五日行' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it.each([
    ['owner', '你是擁有者'],
    ['editor', '共同編輯'],
  ])('shows the signed-in trip role for %s access', (role, label) => {
    render(<TripCard trip={{ ...trip, role }} onOpen={vi.fn()} />);

    expect(screen.getByTestId('trip-role-badge')).toHaveTextContent(label);
    expect(screen.getByTestId('trip-card')).toHaveAttribute('data-access-role', role);
  });

  it('keeps permanent deletion owner-only and separates device hiding', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const onHide = vi.fn();
    const { rerender } = render(
      <TripCard trip={trip} onOpen={vi.fn()} onDelete={onDelete} onHide={onHide} />,
    );

    await user.click(screen.getByRole('button', { name: '永久刪除旅程：京都五日行' }));
    await user.click(screen.getByRole('button', { name: '從這台裝置隱藏旅程：京都五日行' }));
    expect(onDelete).toHaveBeenCalledOnce();
    expect(onHide).toHaveBeenCalledOnce();

    rerender(
      <TripCard
        trip={{ ...trip, role: 'editor' }}
        onOpen={vi.fn()}
        onDelete={onDelete}
        onHide={onHide}
      />,
    );
    expect(screen.queryByTestId('delete-trip-action')).not.toBeInTheDocument();
    expect(screen.getByTestId('hide-trip-action')).toBeInTheDocument();
  });

  it('keeps a deleting trip recoverable while disabling open and edit', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onHide = vi.fn();
    render(
      <TripCard
        trip={{ ...trip, accessStatus: 'deleting' }}
        onOpen={onOpen}
        onEdit={onEdit}
        onDelete={onDelete}
        onHide={onHide}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('正在清除雲端資料');
    expect(screen.queryByRole('button', { name: '開啟旅程：京都五日行' })).not.toBeInTheDocument();
    expect(screen.getByTestId('trip-card-title')).toHaveTextContent('京都五日行');
    expect(screen.queryByRole('button', { name: /編輯 京都五日行/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('hide-trip-action')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '繼續刪除旅程：京都五日行' }));
    expect(onDelete).toHaveBeenCalledOnce();
    expect(onOpen).not.toHaveBeenCalled();
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('allows only retry for a temporarily unavailable owner trip', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const onOpen = vi.fn();
    const onRetry = vi.fn();

    render(
      <TripCard
        trip={{ ...trip, role: 'owner', accessStatus: 'unavailable' }}
        onOpen={onOpen}
        onDelete={onDelete}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByTestId('trip-card')).toHaveAttribute('data-access-status', 'unavailable');
    expect(screen.getByText('旅程資料暫時無法載入，其他旅程仍可正常使用。')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `開啟旅程：${trip.title}` })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: `重新載入旅程：${trip.title}` }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: `永久刪除旅程：${trip.title}` })).not.toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
  });
});
