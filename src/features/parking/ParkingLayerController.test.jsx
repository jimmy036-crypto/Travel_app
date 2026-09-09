import React, { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@vis.gl/react-google-maps', () => ({
  AdvancedMarker: ({ children }) => <>{children}</>,
}));

import { ParkingLayerController } from './ParkingLayerController.jsx';
import { createParkingFacility } from './parkingFacilityModel.js';

const theme = { headerBg: 'bg-white', cardBg: 'bg-white', cardBorder: 'border-slate-200', mainText: 'text-slate-900', subText: 'text-slate-500' };
const anchor = { id: 'place-1', name: '台北 101', lat: 25.033, lng: 121.5654, time: '09:00', stayTime: '120' };
const facilities = Array.from({ length: 5 }, (_, index) => createParkingFacility({
  id: `parking-${index}`,
  provider: index === 0 ? 'tdx' : 'google',
  providerFacilityId: index === 0 ? 'T1' : null,
  googlePlaceId: index === 0 ? null : `G${index}`,
  name: `停車場 ${index + 1}`,
  location: { lat: 25.033 + index * 0.0001, lng: 121.5654 },
  distanceToDestinationMeters: 100 + index * 20,
  tariff: index < 3 ? { currency: 'TWD', rawText: '每小時 60 元', hourlyEquivalent: 60, confidence: 'high' } : {},
  source: { label: index === 0 ? 'TDX' : 'Google Maps', fetchedAt: '2026-08-05T00:00:00Z' },
}));

function Harness({
  searchParking,
  onSave = vi.fn(),
  onRemove = vi.fn(),
  anchorValue = anchor,
  dayIdValue = 'Day 1',
  showSavedParkingCard = true,
}) {
  const [mode, setMode] = useState('none');
  return (
    <ParkingLayerController
      mode={mode}
      onModeChange={setMode}
      roomId="room-1"
      dayId={dayIdValue}
      anchor={anchorValue}
      placesLib={{}}
      canEdit
      onSavePlan={onSave}
      onRemovePlan={onRemove}
      t={theme}
      searchParking={searchParking}
      showSavedParkingCard={showSavedParkingCard}
    >
      {({ markers, overlays, openParking, parkingOpen, parkingAvailable, savedParkingPanel }) => (
        <div data-testid="map-child-sentinel">
          <button
            type="button"
            data-testid="unified-parking-entry"
            disabled={!parkingAvailable}
            aria-pressed={parkingOpen}
            onClick={openParking}
          >
            停車
          </button>
          <button type="button" data-testid="unified-explore-entry" onClick={() => setMode('explore')}>探索</button>
          {markers}
          {overlays}
          {savedParkingPanel}
        </div>
      )}
    </ParkingLayerController>
  );
}

