import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DemoTripEntryCard } from './DemoTripEntryCard.jsx';

describe('DemoTripEntryCard', () => {
  it('shows the title, mode, read-only, and local-only explanation', () => {
    render(<DemoTripEntryCard onOpenDemo={vi.fn()} />);
    expect(screen.getByTestId('demo-trip-entry-card')).toHaveTextContent('先看看東京三日範例');
    expect(screen.getByTestId('demo-trip-entry-card')).toHaveTextContent('示範模式');
    expect(screen.getByTestId('demo-trip-entry-readonly')).toHaveTextContent('唯讀');
    expect(screen.getByTestId('demo-trip-entry-local-only')).toHaveTextContent('不會同步');
    expect(screen.getByTestId('demo-trip-entry-card')).toHaveTextContent('不會建立雲端旅程');
  });

  it('calls onOpenDemo once only after the user clicks', async () => {
    const user = userEvent.setup();
    const onOpenDemo = vi.fn();
    render(<DemoTripEntryCard onOpenDemo={onOpenDemo} />);
    expect(onOpenDemo).not.toHaveBeenCalled();
    await user.click(screen.getByTestId('demo-trip-entry-open'));
    expect(onOpenDemo).toHaveBeenCalledTimes(1);
  });

  it('uses an accessible button and no anchor or external image', () => {
    const { container } = render(<DemoTripEntryCard onOpenDemo={vi.fn()} />);
    const button = screen.getByRole('button', { name: '查看東京三日示範旅程' });
    expect(button).toHaveAttribute('type', 'button');
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('does not read or write localStorage', async () => {
    const user = userEvent.setup();
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    render(<DemoTripEntryCard onOpenDemo={vi.fn()} />);
    await user.click(screen.getByTestId('demo-trip-entry-open'));
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    getItem.mockRestore();
    setItem.mockRestore();
  });

  it('has no Firebase, URL, or persistence imports', () => {
    const source = readFileSync(resolve('src/features/onboarding/DemoTripEntryCard.jsx'), 'utf8');
    expect(source).not.toMatch(/firebase|localStorage|sessionStorage|window\.location|history\.|offlineTripCache/i);
  });

  it('contains long text and mobile width without horizontal overflow', () => {
    render(<DemoTripEntryCard onOpenDemo={vi.fn()} />);
    expect(screen.getByTestId('demo-trip-entry-card')).toHaveClass('w-full', 'max-w-2xl', 'overflow-x-hidden');
    expect(screen.getByText(/使用內建唯讀資料/)).toHaveClass('break-words');
  });
});
