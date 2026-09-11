import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TripSharingDialog } from './TripSharingDialog.jsx';

const dialogMocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  toastInfo: vi.fn(),
}));

vi.mock('../../components/ui/useConfirm.js', () => ({
  useConfirm: () => dialogMocks.confirm,
}));

vi.mock('../../components/ui/useToast.js', () => ({
  useToast: () => ({ info: dialogMocks.toastInfo }),
}));

vi.mock('../../firebase.js', () => ({ functions: null }));

const inviteToken = 'i'.repeat(43);

const createDeferred = () => {
  let resolve;
  const promise = new Promise((next) => {
    resolve = next;
  });
  return { promise, resolve };
};

const createClient = () => ({
  getOrCreateTripInvite: vi.fn().mockResolvedValue({ token: inviteToken }),
  listTripMembers: vi.fn().mockResolvedValue({
    members: [
      { uid: 'owner-1', role: 'owner', status: 'active', displayName: '擁有者' },
      { uid: 'member-1', role: 'editor', status: 'active', displayName: '旅伴' },
    ],
  }),
  rotateTripInvite: vi.fn().mockResolvedValue({ token: 'r'.repeat(43) }),
  revokeTripInvite: vi.fn().mockResolvedValue({ ok: true }),
  removeTripMember: vi.fn().mockResolvedValue({ ok: true }),
  restoreTripMember: vi.fn().mockResolvedValue({ ok: true }),
});

