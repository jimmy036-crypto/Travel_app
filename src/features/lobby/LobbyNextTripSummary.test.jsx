import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LobbyNextTripSummary } from './LobbyNextTripSummary.jsx';

const UPCOMING_SUMMARY = {
  roomId: 'okinawa-trip', timing: 'upcoming', title: '沖繩六日自由行',
  destination: '日本沖繩縣', startDate: '2026-09-20', endDate: '2026-09-25',
  durationDays: 6, daysUntil: 26, currentDay: null,
};

function ongoingSummary(currentDay = 2, durationDays = 5) {
  return { ...UPCOMING_SUMMARY, timing: 'ongoing', startDate: '2026-08-24',
    endDate: '2026-08-28', durationDays, daysUntil: 0, currentDay };
}

describe('LobbyNextTripSummary', () => {
  it('renders the next trip as a meaningful boarding pass', () => {
    render(<LobbyNextTripSummary summary={UPCOMING_SUMMARY} onOpen={() => {}} />);
    const action = screen.getByRole('button', { name: '開啟下一趟旅程：沖繩六日自由行' });
    const visual = screen.getByTestId('lobby-next-trip-summary-visual');
    expect(action).toHaveAttribute('data-room-id', 'okinawa-trip');
    expect(screen.getByText('9/20（日） · 26 天後')).toBeVisible();
    expect(visual).toHaveAttribute('data-variant', 'boarding');
    expect(visual).toHaveAttribute('aria-hidden', 'true');
    expect(visual).toHaveClass('pointer-events-none');
    expect(within(visual).getByText('日本沖繩縣')).toBeVisible();
    expect(within(visual).getByText('9/20 → 9/25')).toBeVisible();
    expect(within(visual).getByText('6 天')).toBeVisible();
    expect(within(visual).getByText('26')).toBeVisible();
    expect(action).toHaveAccessibleDescription(
      '日本沖繩縣，2026/09/20 至 2026/09/25，共 6 天，26 天後。',
    );
  });

  it('keeps trip copy and the status visual in separate layout regions', () => {
    render(<LobbyNextTripSummary summary={UPCOMING_SUMMARY} onOpen={() => {}} />);
    const info = screen.getByTestId('lobby-next-trip-summary-info');
    const region = screen.getByTestId('lobby-next-trip-summary-visual-region');
    const visual = screen.getByTestId('lobby-next-trip-summary-visual');
    expect(info).not.toContainElement(visual);
    expect(region).toContainElement(visual);
    expect(region).toHaveAttribute('aria-hidden', 'true');
  });

  it('uses the boarding pass with a clear departure state on trip day one', () => {
    render(<LobbyNextTripSummary summary={ongoingSummary(1)} onOpen={() => {}} />);
    const visual = screen.getByTestId('lobby-next-trip-summary-visual');
    expect(visual).toHaveAttribute('data-variant', 'boarding');
    expect(within(visual).getByText('今天')).toBeVisible();
    expect(within(visual).getByText('出發')).toBeVisible();
  });

  it('switches to journey day nodes from trip day two onward', () => {
    render(<LobbyNextTripSummary summary={ongoingSummary(2)} onOpen={() => {}} />);
    const visual = screen.getByTestId('lobby-next-trip-summary-visual');
    expect(screen.getByRole('button', { name: '開啟目前旅程：沖繩六日自由行' })).toBeVisible();
    expect(screen.getByText('第 2/5 天 · 8/28（五）返程')).toBeVisible();
    expect(visual).toHaveAttribute('data-variant', 'journey');
    expect(within(visual).getByText('第 2/5 天')).toBeVisible();
    expect(within(visual).getByText('今天')).toBeVisible();
    expect(within(visual).getByText('D1')).toBeVisible();
    expect(within(visual).getByText('D5')).toBeVisible();
  });

  it('compresses long journeys while preserving the current and final day', () => {
    render(<LobbyNextTripSummary summary={ongoingSummary(8, 14)} onOpen={() => {}} />);
    const journey = screen.getByTestId('lobby-trip-status-journey');
    expect(within(journey).getAllByText(/^D\d+$/).length).toBeLessThanOrEqual(6);
    expect(within(journey).getByText('今天')).toBeVisible();
    expect(within(journey).getByText('D14')).toBeVisible();
  });

  it('opens the selected trip and supports native keyboard activation', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<LobbyNextTripSummary summary={UPCOMING_SUMMARY} onOpen={onOpen} />);
    const action = screen.getByRole('button', { name: /開啟下一趟旅程/ });
    await user.click(action);
    action.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onOpen).toHaveBeenCalledTimes(3);
  });

  it('renders a quiet static empty state when no trip is available', () => {
    render(<LobbyNextTripSummary summary={null} />);
    const summary = screen.getByTestId('lobby-next-trip-summary');
    const visual = screen.getByTestId('lobby-next-trip-summary-visual');
    expect(summary).not.toHaveRole('button');
    expect(summary).toHaveTextContent('建立旅程後，這裡會顯示出發倒數與快速入口');
    expect(visual).toHaveAttribute('data-variant', 'empty');
  });

  it('distinguishes past trips from a completely empty Lobby', () => {
    render(<LobbyNextTripSummary summary={null} hasTrips />);
    const summary = screen.getByTestId('lobby-next-trip-summary');
    expect(summary).toHaveTextContent('目前沒有即將出發的旅程');
    expect(summary).not.toHaveTextContent('建立旅程後，這裡會顯示出發倒數與快速入口');
  });

  it('keeps valid summary content when navigation is unavailable', () => {
    render(<LobbyNextTripSummary summary={UPCOMING_SUMMARY} />);
    expect(screen.getByTestId('lobby-next-trip-summary')).toHaveAttribute('data-state', 'upcoming');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('reflects the App-owned light and dark modes in the status visual', () => {
    const { rerender } = render(<LobbyNextTripSummary mode="light" summary={UPCOMING_SUMMARY} onOpen={() => {}} />);
    expect(screen.getByTestId('lobby-next-trip-summary-visual')).toHaveAttribute('data-mode', 'light');
    rerender(<LobbyNextTripSummary mode="dark" summary={UPCOMING_SUMMARY} onOpen={() => {}} />);
    expect(screen.getByTestId('lobby-next-trip-summary-visual')).toHaveAttribute('data-mode', 'dark');
  });

  it('does not initialize a continuous animation loop', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    render(<LobbyNextTripSummary summary={UPCOMING_SUMMARY} onOpen={() => {}} />);
    expect(raf).not.toHaveBeenCalled();
    raf.mockRestore();
  });
});
