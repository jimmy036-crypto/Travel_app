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
});