describe('TripSharingDialog', () => {
  it('restores the explicit settings trigger even when pointer activation did not focus it', async () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    const client = createClient();
    const view = render(<TripSharingDialog open roomId="room-1" role="owner" returnFocusTarget={trigger} onClose={vi.fn()} client={client} />);
    await screen.findByRole('textbox', { name: '旅程邀請連結' });
    view.rerender(<TripSharingDialog open={false} roomId="room-1" role="owner" returnFocusTarget={trigger} onClose={vi.fn()} client={client} />);
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  beforeEach(() => {
    dialogMocks.confirm.mockResolvedValue(true);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    window.history.pushState({}, '', '/');
  });

  it('loads an owner invite and sanitized member list, then copies the secure link', async () => {
    const user = userEvent.setup();
    const clipboardWrite = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWrite },
    });
    const client = createClient();
    render(<TripSharingDialog open roomId="room-1" role="owner" onClose={vi.fn()} client={client} />);

    const inviteInput = await screen.findByRole('textbox', { name: '旅程邀請連結' });
    expect(inviteInput).toHaveValue(`http://localhost:3000/#invite=${inviteToken}`);
    expect(screen.getAllByText('擁有者')).toHaveLength(2);
    expect(screen.getByText('旅伴')).toBeInTheDocument();
    expect(client.listTripMembers).toHaveBeenCalledWith('room-1');

    await user.click(screen.getByRole('button', { name: '複製' }));
    expect(clipboardWrite).toHaveBeenCalledWith(inviteInput.value);
    expect(dialogMocks.toastInfo).toHaveBeenCalledWith({ title: '邀請連結已複製' });
  });

  it('requires confirmation before rotating and revoking an owner link', async () => {
    const user = userEvent.setup();
    const client = createClient();
    render(<TripSharingDialog open roomId="room-1" role="owner" onClose={vi.fn()} client={client} />);
    await screen.findByRole('textbox', { name: '旅程邀請連結' });

    await user.click(screen.getByRole('button', { name: '換發連結' }));
    await waitFor(() => expect(client.rotateTripInvite).toHaveBeenCalledWith('room-1'));
    expect(screen.getByRole('textbox', { name: '旅程邀請連結' })).toHaveValue(
      `http://localhost:3000/#invite=${'r'.repeat(43)}`,
    );

    await user.click(screen.getByRole('button', { name: '停用連結' }));
    await waitFor(() => expect(client.revokeTripInvite).toHaveBeenCalledWith('room-1'));
    expect(screen.queryByRole('textbox', { name: '旅程邀請連結' })).not.toBeInTheDocument();
    expect(dialogMocks.confirm).toHaveBeenCalledTimes(2);
  });

  it('ignores a delayed invite rotation after switching rooms', async () => {
    const user = userEvent.setup();
    const rotation = createDeferred();
    const roomOneToken = 'a'.repeat(43);
    const roomTwoToken = 'b'.repeat(43);
    const client = createClient();
    client.getOrCreateTripInvite.mockImplementation(async (roomId) => ({
      token: roomId === 'room-1' ? roomOneToken : roomTwoToken,
    }));
    client.rotateTripInvite.mockReturnValue(rotation.promise);

    const { rerender } = render(
      <TripSharingDialog open roomId="room-1" role="owner" onClose={vi.fn()} client={client} />,
    );
    expect(await screen.findByRole('textbox', { name: '旅程邀請連結' })).toHaveValue(
      `http://localhost:3000/#invite=${roomOneToken}`,
    );

    await user.click(screen.getByRole('button', { name: '換發連結' }));
    await waitFor(() => expect(client.rotateTripInvite).toHaveBeenCalledWith('room-1'));

    rerender(<TripSharingDialog open roomId="room-2" role="owner" onClose={vi.fn()} client={client} />);
    await waitFor(() => expect(screen.getByRole('textbox', { name: '旅程邀請連結' })).toHaveValue(
      `http://localhost:3000/#invite=${roomTwoToken}`,
    ));

    await act(async () => {
      rotation.resolve({ token: 'r'.repeat(43) });
      await rotation.promise;
    });

    expect(screen.getByRole('textbox', { name: '旅程邀請連結' })).toHaveValue(
      `http://localhost:3000/#invite=${roomTwoToken}`,
    );
    expect(dialogMocks.toastInfo).not.toHaveBeenCalledWith({ title: '已換發邀請連結' });
  });

  it('removes an editor and reloads the member list while keeping the owner immutable', async () => {
    const user = userEvent.setup();
    const client = createClient();
    render(<TripSharingDialog open roomId="room-1" role="owner" onClose={vi.fn()} client={client} />);
    await screen.findByText('旅伴');

    expect(screen.getAllByText('擁有者')[0].closest('article')).not.toHaveTextContent('移除');
    await user.click(screen.getByRole('button', { name: '移除成員：旅伴' }));

    await waitFor(() => expect(client.removeTripMember).toHaveBeenCalledWith('room-1', 'member-1'));
    expect(client.listTripMembers).toHaveBeenCalledTimes(2);
  });

  it('does not expose invite tokens, owner controls, or members to an editor', async () => {
    const client = createClient();
    render(<TripSharingDialog open roomId="room-1" role="editor" onClose={vi.fn()} client={client} />);

    expect(await screen.findByText('只有旅程擁有者可以建立或查看邀請連結。')).toBeInTheDocument();
    expect(client.getOrCreateTripInvite).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: '旅程邀請連結' })).not.toBeInTheDocument();
    expect(client.listTripMembers).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: '旅程成員' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '換發連結' })).not.toBeInTheDocument();
  });

  it('renders callable authorization errors instead of crashing', async () => {
    const client = createClient();
    client.getOrCreateTripInvite.mockRejectedValue({
      code: 'functions/permission-denied',
      message: '你不是此旅程的成員。',
    });
    render(<TripSharingDialog open roomId="room-1" role="owner" onClose={vi.fn()} client={client} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('你不是此旅程的成員。');
  });

  it('keeps loading distinct from inactive invites and retries a failed load explicitly', async () => {
    const user = userEvent.setup();
    const pending = createDeferred();
    const client = createClient();
    client.getOrCreateTripInvite.mockReturnValueOnce(pending.promise);
    render(<TripSharingDialog open roomId="room-1" role="owner" onClose={vi.fn()} client={client} />);
    expect(screen.getByRole('status')).toHaveTextContent('正在載入分享設定');
    expect(screen.queryByText(/未啟用|沒有可管理/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '建立連結' })).not.toBeInTheDocument();
    await act(async () => pending.resolve(Promise.reject(new Error('Synthetic load failure'))));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(client.getOrCreateTripInvite).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/未啟用|沒有可管理/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '重新載入分享設定' }));
    expect(await screen.findByRole('textbox', { name: '旅程邀請連結' })).toBeInTheDocument();
    expect(client.getOrCreateTripInvite).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['換發連結', 'rotateTripInvite'],
    ['停用連結', 'revokeTripInvite'],
    ['移除成員：旅伴', 'removeTripMember'],
  ])('cancelling %s never writes', async (name, method) => {
    const user = userEvent.setup();
    dialogMocks.confirm.mockResolvedValue(false);
    const client = createClient();
    render(<TripSharingDialog open roomId="room-1" role="owner" onClose={vi.fn()} client={client} />);
    await screen.findByRole('textbox', { name: '旅程邀請連結' });
    await user.click(screen.getByRole('button', { name }));
    expect(dialogMocks.confirm).toHaveBeenCalledOnce();
    expect(client[method]).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name })).toBeEnabled();
  });

  it('guards repeated and competing actions while a confirmation is pending', async () => {
    const user = userEvent.setup();
    const confirmation = createDeferred();
    dialogMocks.confirm.mockReturnValue(confirmation.promise);
    const client = createClient();
    render(<TripSharingDialog open roomId="room-1" role="owner" onClose={vi.fn()} client={client} />);
    await screen.findByRole('textbox', { name: '旅程邀請連結' });
    await user.dblClick(screen.getByRole('button', { name: '換發連結' }));
    expect(dialogMocks.confirm).toHaveBeenCalledOnce();
    for (const name of ['複製', '換發連結', '停用連結', '移除成員：旅伴']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
    await act(async () => confirmation.resolve(true));
    await waitFor(() => expect(client.rotateTripInvite).toHaveBeenCalledTimes(1));
  });

  it('does not mutate after a confirmation resolves for a closed and reopened sheet', async () => {
    const user = userEvent.setup();
    const confirmation = createDeferred();
    dialogMocks.confirm.mockReturnValue(confirmation.promise);
    const client = createClient();
    const props = { roomId: 'room-1', role: 'owner', onClose: vi.fn(), client };
    const view = render(<TripSharingDialog {...props} open />);
    await screen.findByRole('textbox', { name: '旅程邀請連結' });
    await user.click(screen.getByRole('button', { name: '停用連結' }));
    view.rerender(<TripSharingDialog {...props} open={false} />);
    view.rerender(<TripSharingDialog {...props} open />);
    await screen.findByRole('textbox', { name: '旅程邀請連結' });
    await act(async () => confirmation.resolve(true));
    expect(client.revokeTripInvite).not.toHaveBeenCalled();
    expect(dialogMocks.toastInfo).not.toHaveBeenCalled();
  });

  it('keeps clipboard success pending and offers manual selection only on failure', async () => {
    const user = userEvent.setup();
    const copy = createDeferred();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn(() => copy.promise) } });
    render(<TripSharingDialog open roomId="room-1" role="owner" onClose={vi.fn()} client={createClient()} />);
    const input = await screen.findByRole('textbox', { name: '旅程邀請連結' });
    await user.click(screen.getByRole('button', { name: '複製' }));
    expect(dialogMocks.toastInfo).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '複製' })).toBeDisabled();
    await act(async () => copy.resolve(Promise.reject(new Error('Clipboard denied'))));
    expect(await screen.findByRole('alert')).toHaveTextContent('無法自動複製');
    await waitFor(() => expect(input).toHaveFocus());
    expect(input.selectionEnd - input.selectionStart).toBe(input.value.length);
    expect(dialogMocks.toastInfo).not.toHaveBeenCalled();
  });

  it('never exposes owner data after role changes to editor', async () => {
    const client = createClient();
    const view = render(<TripSharingDialog open roomId="room-1" role="owner" onClose={vi.fn()} client={client} />);
    await screen.findByRole('textbox', { name: '旅程邀請連結' });
    view.rerender(<TripSharingDialog open roomId="room-1" role="editor" onClose={vi.fn()} client={client} />);
    expect(screen.queryByRole('textbox', { name: '旅程邀請連結' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '旅程成員' })).not.toBeInTheDocument();
    expect(client.getOrCreateTripInvite).toHaveBeenCalledTimes(1);
    expect(client.listTripMembers).toHaveBeenCalledTimes(1);
  });

  it('ignores an initial load that resolves after another room has loaded', async () => {
    const pending = createDeferred();
    const client = createClient();
    client.getOrCreateTripInvite.mockReturnValueOnce(pending.promise);
    const view = render(<TripSharingDialog open roomId="room-1" role="owner" onClose={vi.fn()} client={client} />);
    view.rerender(<TripSharingDialog open roomId="room-2" role="owner" onClose={vi.fn()} client={client} />);
    const input = await screen.findByRole('textbox', { name: '旅程邀請連結' });
    await act(async () => pending.resolve({ token: 'a'.repeat(43) }));
    expect(input).toHaveValue(`http://localhost:3000/#invite=${inviteToken}`);
    expect(client.getOrCreateTripInvite).toHaveBeenNthCalledWith(2, 'room-2');
  });
});
