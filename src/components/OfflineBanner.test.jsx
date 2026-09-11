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
    expect(banner).toHaveTextContent('目前離線');
    expect(banner).toHaveTextContent('無法確認雲端同步狀態');
    expect(banner).toHaveAttribute('data-mode', 'cloud');
  });

  it('describes local example limitations without claiming cloud sync or persistence', () => {
    render(<OfflineBanner isOnline={false} mode="local-example" />);

    const banner = screen.getByTestId('offline-banner');
    expect(banner).toHaveTextContent('示範旅程仍可使用');
    expect(banner).not.toHaveTextContent(/同步|已保存|已儲存/);
  });

  it.each([
    ['lobby', '雲端旅程操作暫時不可用'],
    ['offline-preview', '此裝置的唯讀快取'],
  ])('uses the %s data-mode copy', (mode, expectedCopy) => {
    render(<OfflineBanner isOnline={false} mode={mode} />);

    const banner = screen.getByTestId('offline-banner');
    expect(banner).toHaveAttribute('data-mode', mode);
    expect(banner).toHaveTextContent(expectedCopy);
  });

  it('sits above mobile trip navigation and retains safe-area padding when requested', () => {
    render(<OfflineBanner isOnline={false} aboveNavigation />);

    expect(screen.getByTestId('offline-banner')).toHaveClass(
      'bottom-[calc(4.5rem+max(env(safe-area-inset-bottom),0.5rem))]',
      'md:bottom-0',
      'pb-[max(0.75rem,env(safe-area-inset-bottom))]',
    );
  });
});
