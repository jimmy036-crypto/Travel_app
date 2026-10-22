import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { FootprintsPage } from './FootprintsPage.jsx';
vi.mock('./FootprintsMap.jsx', () => ({ default: () => null }));
it('opens a city-only trip for optional detail without inventing attractions', () => {
  const edit = vi.fn(); const open = vi.fn();
  const city = { cityId: 'kyoto', city: '京都', country: '日本', cityLat: 35, cityLng: 135 };
  render(<FootprintsPage memories={{ a: { roomId: 'a', title: '京都散步', startDate: '2026-04-12', endDate: '2026-04-17', cities: { kyoto: city } } }} onEdit={edit} onOpenMemory={open} onCollectCity={vi.fn()} />);
  expect(screen.getByRole('button', { name: '京都 · 1 趟旅行' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '京都散步' })).toBeInTheDocument();
  expect(screen.getByText('城市已留下，景點可以慢慢補。')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '補上景點' }));
  expect(edit).toHaveBeenCalledWith('a', true);
  fireEvent.click(screen.getByRole('button', { name: '重溫這趟旅行' }));
  expect(open).toHaveBeenCalledWith('a');
});
