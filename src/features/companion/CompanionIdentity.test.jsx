import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CompanionPicker } from './CompanionIdentity.jsx';

const t = { modalBg: 'bg-white', cardBorder: 'border-slate-200', mainText: 'text-slate-900' };
const renderPicker = (overrides = {}) => {
  const identity = {
    member: '', ready: true, candidate: '', conflict: false,
    invalidated: false, storageError: false,
    confirm: vi.fn(() => true), skip: vi.fn(),
    ...overrides.identity,
  };
  const props = { members: ['Ann', 'Bob'], onClose: vi.fn(), t, ...overrides, identity };
  return { identity, props, ...render(<CompanionPicker {...props} />) };
};

afterEach(cleanup);

describe('CompanionPicker', () => {
  it('introduces the shared browser preference without confirming even a single suggested member', () => {
    const { identity } = renderPicker({ introduction: true, members: ['Ann'], identity: { candidate: 'Ann' } });
    expect(screen.getByRole('dialog', { name: '你是這趟旅程中的哪位旅伴？' })).toBeInTheDocument();
    expect(screen.getByText('選一次，票券、清單與新增記帳會共用。')).toBeInTheDocument();
    expect(screen.getByText('只記住在這個瀏覽器，不會更改帳號或旅程權限。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '先看看' })).toHaveFocus();
    expect(screen.queryByRole('button', { name: '清除本趟旅伴設定' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ann', exact: true })).toHaveAttribute('aria-pressed', 'false');
    expect(identity.confirm).not.toHaveBeenCalled();
    expect(identity.skip).not.toHaveBeenCalled();
  });

  it.each(['button', 'Escape', 'backdrop', 'Enter'])('only skips the introduction when dismissed with %s', async method => {
    const user = userEvent.setup();
    const { identity, props } = renderPicker({ introduction: true });
    if (method === 'button') await user.click(screen.getByRole('button', { name: '先看看' }));
    if (method === 'Escape') await user.keyboard('{Escape}');
    if (method === 'Enter') await user.keyboard('{Enter}');
    if (method === 'backdrop') fireEvent.mouseDown(screen.getByTestId('companion-picker'));
    expect(identity.skip).toHaveBeenCalledOnce();
    expect(props.onClose).toHaveBeenCalledOnce();
    expect(identity.skip.mock.invocationCallOrder[0]).toBeLessThan(props.onClose.mock.invocationCallOrder[0]);
    expect(identity.confirm).not.toHaveBeenCalled();
  });

  it.each(['Ann', '你是「Ann」嗎？確認'])('confirms only the explicitly chosen %s control', async name => {
    const user = userEvent.setup();
    const { identity, props } = renderPicker({ introduction: true, identity: { candidate: 'Ann' } });
    await user.click(screen.getByRole('button', { name, exact: true }));
    expect(identity.confirm).toHaveBeenCalledExactlyOnceWith('Ann');
    expect(props.onClose).toHaveBeenCalledOnce();
    expect(identity.skip).not.toHaveBeenCalled();
  });

  it.each([true, false])('keeps introduction=%s open when confirmation is rejected', async introduction => {
    const user = userEvent.setup();
    const { identity, props } = renderPicker({ introduction, identity: { confirm: vi.fn(() => false) } });
    await user.click(screen.getByRole('button', { name: 'Ann', exact: true }));
    expect(identity.confirm).toHaveBeenCalledExactlyOnceWith('Ann');
    expect(props.onClose).not.toHaveBeenCalled();
    expect(identity.skip).not.toHaveBeenCalled();
  });

  it.each(['button', 'Escape', 'backdrop'])('preserves the existing preference when correction is cancelled with %s', async method => {
    const user = userEvent.setup();
    const { identity, props } = renderPicker({ identity: { member: 'Ann' } });
    expect(screen.getByRole('dialog', { name: '選擇本趟旅伴' })).toBeInTheDocument();
    expect(screen.getByText('這是本機操作偏好，不是帳號或權限認證。更正不會改寫已有的記帳、票券或清單。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '取消' })).toHaveFocus();
    if (method === 'button') await user.click(screen.getByRole('button', { name: '取消' }));
    if (method === 'Escape') await user.keyboard('{Escape}');
    if (method === 'backdrop') fireEvent.mouseDown(screen.getByTestId('companion-picker'));
    expect(props.onClose).toHaveBeenCalledOnce();
    expect(identity.confirm).not.toHaveBeenCalled();
    expect(identity.skip).not.toHaveBeenCalled();
    expect(identity.member).toBe('Ann');
  });

  it('clears only through the explicit correction action', async () => {
    const user = userEvent.setup();
    const { identity, props } = renderPicker({ identity: { member: 'Ann' } });
    await user.click(screen.getByRole('button', { name: '清除本趟旅伴設定' }));
    expect(identity.confirm).toHaveBeenCalledExactlyOnceWith('');
    expect(props.onClose).toHaveBeenCalledOnce();
    expect(identity.skip).not.toHaveBeenCalled();
  });

  it('disables confirmation and clearing until the member context is ready, but allows cancellation', async () => {
    const user = userEvent.setup();
    const { identity, props } = renderPicker({ identity: { ready: false, candidate: 'Ann' } });
    for (const name of ['Ann', 'Bob', '你是「Ann」嗎？確認', '清除本趟旅伴設定']) {
      const button = screen.getByRole('button', { name, exact: true });
      expect(button).toBeDisabled();
      await user.click(button);
    }
    expect(identity.confirm).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('shows invalidated, storage, and legacy-conflict warnings without guessing a replacement', () => {
    const { identity } = renderPicker({ introduction: true, identity: { invalidated: true, storageError: true, conflict: true } });
    expect(screen.getByText('原旅伴已不在名單中，請重新選擇。')).toHaveAttribute('role', 'status');
    expect(screen.getByText('無法確認瀏覽器已記住的旅伴；重新載入後請再次檢查設定。')).toHaveAttribute('role', 'status');
    expect(screen.getByText('票券與清單的舊選擇不同，請重新確認。')).toBeInTheDocument();
    expect(identity.confirm).not.toHaveBeenCalled();
  });

  it.each([
    ['Ann', '無法記住到下次；本次選擇仍可使用。重新載入後請再次確認。'],
    ['', '無法確認瀏覽器已記住的旅伴；重新載入後請再次檢查設定。'],
  ])('describes a storage error accurately with member=%s', (member, message) => {
    const { identity } = renderPicker({ identity: { member, storageError: true } });
    expect(screen.getByRole('status')).toHaveTextContent(message, { normalizeWhitespace: false });
    expect(screen.getByRole('status').textContent).toBe(message);
    expect(identity.confirm).not.toHaveBeenCalled();
    expect(identity.skip).not.toHaveBeenCalled();
  });

  it('enables explicit choice after the member context becomes ready without choosing on rerender', async () => {
    const user = userEvent.setup();
    const view = renderPicker({ introduction: true, identity: { ready: false, candidate: 'Ann' } });
    expect(screen.getByRole('button', { name: 'Ann', exact: true })).toBeDisabled();
    expect(screen.getByRole('button', { name: '先看看' })).toBeEnabled();
    view.rerender(<CompanionPicker {...view.props} identity={{ ...view.identity, ready: true }} />);
    expect(screen.getByRole('button', { name: 'Ann', exact: true })).toBeEnabled();
    expect(view.identity.confirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Ann', exact: true }));
    expect(view.identity.confirm).toHaveBeenCalledExactlyOnceWith('Ann');
    expect(view.props.onClose).toHaveBeenCalledOnce();
    expect(view.identity.skip).not.toHaveBeenCalled();
  });

  it('retains full long names, traps Tab, and returns focus to the supplied target', async () => {
    const user = userEvent.setup();
    const longName = '這是一位名字很長的旅伴'.repeat(12);
    const trigger = document.createElement('button');
    document.body.append(trigger);
    const view = renderPicker({ introduction: true, members: [longName], returnFocusTarget: trigger });
    const close = screen.getByRole('button', { name: '先看看' });
    const member = screen.getByRole('button', { name: longName, exact: true });
    expect(member).toHaveTextContent(longName);
    expect(member).toHaveClass('min-h-11', 'min-w-11', '[overflow-wrap:anywhere]');
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(member).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    view.unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it('keeps an empty member list dismissible without a default confirmation', () => {
    const { identity } = renderPicker({ introduction: true, members: [] });
    expect(screen.getByText('目前沒有可選擇的旅伴，請先確認旅程名單。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '先看看' })).toBeEnabled();
    expect(screen.queryAllByTestId('companion-member')).toHaveLength(0);
    expect(identity.confirm).not.toHaveBeenCalled();
  });
});
