import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MobileCompactUtilityBar } from './MobileCompactUtilityBar.jsx';

const t = {
  mainText: 'text-slate-950',
  subText: 'text-slate-600',
  cardBg: 'bg-white',
  cardBorder: 'border-slate-200',
  headerBg: 'bg-white/90',
};

describe('MobileCompactUtilityBar', () => {
  it('renders only back and settings without trip summary or day switcher chrome', () => {
    const onBack = vi.fn();
    render(
      <MobileCompactUtilityBar
        onBack={onBack}
        settingsNode={<button type="button" aria-label="開啟旅程工具與設定">設定</button>}
        syncStatusNode={<span data-testid="sync-status-indicator">已同步</span>}
        t={t}
      />,
    );

    expect(screen.queryByTestId('mobile-trip-summary')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mobile-day-switcher')).not.toBeInTheDocument();
    expect(screen.getByTestId('back-to-lobby')).toBeInTheDocument();
    expect(screen.getByTestId('sync-status-indicator')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '開啟旅程工具與設定' })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('back-to-lobby'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
