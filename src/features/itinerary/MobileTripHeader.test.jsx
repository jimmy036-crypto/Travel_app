import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MobileTripHeader } from './MobileTripHeader.jsx';

const t = {
  mainText: 'text-slate-950',
  subText: 'text-slate-600',
  cardBg: 'bg-white',
  cardBorder: 'border-slate-200',
  headerBg: 'bg-white/90',
};

function renderHeader(overrides = {}) {
  return render(
    <MobileTripHeader
      meta={{
        title: '沖繩親子旅行',
        startDate: '2026-09-20',
        destination: '沖繩',
      }}
      dayId="Day 1"
      weather={{ temp: '24~28°C', rain: 35 }}
      t={t}
      syncStatusNode={<span>已同步</span>}
      settingsNode={(
        <button type="button" aria-label="開啟旅程工具與設定">
          設定
        </button>
      )}
      onBack={vi.fn()}
      {...overrides}
    />,
  );
}

describe('MobileTripHeader', () => {
  it('separates utility controls, trip metadata, and right-side weather', () => {
    renderHeader();

    const summary = screen.getByTestId('mobile-trip-summary');
    expect(summary.style.gridTemplateColumns).toContain('minmax(0, 1fr)');
    expect(screen.getByTestId('mobile-trip-metadata')).toHaveTextContent('9/20');
    expect(screen.getByTestId('mobile-trip-metadata')).toHaveTextContent('沖繩');
    expect(screen.getByTestId('mobile-trip-metadata')).not.toHaveTextContent('24~28°C');
    expect(screen.getByTestId('mobile-trip-weather-temperature')).toHaveTextContent('24~28°C');
    expect(screen.getByTestId('mobile-trip-weather-rain')).toHaveTextContent('降雨 35%');
    expect(screen.getByTestId('mobile-trip-sync-status')).toHaveTextContent('已同步');
  });

  it('keeps a long title readable without restoring the removed tools menu', () => {
    renderHeader({
      meta: {
        title: 'OkinawaChuraumiAquariumOceanExpoParkSouvenirShop',
        startDate: '2026-09-20',
        destination: '沖繩美麗海水族館 海洋博公園',
      },
    });

    expect(screen.getByTestId('trip-detail-title')).toHaveClass('line-clamp-2');
    expect(screen.getByTestId('trip-detail-title')).toHaveClass('[overflow-wrap:anywhere]');
    expect(screen.queryByTestId('mobile-trip-tools-trigger')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '開啟旅程工具與設定' })).toHaveLength(1);
  });

  it('shows an explicit fallback when real weather data is unavailable', () => {
    renderHeader({ weather: null });

    expect(screen.getByTestId('mobile-trip-weather')).toHaveTextContent('天氣未載入');
    expect(screen.queryByTestId('mobile-trip-weather-temperature')).not.toBeInTheDocument();
    expect(screen.queryByText(/降雨/)).not.toBeInTheDocument();
  });
});
