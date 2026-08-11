import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DestinationSearch } from './UIComponents.jsx';

const mapsMocks = vi.hoisted(() => ({
  fetchAutocompleteSuggestions: vi.fn(),
  fetchFields: vi.fn(),
}));

const createPrediction = (placeId = 'tokyo', description = '日本東京都') => {
  const place = {
    location: null,
    fetchFields: (...args) => mapsMocks.fetchFields(place, ...args),
  };
  return {
    placeId,
    text: { toString: () => description },
    toPlace: () => place,
  };
};

vi.mock('@vis.gl/react-google-maps', () => ({
  useMap: () => null,
  useMapsLibrary: () => ({
    AutocompleteSessionToken: class {},
    AutocompleteSuggestion: {
      fetchAutocompleteSuggestions(...args) {
        return mapsMocks.fetchAutocompleteSuggestions(...args);
      },
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
    mapsMocks.fetchAutocompleteSuggestions.mockReset();
    mapsMocks.fetchFields.mockReset();
    mapsMocks.fetchAutocompleteSuggestions.mockResolvedValue({
      suggestions: [{ placePrediction: createPrediction() }],
    });
    mapsMocks.fetchFields.mockImplementation(async (place) => {
      place.location = {
        lat: () => 35.6762,
        lng: () => 139.6503,
      };
    });
  });

  it('selects on pointerdown before blur can remove the option', async () => {
    const events = [];
    const onChange = vi.fn((text, coordinates) => {
      events.push(coordinates ? 'onChange coordinates' : `onChange text:${text}`);
    });
    mapsMocks.fetchFields.mockImplementation(async (place) => {
      events.push('fetchFields start');
      place.location = {
        lat: () => 35.6762,
        lng: () => 139.6503,
      };
      events.push('fetchFields complete');
    });

    render(<DestinationSearch value="東京" onChange={onChange} t={theme} />);

    await waitFor(() => expect(screen.getByRole('option', { name: '日本東京都' })).toBeVisible(), {
      timeout: 1_000,
    });
    expect(mapsMocks.fetchAutocompleteSuggestions).toHaveBeenCalledWith(
      expect.objectContaining({
        input: '東京',
        includedPrimaryTypes: ['(regions)'],
        language: 'zh-TW',
        sessionToken: expect.anything(),
      }),
    );
    const option = screen.getByRole('option', { name: '日本東京都' });
    option.addEventListener('pointerdown', () => events.push('pointerdown'));

    expect(fireEvent.pointerDown(option)).toBe(false);

    await waitFor(() => expect(events).toEqual([
      'pointerdown',
      'fetchFields start',
      'fetchFields complete',
      'onChange coordinates',
    ]));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('does not wait for click after a mobile pointer selection', async () => {
    const onChange = vi.fn();
    render(<DestinationSearch value="東京" onChange={onChange} t={theme} />);

    const input = screen.getByRole('combobox');
    const option = await screen.findByRole('option', { name: '日本東京都' });

    // Mobile Safari may blur the input with a null relatedTarget and suppress
    // click after a prevented pointerdown. Selection must already be complete.
    expect(fireEvent.pointerDown(option)).toBe(false);

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(
      '日本東京都',
      { lat: 35.6762, lng: 139.6503 },
    ));
    expect(input).toHaveValue('日本東京都');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('supports one keyboard selection and exposes loading feedback', async () => {
    let resolveDetails;
    mapsMocks.fetchFields.mockImplementation((place) => new Promise((resolve) => {
      resolveDetails = () => {
        place.location = { lat: () => 35.6762, lng: () => 139.6503 };
        resolve();
      };
    }));
    const onChange = vi.fn();
    render(<DestinationSearch value="東京" onChange={onChange} t={theme} />);

    const input = screen.getByRole('combobox');
    await screen.findByRole('option', { name: '日本東京都' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByRole('status')).toHaveTextContent('正在取得地點資料');
    expect(input).toHaveValue('日本東京都');
    resolveDetails();
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(
      '日本東京都',
      { lat: 35.6762, lng: 139.6503 },
    ));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('rejects a stale details callback after the user starts a newer query', async () => {
    let resolveStaleDetails;
    mapsMocks.fetchFields.mockImplementation((place) => new Promise((resolve) => {
      resolveStaleDetails = () => {
        place.location = { lat: () => 35.6762, lng: () => 139.6503 };
        resolve();
      };
    }));
    const onChange = vi.fn();
    render(<DestinationSearch value="東京" onChange={onChange} t={theme} />);

    const input = screen.getByRole('combobox');
    const option = await screen.findByRole('option', { name: '日本東京都' });
    fireEvent.click(option);
    fireEvent.change(input, { target: { value: '大阪' } });
    resolveStaleDetails();

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange).toHaveBeenLastCalledWith('大阪', null);
    expect(input).toHaveValue('大阪');
  });

  it('keeps the selected text recoverable and explains a details failure', async () => {
    mapsMocks.fetchFields.mockRejectedValue(new Error('ZERO_RESULTS'));
    const onChange = vi.fn();
    render(<DestinationSearch value="東京" onChange={onChange} t={theme} />);

    fireEvent.click(await screen.findByRole('option', { name: '日本東京都' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('無法取得此目的地的座標');
    expect(screen.getByRole('combobox')).toHaveValue('日本東京都');
    expect(onChange).toHaveBeenCalledWith('日本東京都', null);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('explains an autocomplete request failure instead of silently hiding the dropdown', async () => {
    mapsMocks.fetchAutocompleteSuggestions.mockRejectedValue(new Error('REQUEST_DENIED'));
    render(<DestinationSearch value="東京" onChange={vi.fn()} t={theme} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('無法載入地點建議');
    expect(screen.getByRole('combobox')).toHaveValue('東京');
  });
});
