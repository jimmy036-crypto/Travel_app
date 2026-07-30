import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AppearanceDialog } from './AppearanceDialog.jsx';

const theme = {
  modalBg: 'bg-white',
  headerBg: 'bg-white',
  cardBg: 'bg-white',
  cardBorder: 'border-slate-200',
  mainText: 'text-slate-950',
  subText: 'text-slate-600',
};

describe('AppearanceDialog', () => {
  it('opens an accessible selector and applies a color change', async () => {
    const onColorChange = vi.fn();
    render(
      <AppearanceDialog
        color="#d8b4e2"
        onColorChange={onColorChange}
        onClose={vi.fn()}
        t={theme}
      />,
    );

    expect(screen.getByRole('dialog', { name: '自訂外觀' })).toBeVisible();
    const input = screen.getByTestId('appearance-color-input');
    await waitFor(() => expect(input).toHaveFocus());
    fireEvent.change(input, { target: { value: '#123456' } });
    expect(onColorChange).toHaveBeenCalledWith('#123456');
  });

  it('supports close button, backdrop, and Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { unmount } = render(
      <AppearanceDialog
        color="#d8b4e2"
        onColorChange={vi.fn()}
        onClose={onClose}
        t={theme}
      />,
    );

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByTestId('appearance-close-button'));
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.mouseDown(screen.getByTestId('appearance-dialog'));
    expect(onClose).toHaveBeenCalledTimes(3);
    unmount();
  });
});
