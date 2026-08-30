import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AccountSection } from './AccountSection.jsx';

describe('AccountSection', () => {
  it('shows a non-interactive status while Firebase checks the session', () => {
    render(<AccountSection loading />);

    expect(screen.getByTestId('account-loading')).toHaveTextContent('正在確認登入狀態');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('explains the signed-out boundary and starts Google sign-in', async () => {
    const user = userEvent.setup();
    const onSignIn = vi.fn();
    render(<AccountSection user={null} loading={false} busy={false} onSignIn={onSignIn} />);

    expect(screen.getByText(/登入後才能建立、加入及同步私人旅程/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '使用 Google 登入' }));
    expect(onSignIn).toHaveBeenCalledOnce();
  });

  it('shows the active account, exposes sign-out, and preserves menu semantics', async () => {
    const user = userEvent.setup();
    const onSignOut = vi.fn();
    render(
      <AccountSection
        user={{ displayName: 'Jimmy', email: 'jimmy@example.com', photoURL: '' }}
        loading={false}
        busy={false}
        error="帳號錯誤"
        onSignOut={onSignOut}
        menuItem
      />,
    );

    expect(screen.getByText('Jimmy')).toBeInTheDocument();
    expect(screen.getByText('jimmy@example.com')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('帳號錯誤');
    await user.click(screen.getByRole('menuitem', { name: '登出' }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });
});
