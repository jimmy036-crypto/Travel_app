import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { PassportReview } from './PassportReview.jsx';

const memories = {
  a: { archived: true, title: '春天', startDate: '2025-01-01', note: '春天的感想', firsts: { rail: '第一次搭新幹線' }, visits: { p: { city: '京都', cityId: 'kyoto', status: 'visited' } } },
  b: { archived: true, title: '冬天', startDate: '2026-01-01', note: '冬天的感想', visits: { p: { city: '京都', cityId: 'kyoto', status: 'visited' } } },
};

it('opens city history, collection reading and memory reading according to stamp target', () => {
  const onOpenMemory = vi.fn(); const onOpenCity = vi.fn(); const onOpenCollection = vi.fn();
  render(<PassportReview memories={memories} collections={{ c: { title: '鐵道', items: { i: { roomId: 'a', visitId: 'p' } } } }} onOpenMemory={onOpenMemory} onOpenCity={onOpenCity} onOpenCollection={onOpenCollection} />);
  fireEvent.click(screen.getByRole('button', { name: /再次相遇.*重遊 京都/ }));
  fireEvent.click(screen.getByRole('button', { name: /個人收藏.*鐵道/ }));
  fireEvent.click(screen.getByRole('button', { name: /首次體驗.*第一次搭新幹線/ }));
  expect(onOpenCity).toHaveBeenCalledWith('kyoto');
  expect(onOpenCollection).toHaveBeenCalledWith('c');
  expect(onOpenMemory).toHaveBeenCalledWith('a');
});

it('lets the selected annual memory control the representative photo and quote', () => {
  const highlight = vi.fn(); const year = vi.fn();
  render(<PassportReview memories={memories} selectedYear="2025" onYearChange={year} selectedHighlight="a" onHighlightChange={highlight} renderCover={(memory) => <img alt={`${memory.title}代表照片`} src="blob:private" />} />);
  expect(screen.getByAltText('春天代表照片')).toBeInTheDocument();
  expect(screen.getByText('春天的感想')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('回顧年份'), { target: { value: '2026' } });
  expect(year).toHaveBeenCalledWith('2026');
  fireEvent.change(screen.getByLabelText('年度代表回憶'), { target: { value: 'a' } });
  expect(highlight).toHaveBeenCalledWith('a');
});
