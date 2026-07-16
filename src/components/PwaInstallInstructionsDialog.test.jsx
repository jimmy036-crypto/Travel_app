import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PwaInstallInstructionsDialog } from './PwaInstallInstructionsDialog.jsx';

describe('PwaInstallInstructionsDialog', () => {
  let originalOverflow;

  beforeEach(() => {
    originalOverflow = document.body.style.overflow;
  });

  afterEach(() => {
    document.body.style.overflow = originalOverflow;
    vi.restoreAllMocks();
  });

  it('DIALOG-01 does not render when closed', () => {
    render(<PwaInstallInstructionsDialog open={false} platform="ios" browser="safari" onClose={() => {}} />);

    expect(screen.queryByTestId('pwa-install-instructions')).not.toBeInTheDocument();
  });

  it('DIALOG-02 shows complete iOS Safari steps', () => {
    render(<PwaInstallInstructionsDialog open platform="ios" browser="safari" onClose={() => {}} />);

    expect(screen.getByTestId('pwa-install-instructions-title')).toHaveTextContent('將「智の旅行」加入主畫面');
    expect(screen.getByText('加入後可像一般 App 一樣從主畫面開啟，並使用已支援的離線功能。')).toBeInTheDocument();
    expect(screen.getByTestId('pwa-install-ios-safari-steps')).toHaveTextContent('點擊 Safari 工具列的「分享」按鈕');
    expect(screen.getByTestId('pwa-install-ios-safari-steps')).toHaveTextContent('向下捲動並選擇「加入主畫面」');
    expect(screen.getByTestId('pwa-install-ios-safari-steps')).toHaveTextContent('若看到「以網頁 App 開啟」，保持開啟');
    expect(screen.getByTestId('pwa-install-ios-safari-steps')).toHaveTextContent('點擊右上角的「加入」');
    expect(screen.getByText('若沒有看到「加入主畫面」，請在分享選單底部選擇「編輯動作」並加入該操作。')).toBeInTheDocument();
  });

  it('DIALOG-03 does not show the Safari reminder for iOS Safari', () => {
    render(<PwaInstallInstructionsDialog open platform="ios" browser="safari" onClose={() => {}} />);

    expect(screen.queryByTestId('pwa-install-open-in-safari-note')).not.toBeInTheDocument();
  });

  it('DIALOG-04 shows the Safari reminder for non-Safari iOS browsers', () => {
    render(<PwaInstallInstructionsDialog open platform="ios" browser="chromium" onClose={() => {}} />);

    expect(screen.getByTestId('pwa-install-open-in-safari-note')).toHaveTextContent('請先使用 Safari 開啟此頁，再依照以下步驟操作。');
  });

  it('DIALOG-05 calls onClose once from the close button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<PwaInstallInstructionsDialog open platform="ios" browser="safari" onClose={onClose} />);

    await user.click(screen.getByTestId('pwa-install-instructions-close'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('DIALOG-06 calls onClose from Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<PwaInstallInstructionsDialog open platform="ios" browser="safari" onClose={onClose} />);

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('DIALOG-07 ignores non-Escape keys', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<PwaInstallInstructionsDialog open platform="ios" browser="safari" onClose={onClose} />);

    await user.keyboard('{Enter}');

    expect(onClose).not.toHaveBeenCalled();
  });

  it('DIALOG-08 locks body scroll while open', () => {
    render(<PwaInstallInstructionsDialog open platform="ios" browser="safari" onClose={() => {}} />);

    expect(document.body.style.overflow).toBe('hidden');
  });

  it('DIALOG-09 restores body overflow after close and unmount', () => {
    document.body.style.overflow = 'auto';
    const { rerender, unmount } = render(
      <PwaInstallInstructionsDialog open platform="ios" browser="safari" onClose={() => {}} />,
    );

    rerender(<PwaInstallInstructionsDialog open={false} platform="ios" browser="safari" onClose={() => {}} />);
    expect(document.body.style.overflow).toBe('auto');

    rerender(<PwaInstallInstructionsDialog open platform="ios" browser="safari" onClose={() => {}} />);
    unmount();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('DIALOG-10 has dialog role, heading, and aria-modal', () => {
    render(<PwaInstallInstructionsDialog open platform="ios" browser="safari" onClose={() => {}} />);

    const dialog = screen.getByRole('dialog', { name: '將「智の旅行」加入主畫面' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('heading', { name: '將「智の旅行」加入主畫面' })).toBeInTheDocument();
  });

  it('DIALOG-11 focuses the close button after opening', async () => {
    render(<PwaInstallInstructionsDialog open platform="ios" browser="safari" onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByTestId('pwa-install-instructions-close')).toHaveFocus();
    });
  });

  it('DIALOG-12 does not render a direct iOS install button', () => {
    render(<PwaInstallInstructionsDialog open platform="ios" browser="safari" onClose={() => {}} />);

    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByTestId('pwa-install-instructions-close')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /立即安裝|安裝 App|加入$/ })).not.toBeInTheDocument();
  });
});
