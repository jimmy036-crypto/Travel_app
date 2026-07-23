import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CloneDemoDialog } from './CloneDemoDialog.jsx';

function renderDialog(props = {}) {
  const callbacks = {
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    onRepair: vi.fn(),
    onOpenTrip: vi.fn(),
    ...props,
  };
  return { ...render(<CloneDemoDialog open {...callbacks} />), callbacks };
}

describe('CloneDemoDialog', () => {
  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('explains the edited source, owner-only scope, exclusions, unverified places, and local recovery', () => {
    renderDialog();
    expect(screen.getByRole('dialog')).toHaveAccessibleName('複製成我的旅程');
    expect(screen.getByText('目前示範副本')).toBeVisible();
    expect(screen.getByText(/Owner-only/)).toBeVisible();
    expect(screen.getByText(/未驗證/)).toBeVisible();
    expect(screen.getByText(/費用與結算/)).toBeVisible();
    expect(screen.getByText(/同一裝置與瀏覽器/)).toBeVisible();
    expect(screen.getByText(/Clone 與「重設示範資料」是不同操作/)).toBeVisible();
  });

  it('confirms once under double-click', async () => {
    const user = userEvent.setup();
    const { callbacks } = renderDialog();
    await user.dblClick(screen.getByTestId('clone-demo-confirm'));
    expect(callbacks.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('supports cancel and Escape while idle', async () => {
    const user = userEvent.setup();
    const first = renderDialog();
    await user.click(screen.getByTestId('clone-demo-cancel'));
    expect(first.callbacks.onCancel).toHaveBeenCalledTimes(1);
    first.unmount();
    const second = renderDialog();
    await user.keyboard('{Escape}');
    expect(second.callbacks.onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables cancellation and duplicate confirmation while loading', async () => {
    const user = userEvent.setup();
    const { callbacks } = renderDialog({ status: 'loading' });
    expect(screen.getByRole('status')).toHaveTextContent('正在建立並驗證旅程');
    expect(screen.getByTestId('clone-demo-cancel')).toBeDisabled();
    expect(screen.queryByTestId('clone-demo-confirm')).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(callbacks.onCancel).not.toHaveBeenCalled();
  });

  it.each([
    ['ambiguous', '寫入結果不明'],
    ['error', '自訂錯誤'],
    ['repair-required', 'myTrips 連結需要修復'],
    ['success', 'myTrips 已驗證完成'],
  ])('renders the %s state', (status, message) => {
    renderDialog({ status, errorMessage: '自訂錯誤' });
    expect(screen.getByText(new RegExp(message))).toBeVisible();
  });

  it('offers repair and open-link actions only for repair state', async () => {
    const user = userEvent.setup();
    const { callbacks } = renderDialog({ status: 'repair-required' });
    await user.click(screen.getByTestId('clone-demo-repair'));
    await user.click(screen.getByTestId('clone-demo-open-trip'));
    expect(callbacks.onRepair).toHaveBeenCalledTimes(1);
    expect(callbacks.onOpenTrip).toHaveBeenCalledTimes(1);
  });

  it('traps focus and restores it on close', async () => {
    const user = userEvent.setup();
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const view = renderDialog();
    await waitFor(() => expect(screen.getByTestId('clone-demo-confirm')).toHaveFocus());
    await user.tab({ shift: true });
    expect(screen.getByTestId('clone-demo-cancel')).toHaveFocus();
    view.rerender(<CloneDemoDialog open={false} />);
    await waitFor(() => expect(trigger).toHaveFocus());
    trigger.remove();
  });

  it('is responsive and imports no Firebase or persistence boundary', () => {
    const { container } = renderDialog();
    expect(screen.getByRole('dialog')).toHaveClass('overflow-y-auto');
    expect(container.querySelector('section')).toHaveClass('max-w-xl');
  });
});
