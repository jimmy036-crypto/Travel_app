import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TripTabBar } from './TripTabBar.jsx';

const t = {
  headerBg: 'bg-white',
  cardBg: 'bg-white',
  cardBorder: 'border-slate-200',
  subText: 'text-slate-600',
};

describe('TripTabBar', () => {
  it('exposes all mobile destinations with an explicit current page', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<TripTabBar activeTab="map" layout="mobile" onSelect={onSelect} t={t} />);

    expect(screen.getByRole('navigation', { name: '旅程主要功能' })).toHaveStyle({
      paddingBottom: 'max(env(safe-area-inset-bottom), 0.5rem)',
    });
    expect(screen.getByRole('button', { name: '地圖' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getAllByRole('button')).toHaveLength(4);
    await user.click(screen.getByRole('button', { name: '票券' }));
    expect(onSelect).toHaveBeenCalledWith('ticket');
  });

  it('keeps the desktop itinerary tab active while the map is visible', () => {
    render(<TripTabBar activeTab="map" layout="desktop" onSelect={vi.fn()} t={t} />);
    expect(screen.getByRole('button', { name: '行程' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('ticket-tab-button')).toHaveAttribute('data-layout', 'desktop');
  });
});
