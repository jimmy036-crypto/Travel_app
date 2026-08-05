import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DestinationSearch } from './UIComponents.jsx';

const mapsMocks = vi.hoisted(() => ({
  getPlacePredictions: vi.fn(),
  getDetails: vi.fn(),
}));

vi.mock('@vis.gl/react-google-maps', () => ({
  useMap: () => null,
  useMapsLibrary: () => ({
    AutocompleteService: class {
      getPlacePredictions(...args) {
        return mapsMocks.getPlacePredictions(...args);
      }
    },
    PlacesService: class {
      getDetails(...args) {
        return mapsMocks.getDetails(...args);
      }
    },
  }),
}));

vi.mock('../firebase.js', () => ({ storage: null }));

const theme = {
  inputBg: 'bg-white',
  headerBg: 'bg-white',
  cardBorder: 'border-slate-200',
  mainText: 'text-slate-950',
  subText: 'text-slate-500',
};

describe('DestinationSearch event diagnostics', () => {
  beforeEach(() => {
    mapsMocks.getDetails.mockReset();
    mapsMocks.getPlacePredictions.mockReset();
    window.google = {
      maps: {
        places: {
          PlacesServiceStatus: { OK: 'OK' },
        },
      },
    };
    mapsMocks.getPlacePredictions.mockImplementation((_request, callback) => {
      callback([{
        place_id: 'tokyo',
        description: '日本東京都',
      }], 'OK');
    });
  });

  afterEach(() => {
    delete window.google;
  });

  it('records pointer, blur, click, details, and state-update order for one interaction', async () => {
    const events = [];
    const onChange = vi.fn((text, coordinates) => {
      events.push(coordinates ? 'onChange coordinates' : `onChange text:${text}`);
    });
    mapsMocks.getDetails.mockImplementation((_request, callback) => {
      events.push('getDetails start');
      callback({
        geometry: {
          location: {
            lat: () => 35.6762,
            lng: () => 139.6503,
          },
        },
      }, 'OK');
      events.push('getDetails callback');
    });

    render(<DestinationSearch value="東京" onChange={onChange} t={theme} />);

    const input = screen.getByRole('combobox');
    await waitFor(() => expect(screen.getByRole('option', { name: '日本東京都' })).toBeVisible(), {
      timeout: 1_000,
    });
    const option = screen.getByRole('option', { name: '日本東京都' });
    input.addEventListener('blur', () => events.push('input blur'));
    option.addEventListener('pointerdown', () => events.push('pointerdown'));
    option.addEventListener('touchstart', () => events.push('touchstart'));
    option.addEventListener('click', () => events.push('option click'), { capture: true });

    fireEvent.pointerDown(option);
    fireEvent.blur(input, { relatedTarget: option });
    fireEvent.click(option);

    expect(events).toEqual([
      'pointerdown',
      'input blur',
      'option click',
      'getDetails start',
      'onChange coordinates',
      'getDetails callback',
    ]);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('supports one keyboard selection and exposes loading feedback', async () => {
    let resolveDetails;
    mapsMocks.getDetails.mockImplementation((_request, callback) => {
      resolveDetails = callback;
    });
    const onChange = vi.fn();
    render(<DestinationSearch value="東京" onChange={onChange} t={theme} />);

    const input = screen.getByRole('combobox');
    await screen.findByRole('option', { name: '日本東京都' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByRole('status')).toHaveTextContent('正在取得地點資料');
    expect(input).toHaveValue('日本東京都');
    resolveDetails({
      geometry: { location: { lat: () => 35.6762, lng: () => 139.6503 } },
    }, 'OK');
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(
      '日本東京都',
      { lat: 35.6762, lng: 139.6503 },
    ));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('rejects a stale details callback after the user starts a newer query', async () => {
    let staleCallback;
    mapsMocks.getDetails.mockImplementation((_request, callback) => {
      staleCallback = callback;
    });
    const onChange = vi.fn();
    render(<DestinationSearch value="東京" onChange={onChange} t={theme} />);

    const input = screen.getByRole('combobox');
    const option = await screen.findByRole('option', { name: '日本東京都' });
    fireEvent.click(option);
    fireEvent.change(input, { target: { value: '大阪' } });
    staleCallback({
      geometry: { location: { lat: () => 35.6762, lng: () => 139.6503 } },
    }, 'OK');

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange).toHaveBeenLastCalledWith('大阪', null);
    expect(input).toHaveValue('大阪');
  });

  it('keeps the selected text recoverable and explains a details failure', async () => {
    mapsMocks.getDetails.mockImplementation((_request, callback) => callback(null, 'ZERO_RESULTS'));
    const onChange = vi.fn();
    render(<DestinationSearch value="東京" onChange={onChange} t={theme} />);

    fireEvent.click(await screen.findByRole('option', { name: '日本東京都' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('無法取得此目的地的座標');
    expect(screen.getByRole('combobox')).toHaveValue('日本東京都');
    expect(onChange).toHaveBeenCalledWith('日本東京都', null);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
