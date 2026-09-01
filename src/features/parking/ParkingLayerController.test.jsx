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

function Harness({ searchParking, onSave = vi.fn(), anchorValue = anchor, isDriving = false }) {
  const [mode, setMode] = useState('none');
  return (
    <ParkingLayerController
      key={anchorValue.id}
      mode={mode}
      onModeChange={setMode}
      roomId="room-1"
      dayId="Day 1"
      anchor={anchorValue}
      placesLib={{}}
      canEdit
      isDriving={isDriving}
      onSavePlan={onSave}
      onRemovePlan={vi.fn()}
      t={theme}
      searchParking={searchParking}
    >
      {({ markers, overlays }) => <div>{markers}{overlays}</div>}
    </ParkingLayerController>
  );
}

describe('ParkingLayerController', () => {
  it('makes zero requests on load, anchor selection, and the driving hint', async () => {
    const searchParking = vi.fn();
    const view = render(<Harness searchParking={searchParking} isDriving />);
    expect(searchParking).not.toHaveBeenCalled();
    expect(screen.getByTestId('parking-driving-hint')).toBeInTheDocument();
    view.rerender(<Harness searchParking={searchParking} anchorValue={{ ...anchor, id: 'place-2' }} isDriving />);
    expect(searchParking).not.toHaveBeenCalled();
  });

  it('opens without searching and sends exactly one request on explicit search', async () => {
    const user = userEvent.setup();
    const searchParking = vi.fn().mockResolvedValue({ facilities, googleStatus: 'ok', tdxStatus: 'not_configured' });
    render(<Harness searchParking={searchParking} />);
    await user.click(screen.getByTestId('parking-layer-trigger'));
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
  });

  it('requires explicit refresh after radius changes', async () => {
    const user = userEvent.setup();
    const searchParking = vi.fn().mockResolvedValue({ facilities: [], googleStatus: 'ok', tdxStatus: 'ok' });
    render(<Harness searchParking={searchParking} />);
    await user.click(screen.getByTestId('parking-layer-trigger'));
    await user.selectOptions(screen.getByLabelText('停車搜尋半徑'), '1000');
    expect(searchParking).not.toHaveBeenCalled();
    await user.click(screen.getByTestId('parking-search-button'));
    await waitFor(() => expect(searchParking).toHaveBeenCalledWith(expect.objectContaining({ radius: 1000 })));
  });

  it('shows price labels only on the first three 44px markers and saves through its callback', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const searchParking = vi.fn().mockResolvedValue({ facilities, googleStatus: 'ok', tdxStatus: 'ok' });
    render(<Harness searchParking={searchParking} onSave={onSave} />);
    await user.click(screen.getByTestId('parking-layer-trigger'));
    await user.click(screen.getByTestId('parking-search-button'));
    const markers = await screen.findAllByTestId('parking-marker');
    expect(markers.filter((marker) => marker.dataset.priceVisible === 'true')).toHaveLength(3);
    markers.forEach((marker) => expect(marker.className).toContain('min-h-11'));
    await user.click((await screen.findAllByText('設為此景點停車場'))[0]);
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: 'parking-0' }));
  });

  it('honestly degrades when no tariff is available', async () => {
    const user = userEvent.setup();
    const noTariff = [createParkingFacility({ id: 'jp', provider: 'google', googlePlaceId: 'jp', name: '東京停車場', location: { lat: 35.6, lng: 139.7 } })];
    const searchParking = vi.fn().mockResolvedValue({ facilities: noTariff, googleStatus: 'ok', tdxStatus: 'outside_coverage' });
    render(<Harness searchParking={searchParking} anchorValue={{ ...anchor, lat: 35.6, lng: 139.7 }} />);
    await user.click(screen.getByTestId('parking-layer-trigger'));
    await user.click(screen.getByTestId('parking-search-button'));
    expect((await screen.findAllByText(/費率資料未提供/)).length).toBeGreaterThan(0);
  });
});
