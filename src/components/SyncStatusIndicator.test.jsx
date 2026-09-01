import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SyncStatusIndicator } from './SyncStatusIndicator';

describe('SyncStatusIndicator', () => {
  it.each([
    ['idle', '正在連線...', ['border-slate-300', 'bg-slate-100/95', 'text-slate-700'], 'bg-slate-500'],
    ['saving', '正在同步...', ['border-amber-300', 'bg-amber-50/95', 'text-amber-900'], 'bg-amber-600'],
    ['saved', '已同步', ['border-emerald-300', 'bg-emerald-50/95', 'text-emerald-800'], 'bg-emerald-600'],
    ['remote-updated', '遠端已更新', ['border-blue-300', 'bg-blue-50/95', 'text-blue-800'], 'bg-blue-600'],
    ['error', '同步失敗', ['border-red-300', 'bg-red-50/95', 'text-red-800'], 'bg-red-600'],
    ['offline', '離線', ['border-slate-300', 'bg-slate-100/95', 'text-slate-700'], 'bg-slate-600'],
  ])('renders the %s light semantic treatment', (status, label, indicatorClasses, dotClass) => {
    render(<SyncStatusIndicator status={status} />);
    const indicator = screen.getByTestId('sync-status-indicator');

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(indicator).toHaveAttribute('data-theme', 'light');
    expect(indicator).toHaveClass(...indicatorClasses);
    expect(screen.getByTestId('sync-status-dot')).toHaveClass(dotClass);
  });

  it('uses the explicit dark semantic treatment when requested', () => {
    render(<SyncStatusIndicator status="saved" isLight={false} />);
    const indicator = screen.getByTestId('sync-status-indicator');

    expect(indicator).toHaveAttribute('data-theme', 'dark');
    expect(indicator).toHaveClass('border-emerald-700', 'bg-emerald-950/95', 'text-emerald-200');
    expect(screen.getByTestId('sync-status-dot')).toHaveClass('bg-emerald-300');
  });

  it.each(['idle', 'saving', 'saved', 'remote-updated', 'error', 'offline'])(
    'does not let the OS dark preference override the %s status theme',
    (status) => {
      const { rerender } = render(<SyncStatusIndicator status={status} />);
      expect(screen.getByTestId('sync-status-indicator').className).not.toContain('dark:');
      expect(screen.getByTestId('sync-status-dot').className).not.toContain('dark:');

      rerender(<SyncStatusIndicator status={status} isLight={false} />);
      expect(screen.getByTestId('sync-status-indicator').className).not.toContain('dark:');
      expect(screen.getByTestId('sync-status-dot').className).not.toContain('dark:');
    },
  );

  it('reserves a fixed label width by default', () => {
    render(<SyncStatusIndicator status="saved" />);
    const indicator = screen.getByTestId('sync-status-indicator');

    expect(indicator).toHaveClass('min-w-24');
    expect(indicator).toHaveClass('min-h-8', 'text-xs');
    expect(indicator).not.toHaveAttribute('data-compact');
    expect(screen.getByText('已同步')).not.toHaveClass('sr-only');
  });

  it('drops the visible label and the reserved width when compact', () => {
    render(<SyncStatusIndicator status="saved" compact />);
    const indicator = screen.getByTestId('sync-status-indicator');

    expect(indicator).toHaveAttribute('data-compact', 'true');
    expect(indicator).toHaveClass('h-8', 'w-8');
    expect(indicator).not.toHaveClass('min-w-24');
    expect(screen.getByTestId('sync-status-dot')).toHaveClass('bg-emerald-600');
  });

  it('keeps the status readable by assistive tech and on hover when compact', () => {
    render(<SyncStatusIndicator status="saved" compact />);
    const indicator = screen.getByTestId('sync-status-indicator');

    expect(indicator).toHaveAttribute('title', '已同步');
    expect(indicator).toHaveAttribute('role', 'status');
    expect(indicator).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('已同步')).toHaveClass('sr-only');
  });

  it.each([
    ['idle', '正在連線...'],
    ['saving', '正在同步...'],
    ['saved', '已同步'],
    ['remote-updated', '遠端已更新'],
    ['error', '同步失敗'],
    ['offline', '離線'],
  ])('announces %s in compact mode', (status, label) => {
    render(<SyncStatusIndicator status={status} compact />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
