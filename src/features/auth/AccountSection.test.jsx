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

  it('shows account context and switches Google accounts with accessible actions', async () => {
    const user = userEvent.setup();
    const onSwitchAccount = vi.fn();
    const onSignOut = vi.fn();
    render(
      <AccountSection
        user={{
          displayName: 'Jimmy Travel Account With A Long Name',
          email: 'jimmy.long.account@example.com',
          photoURL: '',
        }}
        loading={false}
        busy={false}
        contextLabel="這趟旅程"
        roleLabel="擁有者"
        onSwitchAccount={onSwitchAccount}
        onSignOut={onSignOut}
      />,
    );

    expect(screen.getByTestId('account-context')).toHaveTextContent('這趟旅程');
    expect(screen.getByTestId('account-context')).toHaveTextContent('擁有者');
    expect(screen.getByText('jimmy.long.account@example.com')).toHaveClass('break-all');

    const switchButton = screen.getByRole('button', { name: '切換帳號' });
    const signOutButton = screen.getByRole('button', { name: '登出' });
    expect(switchButton).toHaveClass('min-h-11');
    expect(signOutButton).toHaveClass('min-h-11');

    await user.click(switchButton);
    expect(onSwitchAccount).toHaveBeenCalledOnce();
  });

  it('reuses the existing sign-in callback for account switching', async () => {
    const user = userEvent.setup();
    const onSignIn = vi.fn();
    render(
      <AccountSection
        user={{ displayName: 'Jimmy', email: 'jimmy@example.com' }}
        loading={false}
        busy={false}
        onSignIn={onSignIn}
        onSignOut={vi.fn()}
        menuItem
      />,
    );

    await user.click(screen.getByRole('menuitem', { name: '切換帳號' }));
    expect(onSignIn).toHaveBeenCalledOnce();
  });

  it('disables both account actions without misreporting sign-out progress', () => {
    render(
      <AccountSection
        user={{ displayName: 'Jimmy', email: 'jimmy@example.com' }}
        loading={false}
        busy
        onSignIn={vi.fn()}
        onSignOut={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '切換帳號' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '登出' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '登出' })).not.toHaveAttribute('aria-busy', 'true');
  });
});
