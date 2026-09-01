import { render, screen, waitFor } from '@testing-library/react';
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

  it('removes an editor and reloads the member list while keeping the owner immutable', async () => {
    const user = userEvent.setup();
    const client = createClient();
    render(<TripSharingDialog open roomId="room-1" role="owner" onClose={vi.fn()} client={client} />);
    await screen.findByText('旅伴');

    expect(screen.getAllByText('擁有者')[0].closest('article')).not.toHaveTextContent('移除');
    await user.click(screen.getByRole('button', { name: '移除' }));

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
});
