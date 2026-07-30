import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { QaDebugBadge } from './QaDebugBadge.jsx';

describe('QaDebugBadge', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('renders nothing by default', () => {
    window.history.replaceState(null, '', '/?room=some-room');
    render(<QaDebugBadge />);
    expect(screen.queryByTestId('qa-debug-badge')).not.toBeInTheDocument();
  });

  it('shows branch/sha/build-time only when ?qaDebug=1 is present', () => {
    window.history.replaceState(null, '', '/?qaDebug=1');
    render(<QaDebugBadge />);
    expect(screen.getByTestId('qa-debug-badge')).toBeInTheDocument();
    expect(screen.getByTestId('qa-debug-branch')).toBeInTheDocument();
    expect(screen.getByTestId('qa-debug-sha')).toBeInTheDocument();
    expect(screen.getByTestId('qa-debug-build-time')).toBeInTheDocument();
  });

  it('dismisses on close and does not reappear until reload', () => {
    window.history.replaceState(null, '', '/?qaDebug=1');
    render(<QaDebugBadge />);
    fireEvent.click(screen.getByRole('button', { name: '關閉版本標記' }));
    expect(screen.queryByTestId('qa-debug-badge')).not.toBeInTheDocument();
  });
});
