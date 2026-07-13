import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { OfflineBanner } from './OfflineBanner';

describe('OfflineBanner', () => {
  it('UT-06: should not render when isOnline is true', () => {
    const { container } = render(<OfflineBanner isOnline={true} />);
    expect(screen.queryByTestId('offline-banner')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('UT-07: should render with correct accessibility attributes when isOnline is false', () => {
    render(<OfflineBanner isOnline={false} />);
    const banner = screen.getByTestId('offline-banner');
    
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveAttribute('role', 'status');
    expect(banner).toHaveAttribute('aria-live', 'polite');
    
    // 文字不只依賴顏色，應有明確的文字提示
    expect(banner).toHaveTextContent(/目前離線|變更可能尚未同步/);
  });
});
