import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DesktopDayNavigator } from './DesktopDayNavigator.jsx';

const theme = {
  headerBg: 'bg-white',
  cardBg: 'bg-white',
  cardBorder: 'border-slate-200',
  mainText: 'text-slate-950',
};

describe('DesktopDayNavigator', () => {
  it('supports direct, previous, and next navigation with accessible boundaries', () => {
    Element.prototype.scrollIntoView = vi.fn();
    const onSelectDay = vi.fn();
    const days = ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6'];
    const { rerender } = render(
      <DesktopDayNavigator
        days={days}
        currentDay="Day 1"
        startDate="2026-09-01"
        onSelectDay={onSelectDay}
        t={theme}
      />,
    );

    expect(screen.getByTestId('desktop-day-previous')).toBeDisabled();
    fireEvent.click(screen.getAllByTestId('desktop-day-button')[5]);
    expect(onSelectDay).toHaveBeenCalledWith('Day 6', expect.anything());
    fireEvent.click(screen.getByTestId('desktop-day-next'));
    expect(onSelectDay).toHaveBeenCalledWith('Day 2', expect.anything());

    rerender(
      <DesktopDayNavigator
        days={days}
        currentDay="Day 6"
        startDate="2026-09-01"
        onSelectDay={onSelectDay}
        t={theme}
      />,
    );
    expect(screen.getByTestId('desktop-day-next')).toBeDisabled();
    fireEvent.click(screen.getByTestId('desktop-day-previous'));
    expect(onSelectDay).toHaveBeenCalledWith('Day 5', expect.anything());
    expect(screen.getAllByTestId('desktop-day-button')[5]).toHaveAttribute('aria-current', 'date');
  });
});
