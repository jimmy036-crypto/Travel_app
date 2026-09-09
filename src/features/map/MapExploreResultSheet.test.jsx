import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MapExploreResultSheet } from './MapExploreResultSheet.jsx';

const t = {
  headerBg: 'bg-white',
  cardMetaBg: 'bg-slate-100',
  itemBg: 'bg-slate-50',
  cardBorder: 'border-slate-200',
  mainText: 'text-slate-900',
  subText: 'text-slate-600',
};

describe('MapExploreResultSheet', () => {
  it('labels anchored results and selects an accessible result card', () => {
    const onSelect = vi.fn();
    const result = {
      place_id: 'result-1',
      name: '車站咖啡',
      formatted_address: '台北市中正區',
      rating: 4.5,
    };
    render(
      <MapExploreResultSheet
        results={[result]}
        query="咖啡廳"
        originItem={{ id: 'station', name: '台北車站' }}
        selectedPlaceId=""
        onSelect={onSelect}
        t={t}
      />,
    );

    expect(screen.getByText('咖啡廳・「台北車站」附近')).toBeInTheDocument();
    expect(screen.getByTestId('map-explore-result-sheet')).toHaveClass('bottom-2', 'lg:w-96');
    expect(screen.getByTestId('map-explore-result-sheet')).not.toHaveClass('md:w-96');
    fireEvent.click(screen.getByRole('button', { name: '查看車站咖啡' }));
    expect(onSelect).toHaveBeenCalledWith(result);
  });

  it('renders nothing for an empty result set', () => {
    const { container } = render(
      <MapExploreResultSheet results={[]} query="" originItem={null} onSelect={vi.fn()} t={t} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('keeps rating contrast in dark appearance', () => {
    render(
      <MapExploreResultSheet
        results={[{ place_id: 'night', name: '夜間咖啡', rating: 4.8 }]}
        query="咖啡"
        originItem={null}
        selectedPlaceId=""
        onSelect={vi.fn()}
        t={{ ...t, isLight: false }}
      />,
    );

    expect(screen.getByText('★ 4.8')).toHaveClass('text-orange-200');
  });
});
