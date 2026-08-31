import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DeleteTripDialog } from './DeleteTripDialog.jsx';

const defaultProps = {
  open: true,
  tripTitle: '沖繩五日遊',
  isOnline: true,
  busy: false,
  error: '',
  onConfirm: vi.fn(),
  onClose: vi.fn(),
};

describe('DeleteTripDialog', () => {
  it('does not render while closed', () => {
    render(<DeleteTripDialog {...defaultProps} open={false} />);

    expect(screen.queryByTestId('delete-trip-dialog')).not.toBeInTheDocument();
  });

  it('describes the complete destructive scope with dialog semantics', async () => {
    render(<DeleteTripDialog {...defaultProps} />);

    const dialog = screen.getByRole('dialog', { name: '永久刪除整趟旅程' });
    expect(dialog).toHaveAttribute('aria-describedby', 'delete-trip-dialog-description');
    expect(screen.getByText(/所有旅伴都會失去/)).toHaveTextContent('沖繩五日遊');
    expect(screen.getByText(/所有雲端行程、地圖地點與共享清單/)).toBeInTheDocument();
    expect(screen.getByText(/所有雲端票券、票券附件與相關檔案/)).toBeInTheDocument();
    expect(screen.getByText(/所有雲端記帳、分帳、結算與預算資料/)).toBeInTheDocument();
    expect(screen.getByText(/所有成員的雲端存取權與邀請連結/)).toBeInTheDocument();

    await waitFor(() => expect(screen.getByTestId('delete-trip-close')).toHaveFocus());
  });

  it('requires the exact full title before submitting once', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<DeleteTripDialog {...defaultProps} onConfirm={onConfirm} />);

    const input = screen.getByLabelText('輸入完整旅程名稱「沖繩五日遊」以確認');
    const confirmButton = screen.getByRole('button', { name: '永久刪除整趟旅程' });
    expect(confirmButton).toBeDisabled();

    await user.type(input, '沖繩五日遊 ');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(confirmButton).toBeDisabled();

    await user.clear(input);
    await user.type(input, '沖繩五日遊');
    expect(confirmButton).toBeEnabled();
    await user.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('blocks deletion while offline and keeps the reason visible', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<DeleteTripDialog {...defaultProps} isOnline={false} onConfirm={onConfirm} />);

    await user.type(screen.getByTestId('delete-trip-confirmation'), '沖繩五日遊');
    expect(screen.getByRole('status')).toHaveTextContent('目前離線');
    expect(screen.getByTestId('delete-trip-confirm')).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('locks close actions while busy and exposes a retryable error', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <DeleteTripDialog
        {...defaultProps}
        busy
        error="刪除尚未完成，請再試一次。"
        onClose={onClose}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('刪除尚未完成，請再試一次。');
    expect(screen.getByTestId('delete-trip-confirm')).toBeDisabled();
    expect(screen.getByTestId('delete-trip-close')).toBeDisabled();
    expect(screen.getByTestId('delete-trip-cancel')).toBeDisabled();
    await waitFor(() => expect(screen.getByTestId('delete-trip-busy-status')).toHaveFocus());
    await user.click(screen.getByTestId('delete-trip-close'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('resets typed confirmation when the target trip changes', async () => {
    const user = userEvent.setup();
    const view = render(<DeleteTripDialog {...defaultProps} />);
    const input = screen.getByTestId('delete-trip-confirmation');
    await user.type(input, '沖繩五日遊');
    expect(input).toHaveValue('沖繩五日遊');

    view.rerender(<DeleteTripDialog {...defaultProps} tripTitle="台北三日遊" />);
    expect(screen.getByTestId('delete-trip-confirmation')).toHaveValue('');
    expect(screen.getByTestId('delete-trip-confirm')).toBeDisabled();
  });
});
