import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MapExploreControls } from './MapExploreControls.jsx';

const t = {
  headerBg: 'bg-white',
  cardBg: 'bg-white',
  cardMetaBg: 'bg-slate-100',
  itemBg: 'bg-slate-50',
  cardBorder: 'border-slate-200',
  mainText: 'text-slate-900',
  subText: 'text-slate-600',
};

const baseProps = {
  open: true,
  query: '',
  scope: 'map',
  anchorName: '台北車站',
  anchorAvailable: true,
  resultCount: 0,
  searchStatus: 'idle',
  showDrivingParkingHint: false,
  onOpen: vi.fn(),
  onClose: vi.fn(),
  onScopeChange: vi.fn(),
  onQueryChange: vi.fn(),
  onSearch: vi.fn(),
  onClear: vi.fn(),
  onSelectCategory: vi.fn(),
  onOpenParking: vi.fn(),
  t,
};

describe('MapExploreControls', () => {
  it('keeps map scope explicit without repeating it in the header', () => {
    render(<MapExploreControls {...baseProps} query="拉麵" />);

    expect(screen.getByText('附近搜尋')).toBeInTheDocument();
    expect(screen.queryByText('探索目前區域')).not.toBeInTheDocument();
    expect(screen.queryByText('依目前地圖畫面搜尋')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '目前區域' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '這站附近' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('searchbox', { name: '搜尋目前地圖區域' })).toHaveValue('拉麵');
  });

  it('uses one collapsed entry for nearby places and parking', () => {
    const onOpen = vi.fn();
    render(<MapExploreControls {...baseProps} open={false} onOpen={onOpen} />);

    fireEvent.click(screen.getByRole('button', { name: '探索附近地點與停車' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('parking-layer-trigger')).not.toBeInTheDocument();
  });

  it('makes the search scope explicit and keeps parking anchored to the selected place', () => {
    const onScopeChange = vi.fn();
    const onOpenParking = vi.fn();
    render(
      <MapExploreControls
        {...baseProps}
        scope="place"
        onScopeChange={onScopeChange}
        onOpenParking={onOpenParking}
      />,
    );

    expect(screen.getByText('台北車站')).toBeInTheDocument();
    expect(screen.queryByText('找這站附近')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '這站附近' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('searchbox', { name: '搜尋台北車站附近' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '目前區域' }));
    expect(onScopeChange).toHaveBeenCalledWith('map');
    fireEvent.click(screen.getByTestId('parking-layer-trigger'));
    expect(onOpenParking).toHaveBeenCalledTimes(1);
  });

  it('submits free text, category presets, clear, and close through explicit callbacks', () => {
    const onSearch = vi.fn();
    const onSelectCategory = vi.fn();
    const onClear = vi.fn();
    const onClose = vi.fn();
    render(
      <MapExploreControls
        {...baseProps}
        query="拉麵"
        resultCount={2}
        onSearch={onSearch}
        onSelectCategory={onSelectCategory}
        onClear={onClear}
        onClose={onClose}
      />,
    );

    fireEvent.submit(screen.getByRole('search'));
    expect(onSearch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '咖啡' }));
    expect(onSelectCategory).toHaveBeenCalledWith('咖啡廳');
    fireEvent.click(screen.getByRole('button', { name: '清除' }));
    expect(onClear).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '關閉附近搜尋' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('disables place-scoped actions when the selected stop has no coordinates', () => {
    render(<MapExploreControls {...baseProps} scope="place" anchorAvailable={false} />);

    expect(screen.getByRole('button', { name: '這站附近' })).toBeDisabled();
    expect(screen.getByTestId('parking-layer-trigger')).toBeDisabled();
    expect(screen.getByRole('button', { name: '目前區域' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('searchbox', { name: '搜尋目前地圖區域' })).toBeInTheDocument();
  });

  it('requires an explicit place scope before parking becomes available', () => {
    render(
      <MapExploreControls
        {...baseProps}
        scope="map"
        showDrivingParkingHint
      />,
    );

    expect(screen.getByTestId('parking-layer-trigger')).toBeDisabled();
    expect(screen.getByTestId('parking-layer-trigger')).toHaveAccessibleName('請先切換到這站附近');
    expect(screen.queryByTestId('parking-driving-hint')).not.toBeInTheDocument();
  });

  it('shows useful progress and no-results feedback without a dead end', () => {
    const { rerender } = render(<MapExploreControls {...baseProps} searchStatus="searching" />);
    expect(screen.getByRole('button', { name: '搜尋中…' })).toBeDisabled();

    rerender(<MapExploreControls {...baseProps} searchStatus="empty" />);
    expect(screen.getByRole('status')).toHaveTextContent('改用其他關鍵字');
  });

  it('uses readable semantic tones and exposes an explicit retry after an error', () => {
    const onSearch = vi.fn();
    render(
      <MapExploreControls
        {...baseProps}
        scope="place"
        searchStatus="error"
        onSearch={onSearch}
        t={{ ...t, isLight: false }}
      />,
    );

    expect(screen.getByTestId('parking-layer-trigger')).toHaveClass('text-blue-200');
    expect(screen.getByRole('alert')).toHaveClass('text-red-200', 'text-sm');
    expect(screen.getByRole('alert')).toHaveTextContent('附近搜尋暫時失敗，請重試。');

    const retry = screen.getByRole('button', { name: '重試' });
    expect(retry).toBeEnabled();
    fireEvent.click(retry);
    expect(onSearch).toHaveBeenCalledTimes(1);
  });
});
