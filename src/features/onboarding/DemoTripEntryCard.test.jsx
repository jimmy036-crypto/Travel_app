import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DemoTripEntryCard } from './DemoTripEntryCard.jsx';

const trip = {
  roomId: 'local-example-trip',
  title: '東京三日自由行（範例）',
  destination: '東京',
  startDate: '2026-09-20',
  endDate: '2026-09-22',
  transport: '大眾運輸',
  members: ['自己'],
};

describe('DemoTripEntryCard', () => {
  it('uses the shared trip-card structure and title-only marker', () => {
    render(<DemoTripEntryCard trip={trip} onOpenDemo={vi.fn()} />);

    expect(screen.getByTestId('demo-trip-entry-card')).toContainElement(
      screen.getByTestId('trip-card'),
    );
    expect(screen.getByTestId('example-trip-card-title')).toHaveTextContent('東京三日自由行（範例）');
    expect(screen.queryByText('示範模式')).not.toBeInTheDocument();
    expect(screen.queryByText('僅供預覽')).not.toBeInTheDocument();
  });

  it('opens the same trip card and exposes reset without triggering open', async () => {
    const user = userEvent.setup();
    const onOpenDemo = vi.fn();
    const onReset = vi.fn();
    render(<DemoTripEntryCard trip={trip} onOpenDemo={onOpenDemo} onReset={onReset} />);

    await user.click(screen.getByTestId('example-trip-card-title'));
    expect(onOpenDemo).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: '恢復原始內容' }));
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onOpenDemo).toHaveBeenCalledTimes(1);
  });
});
