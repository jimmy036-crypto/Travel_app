import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SearchBox } from './UIComponents.jsx';

const mapsMocks = vi.hoisted(() => ({
  getDetails: vi.fn(),
  getPlacePredictions: vi.fn(),
}));

vi.mock('@vis.gl/react-google-maps', () => {
  class AutocompleteService {
    getPlacePredictions(...args) {
      return mapsMocks.getPlacePredictions(...args);
    }
  }

  class PlacesService {
    getDetails(...args) {
      return mapsMocks.getDetails(...args);
    }
  }

  const placesLibrary = { AutocompleteService, PlacesService };

  return {
    useMap: () => null,
    useMapsLibrary: () => placesLibrary,
  };
});

vi.mock('../firebase.js', () => ({ storage: null }));

const theme = {
  inputBg: 'bg-white',
  headerBg: 'bg-white',
  cardBg: 'bg-white',
  cardBorder: 'border-slate-200',
  mainText: 'text-slate-950',
  subText: 'text-slate-500',
};

const prediction = (placeId, description) => ({
  place_id: placeId,
  description,
});

const placeDetails = {
  name: '台北車站',
  formatted_address: '台北市中正區北平西路 3 號',
  place_id: 'taipei-station',
  geometry: {
    location: {
      lat: () => 25.0478,
      lng: () => 121.517,
    },
  },
};

const setQuery = (input, value) => {
  fireEvent.change(input, { target: { value } });
};

