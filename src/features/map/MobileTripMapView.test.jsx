import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MobileTripMapView } from './MobileTripMapView.jsx';

const { apiStatus, mapMock } = vi.hoisted(() => ({
  apiStatus: { value: 'LOADED' },
  mapMock: {
    fitBounds: vi.fn(),
    getZoom: vi.fn(() => 13),
    moveCamera: vi.fn(),
    panBy: vi.fn(),
    panTo: vi.fn(),
    setZoom: vi.fn(),
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
    Object.values(mapMock).forEach((mock) => mock.mockClear());
    mapMock.getZoom.mockReturnValue(13);
    window.matchMedia.mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    window.google = {
      maps: {
        LatLngBounds: class LatLngBoundsMock {
          constructor() {
            this.points = [];
          }

          extend(point) {
            this.points.push(point);
          }
        },
      },
    };
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
    expect(mapMock.panTo).not.toHaveBeenCalled();
    const thirdMarker = screen.getAllByTestId('map-itinerary-marker')
      .find((marker) => marker.getAttribute('data-place-id') === 'c');
    expect(thirdMarker).toBeDefined();
    fireEvent.click(thirdMarker);

    expect(screen.getAllByTestId('map-place-card')[2]).toHaveAttribute('aria-selected', 'true');
    expect(mapMock.panTo).toHaveBeenCalledWith({ lat: 25.04, lng: 121.57 });
    expect(mapMock.setZoom).toHaveBeenCalledWith(16);
    expect(mapMock.panBy).toHaveBeenCalledWith(0, 72);
    expect(screen.getByRole('button', { name: '顯示全日' })).toHaveClass('min-h-11');

    rerender(<MobileTripMapView {...props} dayId="Day 2" focusResetRequest={1} />);
    expect(screen.getAllByTestId('map-itinerary-marker')).toHaveLength(1);
    expect(screen.getByTestId('map-itinerary-marker')).toHaveAttribute('data-order', '1');
    expect(screen.getAllByTestId('map-place-card')).toHaveLength(1);
    expect(screen.getByText('第二天唯一景點')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '顯示全日' })).not.toBeInTheDocument();

    Object.values(mapMock).forEach((mock) => mock.mockClear());
    rerender(<MobileTripMapView {...props} dayId="Day 1" focusResetRequest={2} />);
    expect(screen.queryByRole('button', { name: '顯示全日' })).not.toBeInTheDocument();
    expect(mapMock.panTo).not.toHaveBeenCalled();
  });

  it('keeps a closer zoom and restores the full-day bounds on request', () => {
    mapMock.getZoom.mockReturnValue(18);
    renderMap();
    const thirdMarker = screen.getAllByTestId('map-itinerary-marker')
      .find((marker) => marker.getAttribute('data-place-id') === 'c');

    fireEvent.click(thirdMarker);
    expect(mapMock.setZoom).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '顯示全日' }));
    expect(mapMock.fitBounds).toHaveBeenCalledTimes(1);
    expect(mapMock.fitBounds.mock.calls[0][0].points).toEqual([
      { lat: 25.03, lng: 121.56 },
      { lat: 25.04, lng: 121.57 },
    ]);
    expect(mapMock.fitBounds.mock.calls[0][1]).toEqual({
      top: 88,
      bottom: 240,
      left: 36,
      right: 36,
    });
    expect(screen.queryByRole('button', { name: '顯示全日' })).not.toBeInTheDocument();
  });

  it('does not move the camera when a place has no coordinates', () => {
    renderMap();
    const invalidCard = screen.getAllByTestId('map-place-card')[1];

    fireEvent.click(within(invalidCard).getByTestId('map-place-card-select'));

    expect(invalidCard).toHaveAttribute('aria-selected', 'true');
    expect(mapMock.panTo).not.toHaveBeenCalled();
    expect(mapMock.setZoom).not.toHaveBeenCalled();
    expect(mapMock.panBy).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '顯示全日' })).not.toBeInTheDocument();
  });

  it('does not focus a controlled selection until the user interacts with it', () => {
    renderMap({ selectedPlaceId: 'c' });

    expect(screen.getAllByTestId('map-place-card')[2]).toHaveAttribute('aria-selected', 'true');
    expect(mapMock.panTo).not.toHaveBeenCalled();
    expect(mapMock.setZoom).not.toHaveBeenCalled();
  });

  it('restores a one-place day at zoom 15', () => {
    renderMap({ dayId: 'Day 2' });
    fireEvent.click(screen.getByTestId('map-itinerary-marker'));
    Object.values(mapMock).forEach((mock) => mock.mockClear());
    mapMock.getZoom.mockReturnValue(16);

    fireEvent.click(screen.getByRole('button', { name: '顯示全日' }));

    expect(mapMock.panTo).toHaveBeenCalledWith({ lat: 24.99, lng: 121.5 });
    expect(mapMock.setZoom).toHaveBeenCalledWith(15);
    expect(mapMock.fitBounds).not.toHaveBeenCalled();
  });

  it('clears its focus control when the parent restores the full-day view', () => {
    const { rerender, props } = renderMap();
    fireEvent.click(screen.getAllByTestId('map-itinerary-marker')[1]);
    Object.values(mapMock).forEach((mock) => mock.mockClear());

    rerender(<MobileTripMapView {...props} focusResetRequest={1} />);

    expect(mapMock.fitBounds).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '顯示全日' })).not.toBeInTheDocument();
  });

  it('does not resurrect an old focus after leaving and returning to the map tab', () => {
    const { rerender, props } = renderMap();
    fireEvent.click(screen.getAllByTestId('map-itinerary-marker')[1]);
    expect(screen.getByRole('button', { name: '顯示全日' })).toBeInTheDocument();

    rerender(<MobileTripMapView {...props} active={false} />);
    Object.values(mapMock).forEach((mock) => mock.mockClear());
    rerender(<MobileTripMapView {...props} active focusResetRequest={1} />);

    expect(screen.queryByRole('button', { name: '顯示全日' })).not.toBeInTheDocument();
    expect(mapMock.panTo).not.toHaveBeenCalled();
    expect(mapMock.fitBounds).not.toHaveBeenCalled();
  });

  it('uses an immediate camera update when reduced motion is requested', () => {
    window.matchMedia.mockImplementation((query) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    renderMap();
    const thirdMarker = screen.getAllByTestId('map-itinerary-marker')
      .find((marker) => marker.getAttribute('data-place-id') === 'c');

    fireEvent.click(thirdMarker);

    expect(mapMock.moveCamera).toHaveBeenCalledWith({
      center: { lat: 25.04, lng: 121.57 },
      zoom: 16,
    });
    expect(mapMock.panTo).not.toHaveBeenCalled();
    expect(mapMock.panBy).not.toHaveBeenCalled();
  });

  it('draws order markers as inverted teardrops inside a full touch target', () => {
    renderMap();
    const marker = screen.getAllByTestId('map-itinerary-marker')[0];
    const pin = within(marker).getByTestId('map-itinerary-marker-pin');

    // The button stays a 44px touch target while the visible pin is smaller.
    expect(marker).toHaveClass('h-11');
    expect(marker).toHaveClass('w-11');
    expect(pin).toHaveClass('h-7');
    expect(pin).toHaveClass('w-7');

    // Round on three corners, square on one, rotated 45deg: a teardrop whose
    // point sits at the bottom.
    expect(pin).toHaveClass('rounded-full');
    expect(pin).toHaveClass('rounded-br-none');
    expect(pin).toHaveClass('rotate-45');

    // The order counter is counter-rotated so it stays upright and legible.
    const label = within(marker).getByText('1');
    expect(label).toHaveClass('-rotate-45');
  });

  it('marks the selected nearby result visually and invokes selection once from its touch target', () => {
    const onSelectExploreItem = vi.fn();
    const selectedPlace = {
      place_id: 'cafe-1',
      name: '海景咖啡',
      geometry: {
        location: { lat: () => 25.05, lng: () => 121.58 },
      },
    };
    const otherPlace = {
      place_id: 'cafe-2',
      name: '山景咖啡',
      geometry: {
        location: { lat: () => 25.06, lng: () => 121.59 },
      },
    };
    renderMap({
      exploreQuery: '咖啡廳',
      exploreResults: [selectedPlace, otherPlace],
      selectedExplorePlaceId: selectedPlace.place_id,
      onSelectExploreItem,
    });

    const markers = screen.getAllByTestId('map-explore-marker');
    const marker = markers.find((candidate) => candidate.dataset.placeId === 'cafe-1');
    const otherMarker = markers.find((candidate) => candidate.dataset.placeId === 'cafe-2');
    expect(marker).toBeDefined();
    expect(otherMarker).toBeDefined();
    expect(marker).toHaveClass('h-11', 'w-11');
    expect(marker).toHaveAttribute('aria-pressed', 'true');
    expect(marker?.querySelector('span')).toHaveClass('scale-110', 'ring-2', 'ring-orange-500/60');
    expect(otherMarker).toHaveAttribute('aria-pressed', 'false');
    expect(otherMarker?.querySelector('span')).not.toHaveClass('scale-110', 'ring-2', 'ring-orange-500/60');

    fireEvent.click(marker);
    expect(onSelectExploreItem).toHaveBeenCalledOnce();
    expect(onSelectExploreItem).toHaveBeenCalledWith(selectedPlace);
  });

  it('keeps marker selection state on the pin, not the touch target', () => {
    renderMap();
    const markers = screen.getAllByTestId('map-itinerary-marker');
    const thirdMarker = markers.find(
      (marker) => marker.getAttribute('data-place-id') === 'c',
    );

    expect(thirdMarker).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(thirdMarker);

    expect(thirdMarker).toHaveAttribute('aria-pressed', 'true');
    expect(within(thirdMarker).getByTestId('map-itinerary-marker-pin'))
      .toHaveClass('bg-blue-700');
    expect(within(markers[0]).getByTestId('map-itinerary-marker-pin'))
      .toHaveClass('bg-blue-600');
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

  it('opens saved parking management inside the itinerary sheet without stacking an overlay', () => {
    renderMap({
      savedParkingKey: 'saved-1',
      savedParkingPanel: (
        <aside data-testid="saved-parking-card">
          <button type="button">移除</button>
        </aside>
      ),
    });

    expect(screen.queryByTestId('saved-parking-card')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('map-saved-parking-manage'));

    const sheet = screen.getByTestId('map-itinerary-sheet');
    expect(sheet).toHaveAttribute('data-state', 'saved-parking');
    expect(sheet).toHaveClass('h-[clamp(13rem,38%,16rem)]');
    expect(screen.getByTestId('saved-parking-card')).toBeInTheDocument();
    expect(screen.queryByTestId('map-itinerary-card-scroller')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('map-saved-parking-back'));
    expect(sheet).toHaveAttribute('data-state', 'cards');
    expect(screen.getByTestId('map-itinerary-card-scroller')).toBeInTheDocument();
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
