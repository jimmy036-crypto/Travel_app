import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LobbyNextTripSummary } from './LobbyNextTripSummary.jsx';

vi.mock('./LobbyRouteArc.jsx', () => ({
  LobbyRouteArc: ({ mode, journeyState }) => (
    <div
      data-testid="mock-lobby-route-arc"
      data-mode={mode}
      data-journey-state={journeyState}
      aria-hidden="true"
      className="pointer-events-none"
    />
  ),
}));

const UPCOMING_SUMMARY = {
  roomId: 'okinawa-trip',
  timing: 'upcoming',
  title: '沖繩六日自由行',
  destination: '日本沖繩縣',
  startDate: '2026-09-20',
  endDate: '2026-09-25',
  durationDays: 6,
  daysUntil: 26,
  currentDay: null,
};

describe('LobbyNextTripSummary', () => {
  it('renders useful upcoming-trip data with an accessible description', () => {
    render(<LobbyNextTripSummary summary={UPCOMING_SUMMARY} onOpen={() => {}} />);

    const action = screen.getByRole('button', {
      name: '開啟下一趟旅程：沖繩六日自由行',
    });
    expect(action).toHaveAttribute('data-state', 'upcoming');
    expect(action).toHaveAttribute('data-room-id', 'okinawa-trip');
    expect(screen.getByText('下一趟旅程')).toBeVisible();
    expect(screen.getByText('沖繩六日自由行')).toBeVisible();
    expect(screen.getByText('日本沖繩縣 · 9/20（日） · 26 天後')).toBeVisible();
    expect(screen.getByText('開啟行程')).toBeVisible();
    expect(screen.getByTestId('mock-lobby-route-arc')).toHaveAttribute(
      'data-journey-state',
      'upcoming',
    );
    expect(action).toHaveAccessibleDescription(
      '日本沖繩縣，2026/09/20 至 2026/09/25，共 6 天，26 天後。',
    );
  });

  it('opens the selected trip once when clicked', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<LobbyNextTripSummary summary={UPCOMING_SUMMARY} onOpen={onOpen} />);

    await user.click(screen.getByRole('button', { name: /開啟下一趟旅程/ }));

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('uses native keyboard activation for Enter and Space', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<LobbyNextTripSummary summary={UPCOMING_SUMMARY} onOpen={onOpen} />);
    const action = screen.getByRole('button', { name: /開啟下一趟旅程/ });

    await user.tab();
    expect(action).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');

    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it('shows an ongoing trip with progress instead of a future countdown', () => {
    render(
      <LobbyNextTripSummary
        summary={{
          ...UPCOMING_SUMMARY,
          timing: 'ongoing',
          startDate: '2026-08-24',
          endDate: '2026-08-28',
          durationDays: 5,
          daysUntil: 0,
          currentDay: 2,
        }}
        onOpen={() => {}}
      />,
    );

    expect(screen.getByRole('button', {
      name: '開啟目前旅程：沖繩六日自由行',
    })).toHaveAttribute('data-state', 'ongoing');
    expect(screen.getByText('旅途中')).toBeVisible();
    expect(screen.getByText('日本沖繩縣 · 第 2/5 天 · 8/28（五）返程')).toBeVisible();
    expect(screen.getByTestId('mock-lobby-route-arc')).toHaveAttribute(
      'data-journey-state',
      'ongoing',
    );
  });

  it('explains the summary benefit when the user has no trips', () => {
    render(<LobbyNextTripSummary summary={null} />);

    const summary = screen.getByTestId('lobby-next-trip-summary');
    expect(summary).toHaveAttribute('data-state', 'empty');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(summary).toHaveTextContent('下一趟旅程');
    expect(summary).toHaveTextContent('建立旅程後，這裡會顯示出發倒數與快速入口');
    expect(screen.getByTestId('mock-lobby-route-arc')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('mock-lobby-route-arc')).toHaveAttribute(
      'data-journey-state',
      'empty',
    );
  });

  it('distinguishes past trips from a completely empty Lobby', () => {
    render(<LobbyNextTripSummary summary={null} hasTrips />);

    const summary = screen.getByTestId('lobby-next-trip-summary');
    expect(summary).not.toHaveRole('button');
    expect(summary).toHaveTextContent('目前沒有即將出發的旅程');
    expect(summary).not.toHaveTextContent('建立旅程後');
  });

  it('keeps valid summary state when navigation is unavailable', () => {
    render(<LobbyNextTripSummary summary={UPCOMING_SUMMARY} />);

    const summary = screen.getByTestId('lobby-next-trip-summary');
    expect(summary).toHaveAttribute('data-state', 'upcoming');
    expect(summary).toHaveTextContent('沖繩六日自由行');
    expect(summary).toHaveTextContent('日本沖繩縣 · 9/20（日） · 26 天後');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('reflects the App-owned mode without changing the summary content', () => {
    const { rerender } = render(
      <LobbyNextTripSummary mode="light" summary={UPCOMING_SUMMARY} onOpen={() => {}} />,
    );
    expect(screen.getByTestId('lobby-next-trip-summary')).toHaveAttribute('data-mode', 'light');
    expect(screen.getByTestId('mock-lobby-route-arc')).toHaveAttribute('data-mode', 'light');

    rerender(
      <LobbyNextTripSummary mode="dark" summary={UPCOMING_SUMMARY} onOpen={() => {}} />,
    );
    expect(screen.getByTestId('lobby-next-trip-summary')).toHaveAttribute('data-mode', 'dark');
    expect(screen.getByTestId('mock-lobby-route-arc')).toHaveAttribute('data-mode', 'dark');
    expect(screen.getByRole('button')).toHaveTextContent('沖繩六日自由行');
  });
});