describe('ParkingLayerController', () => {
  it('keeps the map child mounted while mode and anchor context change', async () => {
    const user = userEvent.setup();
    const searchParking = vi.fn();
    const view = render(<Harness searchParking={searchParking} />);
    const mapChild = screen.getByTestId('map-child-sentinel');

    await user.click(screen.getByTestId('unified-parking-entry'));
    expect(screen.getByTestId('map-child-sentinel')).toBe(mapChild);

    await user.click(screen.getByTestId('unified-explore-entry'));
    expect(screen.getByTestId('map-child-sentinel')).toBe(mapChild);

    view.rerender(
      <Harness
        searchParking={searchParking}
        dayIdValue="Day 2"
        anchorValue={{ ...anchor, id: 'place-2', lat: 25.04, lng: 121.57 }}
      />,
    );
    expect(screen.getByTestId('map-child-sentinel')).toBe(mapChild);
  });

  it('aborts and clears the parking session when its anchor changes', async () => {
    const user = userEvent.setup();
    let requestSignal;
    const searchParking = vi.fn(({ signal }) => {
      requestSignal = signal;
      return new Promise(() => {});
    });
    const view = render(<Harness searchParking={searchParking} />);

    await user.click(screen.getByTestId('unified-parking-entry'));
    await user.click(screen.getByTestId('parking-search-button'));
    await waitFor(() => expect(searchParking).toHaveBeenCalledOnce());

    view.rerender(
      <Harness
        searchParking={searchParking}
        anchorValue={{ ...anchor, id: 'place-2', lat: 25.04, lng: 121.57 }}
      />,
    );

    expect(requestSignal.aborted).toBe(true);
    expect(screen.getByText('為 台北 101 找停車')).toBeInTheDocument();
    expect(screen.getByTestId('parking-search-button')).toHaveTextContent('搜尋／重新搜尋');
    expect(searchParking).toHaveBeenCalledOnce();
  });

  it('exposes a unified entry and makes zero requests on load, anchor selection, or open', async () => {
    const user = userEvent.setup();
    const searchParking = vi.fn();
    const view = render(<Harness searchParking={searchParking} />);
    expect(searchParking).not.toHaveBeenCalled();
    expect(screen.queryByTestId('parking-layer-trigger')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('unified-parking-entry'));
    expect(searchParking).not.toHaveBeenCalled();
    expect(screen.getByTestId('parking-layer-controls')).toBeInTheDocument();
    expect(screen.getByText('為 台北 101 找停車')).toBeInTheDocument();
    view.rerender(<Harness searchParking={searchParking} anchorValue={{ ...anchor, id: 'place-2' }} />);
    expect(searchParking).not.toHaveBeenCalled();
  });

  it('opens without searching and sends exactly one request on explicit search', async () => {
    const user = userEvent.setup();
    const searchParking = vi.fn().mockResolvedValue({ facilities, googleStatus: 'ok', tdxStatus: 'not_configured' });
    render(<Harness searchParking={searchParking} />);
    await user.click(screen.getByTestId('unified-parking-entry'));
    expect(searchParking).not.toHaveBeenCalled();
    await user.click(screen.getByTestId('parking-search-button'));
    await waitFor(() => expect(searchParking).toHaveBeenCalledOnce());
    expect(searchParking.mock.calls[0][0]).toMatchObject({
      roomId: 'room-1',
      dayId: 'Day 1',
      placeId: 'place-1',
      anchor: { lat: 25.033, lng: 121.5654 },
      radius: 500,
    });
    expect(await screen.findByText(/TDX 尚未設定/)).toBeInTheDocument();
    expect(screen.getByTestId('parking-result-sheet')).toHaveTextContent('為 台北 101 找停車');
    expect(screen.getByTestId('parking-result-sheet')).toHaveClass('bottom-2', 'lg:w-96');
    expect(screen.getAllByRole('button', { name: /停車場 1/ })[0]).toHaveAttribute('aria-pressed', 'true');
  });

  it('reports that parking is unavailable when the selected destination has no coordinates', () => {
    render(<Harness searchParking={vi.fn()} anchorValue={{ ...anchor, lat: null, lng: null }} />);
    expect(screen.getByTestId('unified-parking-entry')).toBeDisabled();
    expect(screen.queryByTestId('parking-layer-controls')).not.toBeInTheDocument();
  });

  it('exposes saved parking management as in-sheet content on mobile layouts', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <Harness
        searchParking={vi.fn()}
        onRemove={onRemove}
        showSavedParkingCard={false}
        anchorValue={{
          ...anchor,
          parkingPlan: {
            provider: 'tdx',
            providerFacilityId: 'T1',
            name: '市府轉運站停車場',
            selectedAt: '2026-09-09T00:00:00Z',
          },
        }}
      />,
    );

    const card = screen.getByTestId('saved-parking-card');
    expect(card).toHaveClass('relative');
    expect(card).not.toHaveClass('absolute');
    await user.click(screen.getByRole('button', { name: '移除' }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it('invalidates resolved results and requires an explicit refresh after radius changes', async () => {
    const user = userEvent.setup();
    const searchParking = vi.fn().mockResolvedValue({ facilities, googleStatus: 'ok', tdxStatus: 'not_configured' });
    render(<Harness searchParking={searchParking} />);
    await user.click(screen.getByTestId('unified-parking-entry'));
    await user.click(screen.getByTestId('parking-search-button'));
    expect(await screen.findByTestId('parking-result-sheet')).toBeInTheDocument();
    expect(await screen.findByText(/TDX 尚未設定/)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('為 台北 101 找停車的搜尋半徑'), '1000');
    expect(screen.queryByTestId('parking-result-sheet')).not.toBeInTheDocument();
    expect(screen.queryByText(/TDX 尚未設定/)).not.toBeInTheDocument();
    expect(screen.getByTestId('parking-search-button')).toHaveTextContent('搜尋／重新搜尋');
    expect(searchParking).toHaveBeenCalledOnce();

    await user.click(screen.getByTestId('parking-search-button'));
    await waitFor(() => expect(searchParking).toHaveBeenCalledTimes(2));
    expect(searchParking.mock.calls[1][0]).toEqual(expect.objectContaining({ radius: 1000 }));
  });

  it('aborts an in-flight request when the parking radius changes', async () => {
    const user = userEvent.setup();
    let requestSignal;
    const searchParking = vi.fn(({ signal }) => {
      requestSignal = signal;
      return new Promise(() => {});
    });
    render(<Harness searchParking={searchParking} />);
    await user.click(screen.getByTestId('unified-parking-entry'));
    await user.click(screen.getByTestId('parking-search-button'));
    await waitFor(() => expect(searchParking).toHaveBeenCalledOnce());

    await user.selectOptions(screen.getByLabelText('為 台北 101 找停車的搜尋半徑'), '1000');

    expect(requestSignal.aborted).toBe(true);
    expect(screen.getByTestId('parking-search-button')).toHaveTextContent('搜尋／重新搜尋');
  });

  it('aborts an in-flight request when the unified search changes mode', async () => {
    const user = userEvent.setup();
    let requestSignal;
    const searchParking = vi.fn(({ signal }) => {
      requestSignal = signal;
      return new Promise(() => {});
    });
    render(<Harness searchParking={searchParking} />);
    await user.click(screen.getByTestId('unified-parking-entry'));
    await user.click(screen.getByTestId('parking-search-button'));
    await waitFor(() => expect(searchParking).toHaveBeenCalledOnce());
    expect(requestSignal.aborted).toBe(false);

    await user.click(screen.getByTestId('unified-explore-entry'));

    expect(requestSignal.aborted).toBe(true);
    expect(screen.queryByTestId('parking-layer-controls')).not.toBeInTheDocument();
  });

  it('clears resolved parking results when leaving and reopening the parking mode', async () => {
    const user = userEvent.setup();
    const searchParking = vi.fn().mockResolvedValue({ facilities, googleStatus: 'ok', tdxStatus: 'ok' });
    render(<Harness searchParking={searchParking} />);
    await user.click(screen.getByTestId('unified-parking-entry'));
    await user.click(screen.getByTestId('parking-search-button'));
    expect(await screen.findByTestId('parking-result-sheet')).toBeInTheDocument();

    await user.click(screen.getByTestId('unified-explore-entry'));
    await user.click(screen.getByTestId('unified-parking-entry'));

    expect(screen.queryByTestId('parking-result-sheet')).not.toBeInTheDocument();
    expect(searchParking).toHaveBeenCalledOnce();
  });

  it('shows price labels on the first three 44px markers and keeps navigation primary while saving through its callback', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const searchParking = vi.fn().mockResolvedValue({ facilities, googleStatus: 'ok', tdxStatus: 'ok' });
    render(<Harness searchParking={searchParking} onSave={onSave} />);
    await user.click(screen.getByTestId('unified-parking-entry'));
    await user.click(screen.getByTestId('parking-search-button'));
    const markers = await screen.findAllByTestId('parking-marker');
    expect(markers.filter((marker) => marker.dataset.priceVisible === 'true')).toHaveLength(3);
    markers.forEach((marker) => expect(marker.className).toContain('min-h-11'));
    const navigationButtons = await screen.findAllByRole('button', { name: '導航到停車場' });
    expect(navigationButtons[0].className).toContain('bg-blue-700');
    await user.click((await screen.findAllByText('設為此景點停車場'))[0]);
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: 'parking-0' }));
  });

  it('honestly degrades when no tariff is available', async () => {
    const user = userEvent.setup();
    const noTariff = [createParkingFacility({ id: 'jp', provider: 'google', googlePlaceId: 'jp', name: '東京停車場', location: { lat: 35.6, lng: 139.7 } })];
    const searchParking = vi.fn().mockResolvedValue({ facilities: noTariff, googleStatus: 'ok', tdxStatus: 'outside_coverage' });
    render(<Harness searchParking={searchParking} anchorValue={{ ...anchor, lat: 35.6, lng: 139.7 }} />);
    await user.click(screen.getByTestId('unified-parking-entry'));
    await user.click(screen.getByTestId('parking-search-button'));
    expect((await screen.findAllByText(/費率資料未提供/)).length).toBeGreaterThan(0);
  });
});
