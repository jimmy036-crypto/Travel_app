import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MobileTripMapView } from './MobileTripMapView.jsx';

const { apiStatus, mapMock } = vi.hoisted(() => ({
  apiStatus: { value: 'LOADED' },
  mapMock: {
    panTo: vi.fn(),
  },
}));

vi.mock('@vis.gl/react-google-maps', () => ({
  APILoadingStatus: {
    NOT_LOADED: 'NOT_LOADED',
    LOADING: 'LOADING',
    LOADED: 'LOADED',
    FAILED: 'FAILED',
    AUTH_FAILURE: 'AUTH_FAILURE',
  },
  useApiLoadingStatus: () => apiStatus.value,
  useMap: () => mapMock,
  Map: ({ children }) => <div data-testid="google-map-instance">{children}</div>,
  AdvancedMarker: ({ children }) => <div data-testid="advanced-marker">{children}</div>,
}));

vi.mock('../../components/UIComponents.jsx', () => ({
  Directions: () => <span data-testid="directions-instance" />,
}));

const t = {
  mainText: 'text-slate-900',
  subText: 'text-slate-600',
  cardBg: 'bg-white/60',
  cardBorder: 'border-black/10',
  cardMetaBg: 'bg-black/5',
  headerBg: 'bg-white/70',
  modalBg: 'bg-white/95',
  itemBg: 'bg-white/80',
};

const itinerary = {
  'Day 1': [
    {
      id: 'a',
      name: '第一站',
      time: '09:00',
      lat: 25.03,
      lng: 121.56,
      placePhoto: { url: 'https://example.com/a.jpg' },
    },
    {
      id: 'b',
      name: '沒有定位的第二站',
      time: '10:00',
      lat: '',
      lng: '',
    },
    {
      id: 'c',
      name: 'OkinawaChuraumiAquariumOceanExpoParkSouvenirShop',
      time: '11:00',
      lat: 25.04,
      lng: 121.57,
    },
  ],
  'Day 2': [
    {
      id: 'd',
      name: '第二天唯一景點',
      time: '08:30',
      lat: 24.99,
      lng: 121.5,
    },
  ],
};

function renderMap(overrides = {}) {
  const props = {
    active: true,
    itinerary,
    dayId: 'Day 1',
    durations: [{ mode: 'AUTO', text: '15 分鐘' }, { mode: 'ERROR', text: '無法計算' }],
    t,
    exploreQuery: '',
    exploreResults: [],
    onExploreQueryChange: vi.fn(),
    onExploreSearch: vi.fn(),
    onClearExplore: vi.fn(),
    onSelectExploreItem: vi.fn(),
    onRouteCalculated: vi.fn(),
    onOpenDetails: vi.fn(),
    ...overrides,
  };
  const view = render(<MobileTripMapView {...props} />);
  return { ...view, props };
}

