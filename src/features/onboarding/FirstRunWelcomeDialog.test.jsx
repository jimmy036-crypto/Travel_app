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

const STEP_TITLES = [
  '歡迎使用智の旅行',
  '用適合裝置的方式規劃',
  '從地圖掌握移動順序',
  '集中管理票券與旅費',
  '先試範例，或建立自己的旅程',
];

const LAST_STEP_INDEX = STEP_TITLES.length - 1;

const goToLastStep = async (user) => {
  for (let index = 0; index < LAST_STEP_INDEX; index += 1) {
    await user.click(screen.getByTestId('first-run-next'));
  }
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
    expect(screen.getByText(STEP_TITLES[0])).toBeInTheDocument();
    expect(screen.getByText('第 1 / 5 步')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '5');
    expect(screen.queryByTestId('first-run-back')).not.toBeInTheDocument();
  });

  it('falls back to step one for an invalid initial step and accepts a valid step', () => {
    const first = renderDialog({ initialStep: 9 });
    expect(screen.getByText(STEP_TITLES[0])).toBeInTheDocument();
    first.unmount();
    renderDialog({ initialStep: 2 });
    expect(screen.getByText(STEP_TITLES[2])).toBeInTheDocument();
    expect(screen.getByText('第 3 / 5 步')).toBeInTheDocument();
  });

  it('moves through all five steps and supports going back without completing', async () => {
    const user = userEvent.setup();
    const { callbacks } = renderDialog();

    for (let index = 1; index < STEP_TITLES.length; index += 1) {
      await user.click(screen.getByTestId('first-run-next'));
      expect(screen.getByText(STEP_TITLES[index])).toBeInTheDocument();
      expect(screen.getByText(`第 ${index + 1} / 5 步`)).toBeInTheDocument();
    }

    await user.click(screen.getByTestId('first-run-back'));
    expect(screen.getByText(STEP_TITLES[LAST_STEP_INDEX - 1])).toBeInTheDocument();
    expect(callbacks.onOpenDemo).not.toHaveBeenCalled();
    expect(callbacks.onCreateTrip).not.toHaveBeenCalled();
    expect(callbacks.onSkip).not.toHaveBeenCalled();
  });

  it('teaches responsive planning, map order, tickets and expenses', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByTestId('first-run-next'));
    expect(screen.getByTestId('first-run-step')).toHaveTextContent('手機使用單日時間軸');
    expect(screen.getByTestId('first-run-step')).toHaveTextContent('桌面使用多日並排畫面');

    await user.click(screen.getByTestId('first-run-next'));
    expect(screen.getByTestId('first-run-step')).toHaveTextContent('地圖依當日順序顯示景點');

    await user.click(screen.getByTestId('first-run-next'));
    expect(screen.getByTestId('first-run-step')).toHaveTextContent('標記轉帳完成狀態');
  });

  it('shows completion actions only on the final step and has no clone action or anchor', async () => {
    const user = userEvent.setup();
    renderDialog();
    expect(screen.queryByTestId('first-run-open-demo')).not.toBeInTheDocument();
    expect(screen.queryByTestId('first-run-create-trip')).not.toBeInTheDocument();
    await goToLastStep(user);
    expect(screen.getByTestId('first-run-open-demo')).toHaveTextContent('東京三日自由行（範例）');
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

  it('describes the example trip as local-only without promising offline editing', () => {
    renderDialog({ initialStep: LAST_STEP_INDEX });
    const description = screen.getByText(/範例可編輯/);
    expect(description).toHaveTextContent('只保存在本機');
    expect(description).toHaveTextContent('正式旅程可分享即時協作');
    expect(description).not.toHaveTextContent('離線編輯');
  });

  it('does not overclaim offline editing or flawless iOS behaviour in any step', async () => {
    const user = userEvent.setup();
    renderDialog();
    const seen = [];

    for (let index = 0; index < STEP_TITLES.length; index += 1) {
      seen.push(screen.getByTestId('first-run-step').textContent || '');
      if (index < LAST_STEP_INDEX) await user.click(screen.getByTestId('first-run-next'));
    }

    const copy = seen.join('');
    expect(copy).not.toContain('離線編輯');
    expect(copy).not.toContain('完全離線');
    expect(copy).not.toContain('完美');
    expect(copy).not.toContain('iOS');
  });

  it('keeps 320px Traditional Chinese text wrapping inside the panel', () => {
    renderDialog({ initialStep: LAST_STEP_INDEX });
    const step = screen.getByTestId('first-run-step');
    expect(step).toHaveClass('min-w-0');
    expect(step).toHaveClass('break-words');
    expect(step.querySelector('h2')).toHaveClass('break-words');
    expect(step.querySelector('p[id$="-description"]')).toHaveClass('break-words');
    expect(screen.getByTestId('first-run-open-demo')).toHaveClass('min-h-11');
    expect(screen.getByTestId('first-run-create-trip')).toHaveClass('min-h-11');
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

  it('uses a distinct state-neutral replay contract', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const storageGet = vi.spyOn(Storage.prototype, 'getItem');
    const storageSet = vi.spyOn(Storage.prototype, 'setItem');
    renderDialog({ mode: 'replay', onClose });
    const dialog = screen.getByTestId('feature-introduction-dialog');
    expect(dialog).toHaveAttribute('data-mode', 'replay');
    expect(dialog).toHaveAccessibleName();
    expect(screen.queryByTestId('first-run-welcome-dialog')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('feature-introduction-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(storageGet).not.toHaveBeenCalled();
    expect(storageSet).not.toHaveBeenCalled();
    storageGet.mockRestore();
    storageSet.mockRestore();
  });

  it.each([
    ['feature-introduction-open-demo', 'onOpenDemo'],
    ['feature-introduction-create-trip', 'onCreateTrip'],
  ])('keeps replay completion action %s available without touching onboarding storage', async (testId, callback) => {
    const user = userEvent.setup();
    const storageSet = vi.spyOn(Storage.prototype, 'setItem');
    const view = renderDialog({ mode: 'replay', initialStep: LAST_STEP_INDEX });
    await user.click(screen.getByTestId(testId));
    expect(view.callbacks[callback]).toHaveBeenCalledTimes(1);
    expect(storageSet).not.toHaveBeenCalled();
    storageSet.mockRestore();
  });
});
