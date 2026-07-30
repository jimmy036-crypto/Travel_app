import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MobileMapTopBar } from './MobileMapTopBar.jsx';

const t = {
  mainText: 'text-slate-950',
  subText: 'text-slate-600',
  cardBg: 'bg-white',
  cardBorder: 'border-slate-200',
  headerBg: 'bg-white/90',
};

describe('MobileMapTopBar', () => {
  it('renders back, a scrollable day switcher, and settings without trip summary chrome', () => {
    const onBack = vi.fn();
    const onSelectDay = vi.fn();
    render(
      <MobileMapTopBar
        days={['Day 1', 'Day 2']}
        currentDay="Day 1"
        startDate="2026-09-20"
        onSelectDay={onSelectDay}
        onBack={onBack}
        settingsNode={<button type="button" aria-label="開啟旅程工具與設定">設定</button>}
        syncStatusNode={<span data-testid="sync-status-indicator">已同步</span>}
        t={t}
      />,
    );

    expect(screen.queryByTestId('mobile-trip-summary')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mobile-trip-weather')).not.toBeInTheDocument();
    expect(screen.getByTestId('mobile-day-switcher')).toBeInTheDocument();
    expect(screen.getAllByTestId('itinerary-day-switch-button')).toHaveLength(2);
    expect(screen.getByTestId('sync-status-indicator')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('back-to-lobby'));
    expect(onBack).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getAllByTestId('itinerary-day-switch-button')[1]);
    expect(onSelectDay).toHaveBeenCalledWith('Day 2', expect.anything());

    expect(screen.getByRole('button', { name: '開啟旅程工具與設定' })).toBeInTheDocument();
  });
});