describe('MobileTripMapView', () => {
  beforeEach(() => {
    apiStatus.value = 'LOADED';
    mapMock.panTo.mockClear();
  });

  it('uses one map, ordered valid markers, and keeps invalid places in the sheet', () => {
    renderMap();

    expect(screen.getAllByTestId('google-map-instance')).toHaveLength(1);
    expect(screen.getAllByTestId('directions-instance')).toHaveLength(1);
    expect(screen.getAllByTestId('map-itinerary-marker').map(
      (marker) => marker.getAttribute('data-order'),
    )).toEqual(['1', '3']);
    expect(screen.getAllByTestId('map-place-card')).toHaveLength(3);
    expect(screen.getByTestId('map-place-no-location')).toHaveTextContent('無定位');
    expect(screen.getByTestId('map-route-state')).toHaveAttribute('data-state', 'partial');
  });

  it('synchronizes marker and card selection and updates after a day switch', () => {
    const { rerender, props } = renderMap();
    const thirdMarker = screen.getAllByTestId('map-itinerary-marker')
      .find((marker) => marker.getAttribute('data-place-id') === 'c');
    expect(thirdMarker).toBeDefined();
    fireEvent.click(thirdMarker);

    expect(screen.getAllByTestId('map-place-card')[2]).toHaveAttribute('aria-selected', 'true');
    expect(mapMock.panTo).toHaveBeenCalledWith({ lat: 25.04, lng: 121.57 });

    rerender(<MobileTripMapView {...props} dayId="Day 2" />);
    expect(screen.getAllByTestId('map-itinerary-marker')).toHaveLength(1);
    expect(screen.getByTestId('map-itinerary-marker')).toHaveAttribute('data-order', '1');
    expect(screen.getAllByTestId('map-place-card')).toHaveLength(1);
    expect(screen.getByText('第二天唯一景點')).toBeInTheDocument();
  });

  it('uses a stable image fallback and removes preview-card actions', () => {
    const { props } = renderMap();
    const image = document.querySelector('img');
    expect(image).not.toBeNull();
    fireEvent.error(image);
    expect(screen.getAllByTestId('map-place-photo-fallback').length).toBeGreaterThan(0);

    const firstCard = screen.getAllByTestId('map-place-card')[0];
    expect(within(firstCard).queryByRole('button', { name: /導航到/ })).not.toBeInTheDocument();
    expect(within(firstCard).queryByTestId('map-place-action-menu-trigger')).not.toBeInTheDocument();
    expect(firstCard).toHaveClass('w-[clamp(8.25rem,38vw,10rem)]');

    const thirdCard = screen.getAllByTestId('map-place-card')[2];
    fireEvent.click(within(thirdCard).getByTestId('map-place-card-select'));
    expect(thirdCard).toHaveAttribute('aria-selected', 'true');
    expect(props.onOpenDetails).not.toHaveBeenCalled();

    fireEvent.click(within(thirdCard).getByTestId('map-place-card-select'));
    expect(props.onOpenDetails).toHaveBeenCalledWith(itinerary['Day 1'][2], 'Day 1');
  });

  it('exposes sheet state and degrades coherently when the Maps API is unavailable', () => {
    const { rerender, props } = renderMap();
    const sheet = screen.getByTestId('map-itinerary-sheet');
    expect(sheet).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByTestId('map-sheet-toggle'));
    expect(sheet).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByTestId('map-sheet-peek'));
    expect(sheet).toHaveAttribute('aria-expanded', 'true');

    apiStatus.value = 'FAILED';
    rerender(<MobileTripMapView {...props} />);
    expect(screen.getByTestId('map-api-unavailable-state')).toBeInTheDocument();
    expect(screen.queryByTestId('google-map-instance')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('map-place-card')).toHaveLength(3);
  });

  it('keeps the full explore search collapsed until the 44px entry is opened', () => {
    const { props } = renderMap({ exploreQuery: '餐廳' });
    expect(screen.getByTestId('map-explore-controls')).toHaveAttribute('data-expanded', 'false');
    expect(screen.queryByRole('textbox', { name: '探索周邊' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('map-explore-trigger'));
    expect(screen.getByTestId('map-explore-controls')).toHaveAttribute('data-expanded', 'true');
    fireEvent.change(screen.getByRole('textbox', { name: '探索周邊' }), {
      target: { value: '咖啡廳' },
    });
    expect(props.onExploreQueryChange).toHaveBeenCalledWith('咖啡廳');
    fireEvent.click(screen.getByRole('button', { name: '搜尋' }));
    expect(props.onExploreSearch).toHaveBeenCalledWith('餐廳', null);

    fireEvent.click(screen.getByRole('button', { name: '關閉周邊搜尋' }));
    expect(screen.getByTestId('map-explore-trigger')).toBeInTheDocument();
  });

  it('uses a bounded cards height and collapses to a compact peek', () => {
    renderMap();
    const sheet = screen.getByTestId('map-itinerary-sheet');
    expect(sheet).toHaveClass('h-[clamp(10.5rem,30%,12.5rem)]');
    expect(sheet).toHaveAttribute('data-state', 'cards');

    fireEvent.click(screen.getByTestId('map-sheet-toggle'));
    expect(sheet).toHaveClass('h-[calc(4.5rem+env(safe-area-inset-bottom))]');
    expect(sheet).toHaveAttribute('data-state', 'peek');
    expect(screen.queryByTestId('map-itinerary-card-scroller')).not.toBeInTheDocument();
  });

  it('peek shows the selected place name/time, falls back to a day count, and re-expands on tap', () => {
    renderMap();
    fireEvent.click(screen.getByTestId('map-sheet-toggle'));
    expect(screen.getByTestId('map-sheet-peek-label')).toHaveTextContent('09:00');
    expect(screen.getByTestId('map-sheet-peek-label')).toHaveTextContent('第一站');

    fireEvent.click(screen.getByTestId('map-sheet-peek'));
    expect(screen.getByTestId('map-itinerary-card-scroller')).toBeInTheDocument();
  });

  it('peek falls back to a day count when there is no selection', () => {
    renderMap({
      itinerary: {
        'Day 1': [],
      },
    });
    fireEvent.click(screen.getByTestId('map-sheet-toggle'));
    expect(screen.getByTestId('map-sheet-peek-label')).toHaveTextContent('展開今日行程');
  });

  it('keeps the sheet state across a day switch', () => {
    const { rerender, props } = renderMap();
    fireEvent.click(screen.getByTestId('map-sheet-toggle'));
    expect(screen.getByTestId('map-itinerary-sheet')).toHaveAttribute('data-state', 'peek');

    rerender(<MobileTripMapView {...props} dayId="Day 2" />);
    expect(screen.getByTestId('map-itinerary-sheet')).toHaveAttribute('data-state', 'peek');
    expect(screen.getByTestId('map-sheet-peek-label')).toHaveTextContent('第二天唯一景點');
  });
});
