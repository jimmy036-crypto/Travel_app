import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { CityPicker } from './CityPicker.jsx';

const maps = vi.hoisted(() => ({ library: null }));
vi.mock('@vis.gl/react-google-maps', () => ({ useMapsLibrary: () => maps.library, useMap: () => null }));
const kyoto = { cityId: 'kyoto', city: '京都', country: '日本', cityLat: 35, cityLng: 135 };
function Picker({ initial = {}, onChange = () => {}, ...props }) {
  const [value, setValue] = useState(initial);
  return <CityPicker label="城市／地區" value={value} onChange={(next) => { setValue(next); onChange(next); }} cities={[kyoto]} {...props} />;
}
beforeEach(() => { maps.library = null; });

it('reuses an identified personal city and clears identity when its text is edited', () => {
  const onChange = vi.fn();
  render(<Picker onChange={onChange} />);
  fireEvent.focus(screen.getByLabelText('城市／地區'));
  fireEvent.click(screen.getByRole('option', { name: '京都・日本' }));
  expect(onChange).toHaveBeenLastCalledWith(kyoto);
  fireEvent.change(screen.getByLabelText('城市／地區'), { target: { value: '其他京都' } });
  expect(onChange).toHaveBeenLastCalledWith({ city: '其他京都', cityId: '', country: '', cityLat: null, cityLng: null });
  expect(screen.getByText(/尚未指定城市/)).toBeInTheDocument();
});

it('retrieves identity, country and coordinates from a Places choice', async () => {
  const fetchFields = vi.fn().mockResolvedValue(undefined);
  maps.library = {
    AutocompleteSessionToken: class {},
    AutocompleteSuggestion: { fetchAutocompleteSuggestions: vi.fn().mockResolvedValue({ suggestions: [{ placePrediction: { placeId: 'osaka', text: { toString: () => '日本大阪府大阪市' }, toPlace: () => ({ fetchFields, location: { lat: () => 34.7, lng: () => 135.5 }, displayName: '大阪市', addressComponents: [{ types: ['country'], longText: '日本' }] }) } }] }) },
  };
  const onChange = vi.fn();
  render(<Picker onChange={onChange} />);
  fireEvent.change(screen.getByLabelText('城市／地區'), { target: { value: '大阪' } });
  fireEvent.click(await screen.findByRole('option', { name: '日本大阪府大阪市' }));
  await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ cityId: 'osaka', city: '大阪市', country: '日本', cityLat: 34.7, cityLng: 135.5 }));
  expect(fetchFields).toHaveBeenCalledWith({ fields: ['location', 'addressComponents', 'displayName'] });
  expect(maps.library.AutocompleteSuggestion.fetchAutocompleteSuggestions).toHaveBeenCalledWith(expect.objectContaining({ includedPrimaryTypes: ['(cities)'] }));
});

it('does not replace newer input with late place details', async () => {
  let finish;
  maps.library = {
    AutocompleteSessionToken: class {},
    AutocompleteSuggestion: { fetchAutocompleteSuggestions: vi.fn().mockResolvedValue({ suggestions: [{ placePrediction: { placeId: 'old', text: 'Old city', toPlace: () => ({ fetchFields: () => new Promise((resolve) => { finish = resolve; }), location: { lat: () => 35, lng: () => 135 }, displayName: 'Old', addressComponents: [{ types: ['country'], longText: 'Japan' }] }) } }] }) },
  };
  render(<Picker />);
  fireEvent.change(screen.getByLabelText('城市／地區'), { target: { value: 'Old' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Old city' }));
  fireEvent.change(screen.getByLabelText('城市／地區'), { target: { value: 'New' } });
  finish();
  await waitFor(() => expect(screen.getByLabelText('城市／地區')).toHaveValue('New'));
});
