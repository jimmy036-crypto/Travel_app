import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MapExploreSelectionSheet } from './MapExploreSelectionSheet.jsx';

const t = {
  headerBg: 'bg-white',
  cardMetaBg: 'bg-slate-100',
  cardBorder: 'border-slate-200',
  mainText: 'text-slate-900',
  subText: 'text-slate-600',
};

const place = {
  place_id: 'result-1',
  name: '車站咖啡',
  formatted_address: '台北市中正區',
  rating: 4.5,
  user_ratings_total: 80,
};

describe('MapExploreSelectionSheet', () => {
  it('stays inside the map panel and exposes anchored itinerary actions', () => {
    const onBack = vi.fn();
    const onShowDetails = vi.fn();
    const onAdd = vi.fn();
    render(
      <MapExploreSelectionSheet
        place={place}
        originItem={{ id: 'station', name: '台北車站' }}
        onBack={onBack}
        onShowDetails={onShowDetails}
        onAdd={onAdd}
        t={t}
      />,
    );

    const sheet = screen.getByRole('region', { name: '所選附近地點' });
    expect(sheet).toHaveClass('absolute', 'inset-x-2', 'bottom-2', 'lg:w-96');
    expect(sheet).not.toHaveClass('fixed');

    fireEvent.click(screen.getByRole('button', { name: '返回附近搜尋結果' }));
    fireEvent.click(screen.getByRole('button', { name: '查看詳情與實景照' }));
    fireEvent.click(screen.getByRole('button', { name: '加在這站前' }));
    fireEvent.click(screen.getByRole('button', { name: '加在這站後' }));

    expect(onBack).toHaveBeenCalledOnce();
    expect(onShowDetails).toHaveBeenCalledOnce();
    expect(onAdd).toHaveBeenNthCalledWith(1, 'before');
    expect(onAdd).toHaveBeenNthCalledWith(2, 'after');
  });

  it('uses the end action without an anchor and keeps dark-mode rating contrast', () => {
    const onAdd = vi.fn();
    render(
      <MapExploreSelectionSheet
        place={place}
        originItem={null}
        onBack={vi.fn()}
        onShowDetails={vi.fn()}
        onAdd={onAdd}
        t={{ ...t, isLight: false }}
      />,
    );

    expect(screen.getByText('★ 4.5')).toHaveClass('text-orange-200');
    fireEvent.click(screen.getByRole('button', { name: '加入行程最後' }));
    expect(onAdd).toHaveBeenCalledWith('end');
  });
});
