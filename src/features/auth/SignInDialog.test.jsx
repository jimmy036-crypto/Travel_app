import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SignInDialog } from './SignInDialog.jsx';

describe('SignInDialog', () => {
  it('does not add a dialog while closed', () => {
    render(<SignInDialog open={false} />);

    expect(screen.queryByTestId('sign-in-dialog')).not.toBeInTheDocument();
  });

  it('explains invite redemption and exposes sign-in and close actions', async () => {
    const user = userEvent.setup();
    const onSignIn = vi.fn();
    const onClose = vi.fn();
    render(
      <SignInDialog
        open
        reason="invite"
        busy={false}
        error="請重試"
        onSignIn={onSignIn}
        onClose={onClose}
      />,
    );

    expect(screen.getByRole('dialog', { name: '使用 Google 帳號繼續' })).toBeInTheDocument();
    expect(screen.getByText(/登入完成後會自動驗證邀請並加入旅程/)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('請重試');

    await user.click(screen.getByRole('button', { name: '使用 Google 登入' }));
    await user.click(screen.getByRole('button', { name: '關閉登入視窗' }));
    expect(onSignIn).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
