import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FullscreenTicketModal } from './UIComponents.jsx';

vi.mock('@vis.gl/react-google-maps', () => ({ useMap: () => null, useMapsLibrary: () => null }));
vi.mock('../firebase.js', () => ({ storage: null }));

describe('FullscreenTicketModal', () => {
  it('keeps an accessible exit after image decoding fails and restores focus', async () => {
    const user = userEvent.setup();
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const onClose = vi.fn();
    const view = render(<FullscreenTicketModal ticket={{ title: '合成票券', url: 'blob:synthetic' }} onClose={onClose} />);
    const close = screen.getByRole('button', { name: '關閉票券' });
    expect(close).toHaveFocus();
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByRole('status')).toHaveTextContent('圖片暫時無法顯示');
    await user.tab();
    expect(close).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
    view.unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});
