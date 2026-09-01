import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TripTabBar } from './TripTabBar.jsx';

const t = {
  isLight: true,
  headerBg: 'bg-white',
  cardBg: 'bg-white',
  cardBorder: 'border-slate-200',
  subText: 'text-slate-600',
};

describe('TripTabBar', () => {
  it('exposes all mobile destinations with an explicit current page', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { rerender } = render(<TripTabBar activeTab="map" layout="mobile" onSelect={onSelect} t={t} />);

    expect(screen.getByRole('navigation', { name: '旅程主要功能' })).toHaveStyle({
      paddingBottom: 'max(env(safe-area-inset-bottom), 0.5rem)',
    });
    const mapTab = screen.getByRole('button', { name: '地圖' });
    expect(mapTab).toHaveAttribute('aria-current', 'page');
    expect(mapTab).toHaveClass('bg-blue-600', 'text-white', 'shadow-sm');
    expect(mapTab.className).not.toContain('dark:');
    expect(screen.getAllByRole('button')).toHaveLength(4);
    await user.click(screen.getByRole('button', { name: '票券' }));
    expect(onSelect).toHaveBeenCalledWith('ticket');

    rerender(<TripTabBar activeTab="ticket" layout="mobile" onSelect={onSelect} t={t} />);
    const ticketTab = screen.getByRole('button', { name: '票券' });
    expect(screen.getAllByRole('button').filter((button) => button.getAttribute('aria-current') === 'page')).toHaveLength(1);
    expect(ticketTab).toHaveClass('bg-blue-600', 'text-white');
    expect(mapTab).not.toHaveAttribute('aria-current');
    expect(mapTab).toHaveClass('text-slate-600', 'hover:bg-slate-900/5');
  });

  it('keeps the desktop itinerary tab active while the map is visible', () => {
    render(<TripTabBar activeTab="map" layout="desktop" onSelect={vi.fn()} t={t} />);
    expect(screen.getByRole('button', { name: '行程' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: '行程' })).toHaveClass('bg-blue-600', 'text-white');
    expect(screen.getByTestId('ticket-tab-button')).toHaveAttribute('data-layout', 'desktop');
  });

  it('uses the app dark theme for inactive hover treatment without OS variants', () => {
    render(
      <TripTabBar
        activeTab="plan"
        layout="mobile"
        onSelect={vi.fn()}
        t={{ ...t, isLight: false, subText: 'text-slate-300' }}
      />,
    );

    const mapTab = screen.getByRole('button', { name: '地圖' });
    expect(mapTab).toHaveClass('text-slate-300', 'hover:bg-white/10');
    expect(mapTab.className).not.toContain('dark:');
  });
});
