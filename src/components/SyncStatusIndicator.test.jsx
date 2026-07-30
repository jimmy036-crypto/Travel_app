import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SyncStatusIndicator } from './SyncStatusIndicator';

describe('SyncStatusIndicator', () => {
  it('renders default idle status correctly', () => {
    render(<SyncStatusIndicator status="idle" />);
    expect(screen.getByText('正在連線...')).toBeInTheDocument();
  });

  it('UT-08: renders offline status correctly with offline label and style', () => {
    render(<SyncStatusIndicator status="offline" />);
    const statusDot = screen.getByTestId('sync-status-dot');

    expect(screen.getByText('離線')).toBeInTheDocument();
    expect(statusDot).toHaveClass('bg-slate-500');
  });

  it('reserves a fixed label width by default', () => {
    render(<SyncStatusIndicator status="saved" />);
    const indicator = screen.getByTestId('sync-status-indicator');

    expect(indicator).toHaveClass('min-w-24');
    expect(indicator).not.toHaveAttribute('data-compact');
    expect(screen.getByText('已同步')).not.toHaveClass('sr-only');
  });

  it('drops the visible label and the reserved width when compact', () => {
    render(<SyncStatusIndicator status="saved" compact />);
    const indicator = screen.getByTestId('sync-status-indicator');

    expect(indicator).toHaveAttribute('data-compact', 'true');
    expect(indicator).toHaveClass('w-7');
    expect(indicator).not.toHaveClass('min-w-24');
    expect(screen.getByTestId('sync-status-dot')).toHaveClass('bg-emerald-500');
  });

  it('keeps the status readable by assistive tech and on hover when compact', () => {
    render(<SyncStatusIndicator status="saved" compact />);
    const indicator = screen.getByTestId('sync-status-indicator');

    expect(indicator).toHaveAttribute('title', '已同步');
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
