import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import FirstRunWelcomeDialog from './FirstRunWelcomeDialog.jsx';

const renderDialog = (props = {}) => {
  const callbacks = {
    onOpenDemo: vi.fn(),
    onCreateTrip: vi.fn(),
    onSkip: vi.fn(),
    ...props,
  };
  const view = render(<FirstRunWelcomeDialog t={(value) => value} {...callbacks} />);
  return { ...view, callbacks };
};

const goToLastStep = async (user) => {
  await user.click(screen.getByTestId('first-run-next'));
  await user.click(screen.getByTestId('first-run-next'));
  await user.click(screen.getByTestId('first-run-next'));
};

describe('FirstRunWelcomeDialog', () => {
  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('renders an accessible dialog at step one with progress and no back action', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'first-run-title');
    expect(screen.getByText('歡迎使用智能旅行管理')).toBeInTheDocument();
    expect(screen.getByText('第 1 / 4 步')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    expect(screen.queryByTestId('first-run-back')).not.toBeInTheDocument();
  });

  it('falls back to step one for an invalid initial step and accepts a valid step', () => {
    const first = renderDialog({ initialStep: 9 });
    expect(screen.getByText('歡迎使用智能旅行管理')).toBeInTheDocument();
    first.unmount();
    renderDialog({ initialStep: 2 });
    expect(screen.getByText('建立自己的旅程')).toBeInTheDocument();
    expect(screen.getByText('第 3 / 4 步')).toBeInTheDocument();
  });

  it('moves through all four steps and supports going back without completing', async () => {
    const user = userEvent.setup();
    const { callbacks } = renderDialog();
    await user.click(screen.getByTestId('first-run-next'));
    expect(screen.getByText('先用東京範例快速了解')).toBeInTheDocument();
    await user.click(screen.getByTestId('first-run-back'));
    expect(screen.getByText('歡迎使用智能旅行管理')).toBeInTheDocument();
    await goToLastStep(user);
    expect(screen.getByText('多人協作與離線查看')).toBeInTheDocument();
    expect(screen.getByText('第 4 / 4 步')).toBeInTheDocument();
    expect(callbacks.onOpenDemo).not.toHaveBeenCalled();
    expect(callbacks.onCreateTrip).not.toHaveBeenCalled();
    expect(callbacks.onSkip).not.toHaveBeenCalled();
  });

  it('shows completion actions only on step four and has no clone action or anchor', async () => {
    const user = userEvent.setup();
    renderDialog();
    expect(screen.queryByTestId('first-run-open-demo')).not.toBeInTheDocument();
    expect(screen.queryByTestId('first-run-create-trip')).not.toBeInTheDocument();
    await goToLastStep(user);
    expect(screen.getByTestId('first-run-open-demo')).toHaveTextContent('查看東京示範');
    expect(screen.getByTestId('first-run-create-trip')).toHaveTextContent('建立我的第一個旅程');
    expect(screen.getByTestId('first-run-skip')).toHaveTextContent('略過介紹');
    expect(screen.queryByText(/複製/)).not.toBeInTheDocument();
    expect(document.querySelector('a')).not.toBeInTheDocument();
  });

  it.each([
    ['first-run-open-demo', 'onOpenDemo'],
    ['first-run-create-trip', 'onCreateTrip'],
    ['first-run-skip', 'onSkip'],
  ])('calls %s exactly once', async (testId, callbackName) => {
    const user = userEvent.setup();
    const { callbacks } = renderDialog();
    await goToLastStep(user);
    await user.dblClick(screen.getByTestId(testId));
    expect(callbacks[callbackName]).toHaveBeenCalledTimes(1);
    for (const [name, callback] of Object.entries(callbacks)) {
      if (name !== callbackName && name.startsWith('on')) expect(callback).not.toHaveBeenCalled();
    }
  });

  it('does not invoke callbacks automatically or while navigating', async () => {
    const user = userEvent.setup();
    const { callbacks } = renderDialog();
    await user.click(screen.getByTestId('first-run-next'));
    await user.click(screen.getByTestId('first-run-back'));
    expect(callbacks.onOpenDemo).not.toHaveBeenCalled();
    expect(callbacks.onCreateTrip).not.toHaveBeenCalled();
    expect(callbacks.onSkip).not.toHaveBeenCalled();
  });

  it('treats Escape as skip exactly once and ignores backdrop clicks', async () => {
    const user = userEvent.setup();
    const { callbacks } = renderDialog();
    fireEvent.click(screen.getByTestId('first-run-welcome-dialog'));
    expect(callbacks.onSkip).not.toHaveBeenCalled();
    await user.keyboard('{Escape}{Escape}');
    expect(callbacks.onSkip).toHaveBeenCalledTimes(1);
  });

  it('focuses the first action and traps Tab and Shift+Tab', async () => {
    const user = userEvent.setup();
    renderDialog();
    const next = screen.getByTestId('first-run-next');
    const skip = screen.getByTestId('first-run-skip');
    expect(next).toHaveFocus();
    await user.tab({ shift: true });
    expect(skip).toHaveFocus();
    await user.tab();
    expect(next).toHaveFocus();
  });

  it('locks body scrolling and restores the previous value on unmount', () => {
    document.body.style.overflow = 'scroll';
    const { unmount } = renderDialog();
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('scroll');
  });

  it('uses wrapping, mobile height, safe-area, and minimum button sizing', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog');
    const panel = dialog.querySelector('section');
    expect(dialog).toHaveClass('overflow-x-hidden');
    expect(dialog).toHaveClass('pt-[max(0.75rem,env(safe-area-inset-top))]');
    expect(panel).toHaveClass('max-h-[calc(100dvh-1.5rem)]');
    expect(screen.getByTestId('first-run-step')).toHaveClass('break-words');
    expect(screen.getByTestId('first-run-next')).toHaveClass('min-h-11');
  });

  it('uses accurate offline and install wording', () => {
    renderDialog({ initialStep: 3 });
    const description = screen.getByText(/最近開啟的旅程/);
    expect(description).toHaveTextContent('唯讀離線預覽');
    expect(description).toHaveTextContent('在瀏覽器支援時');
    expect(description).not.toHaveTextContent('離線編輯');
  });

  it('does not access localStorage or change the URL', async () => {
    const user = userEvent.setup();
    const storageGet = vi.spyOn(Storage.prototype, 'getItem');
    const storageSet = vi.spyOn(Storage.prototype, 'setItem');
    const before = window.location.href;
    renderDialog();
    await user.click(screen.getByTestId('first-run-next'));
    expect(storageGet).not.toHaveBeenCalled();
    expect(storageSet).not.toHaveBeenCalled();
    expect(window.location.href).toBe(before);
    storageGet.mockRestore();
    storageSet.mockRestore();
  });
});