describe('SearchBox', () => {
  beforeEach(() => {
    mapsMocks.getDetails.mockReset();
    mapsMocks.getPlacePredictions.mockReset();
    mapsMocks.getPlacePredictions.mockImplementation((_request, callback) => {
      callback([prediction('taipei-station', '台北車站')], 'OK');
    });
    mapsMocks.getDetails.mockImplementation((_request, callback) => {
      callback(placeDetails, 'OK');
    });

    Object.defineProperty(window, 'google', {
      configurable: true,
      value: {
        maps: {
          places: {
            PlacesServiceStatus: {
              OK: 'OK',
              ZERO_RESULTS: 'ZERO_RESULTS',
            },
          },
        },
      },
      writable: true,
    });
  });

  it('exposes a labelled combobox/listbox contract and selects the active option with ArrowDown + Enter', async () => {
    let resolveAdd;
    const onAddPlace = vi.fn(() => new Promise((resolve) => {
      resolveAdd = resolve;
    }));
    render(<SearchBox dayId="Day 2" onAddPlace={onAddPlace} t={theme} />);

    const input = screen.getByRole('combobox', { name: '搜尋並新增 Day 2 景點' });
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    expect(input).toHaveAttribute('aria-expanded', 'false');

    setQuery(input, '台北');
    const listbox = await screen.findByRole('listbox', { name: 'Day 2 景點搜尋結果' });
    const option = within(listbox).getByRole('option', { name: '台北車站' });
    expect(input).toHaveAttribute('aria-controls', listbox.id);
    expect(option).toHaveAttribute('aria-selected', 'false');
    expect(option.tagName).toBe('BUTTON');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveAttribute('aria-activedescendant', option.id);
    expect(option).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(onAddPlace).toHaveBeenCalledWith(
      'Day 2',
      placeDetails,
      'taipei-station',
    ));
    expect(onAddPlace).toHaveBeenCalledTimes(1);
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('正在加入 Day 2…');

    await act(async () => {
      resolveAdd(true);
    });
    await waitFor(() => expect(input).toHaveFocus());
    expect(input).toHaveValue('');
    expect(input).not.toBeDisabled();
  });

  it('announces loading and a precise empty result without exposing a listbox', async () => {
    mapsMocks.getPlacePredictions.mockImplementation(() => {});
    render(<SearchBox dayId="Day 1" onAddPlace={vi.fn()} t={theme} />);

    const input = screen.getByRole('combobox', { name: '搜尋並新增 Day 1 景點' });
    setQuery(input, '不存在景點');
    expect(screen.getByRole('status')).toHaveTextContent('正在搜尋景點…');
    expect(input).toHaveAttribute('aria-busy', 'true');

    await waitFor(() => expect(mapsMocks.getPlacePredictions).toHaveBeenCalledTimes(1));
    const callback = mapsMocks.getPlacePredictions.mock.calls[0][1];
    act(() => callback([], 'ZERO_RESULTS'));

    expect(screen.getByRole('status')).toHaveTextContent('找不到符合的景點，請嘗試其他關鍵字。');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input).toHaveAttribute('aria-busy', 'false');
  });

  it('announces a prediction error and retries the same query', async () => {
    mapsMocks.getPlacePredictions.mockImplementation(() => {});
    render(<SearchBox dayId="Day 3" onAddPlace={vi.fn()} t={theme} />);

    const input = screen.getByRole('combobox', { name: '搜尋並新增 Day 3 景點' });
    setQuery(input, '台北');
    await waitFor(() => expect(mapsMocks.getPlacePredictions).toHaveBeenCalledTimes(1));
    act(() => mapsMocks.getPlacePredictions.mock.calls[0][1](null, 'REQUEST_DENIED'));

    expect(screen.getByRole('alert')).toHaveTextContent('無法載入景點建議，請檢查連線後重試。');
    const retryButton = screen.getByRole('button', { name: '重試搜尋' });
    retryButton.focus();
    fireEvent.click(retryButton);

    await waitFor(() => expect(mapsMocks.getPlacePredictions).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(input).toHaveFocus());
    expect(mapsMocks.getPlacePredictions.mock.calls[1][0]).toEqual({
      input: '台北',
      language: 'zh-TW',
    });
    act(() => mapsMocks.getPlacePredictions.mock.calls[1][1]([
      prediction('taipei-station', '台北車站'),
    ], 'OK'));

    expect(screen.getByRole('option', { name: '台北車站' })).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('wraps long unbroken result names inside a scrollable mobile listbox', async () => {
    const longName = 'InternationalMuseumOfContemporaryTransportationWithoutSpaces';
    mapsMocks.getPlacePredictions.mockImplementation((_request, callback) => {
      callback([prediction('long-place', longName)], 'OK');
    });
    render(<SearchBox dayId="Day 1" onAddPlace={vi.fn()} t={theme} />);

    const input = screen.getByRole('combobox', { name: '搜尋並新增 Day 1 景點' });
    setQuery(input, 'museum');
    const listbox = await screen.findByRole('listbox', { name: 'Day 1 景點搜尋結果' });
    const option = within(listbox).getByRole('option', { name: longName });

    expect(listbox).toHaveClass('max-h-60', 'overflow-y-auto', 'overscroll-contain');
    expect(option).toHaveClass('min-w-0', 'break-words', '[overflow-wrap:anywhere]');
  });

  it('ignores an A prediction callback after the query has changed to B', async () => {
    mapsMocks.getPlacePredictions.mockImplementation(() => {});
    render(<SearchBox dayId="Day 1" onAddPlace={vi.fn()} t={theme} />);

    const input = screen.getByRole('combobox', { name: '搜尋並新增 Day 1 景點' });
    setQuery(input, '台北');
    await waitFor(() => expect(mapsMocks.getPlacePredictions).toHaveBeenCalledTimes(1));

    setQuery(input, '大阪');
    await waitFor(() => expect(mapsMocks.getPlacePredictions).toHaveBeenCalledTimes(2));
    act(() => mapsMocks.getPlacePredictions.mock.calls[0][1]([
      prediction('taipei-station', '台北車站'),
    ], 'OK'));

    expect(screen.queryByRole('option', { name: '台北車站' })).not.toBeInTheDocument();
    expect(input).toHaveValue('大阪');

    act(() => mapsMocks.getPlacePredictions.mock.calls[1][1]([
      prediction('osaka-station', '大阪車站'),
    ], 'OK'));
    expect(screen.getByRole('option', { name: '大阪車站' })).toBeVisible();
    expect(screen.queryByRole('option', { name: '台北車站' })).not.toBeInTheDocument();
  });

  it('deduplicates pointerdown followed by click, keeps pending feedback, and restores input focus', async () => {
    let resolveAdd;
    const onAddPlace = vi.fn(() => new Promise((resolve) => {
      resolveAdd = resolve;
    }));
    render(<SearchBox dayId="Day 4" onAddPlace={onAddPlace} t={theme} />);

    const input = screen.getByRole('combobox', { name: '搜尋並新增 Day 4 景點' });
    input.focus();
    setQuery(input, '台北');
    const option = await screen.findByRole('option', { name: '台北車站' });

    let pointerDownResult;
    act(() => {
      pointerDownResult = fireEvent.pointerDown(option);
      fireEvent.click(option);
    });

    expect(pointerDownResult).toBe(false);
    await waitFor(() => expect(onAddPlace).toHaveBeenCalledTimes(1));
    expect(mapsMocks.getDetails).toHaveBeenCalledTimes(1);
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('正在加入 Day 4…');

    await act(async () => {
      resolveAdd(true);
    });
    await waitFor(() => expect(input).toHaveFocus());
    expect(input).not.toBeDisabled();
    expect(input).toHaveValue('');
    expect(onAddPlace).toHaveBeenCalledTimes(1);
  });
});
