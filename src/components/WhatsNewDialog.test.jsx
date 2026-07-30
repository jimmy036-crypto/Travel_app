import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WhatsNewDialog } from './WhatsNewDialog.jsx';
import { CURRENT_RELEASE_NOTES } from '../config/releaseNotes.js';

const theme = {
  cardBg: 'bg-white',
  cardBorder: 'border-slate-200',
  headerBg: 'bg-white',
  modalBg: 'bg-white',
  mainText: 'text-slate-950',
  subText: 'text-slate-500',
};

function renderDialog(props = {}) {
  const callbacks = {
    onStartTour: vi.fn(),
    onRemindLater: vi.fn(),
    onDismissVersion: vi.fn(),
    onClose: vi.fn(),
    ...props,
  };
  const view = render(
    <WhatsNewDialog notes={CURRENT_RELEASE_NOTES} t={theme} {...callbacks} />,
  );
  return { ...view, callbacks };
}

describe('WhatsNewDialog release content', () => {
  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('shows the new release identity in the header', () => {
    renderDialog();
    expect(screen.getByText(/2026-07-30/)).toHaveTextContent(
      '2026.07-trip-management-redesign',
    );
    expect(screen.getByText('行程規劃、地圖與記帳全面升級')).toBeInTheDocument();
  });

  it('renders one card per highlight with its icon, title and description', () => {
    const { container } = renderDialog();
    const cards = container.querySelectorAll('article');
    expect(cards).toHaveLength(6);

    CURRENT_RELEASE_NOTES.highlights.forEach((highlight, index) => {
      const card = cards[index];
      expect(card).toHaveTextContent(highlight.icon);
      expect(card).toHaveTextContent(highlight.title);
      expect(card).toHaveTextContent(highlight.description);
    });
  });

  it('no longer shows the retired collaboration-only highlights', () => {
    renderDialog();
    expect(screen.queryByText('手機快速切換天數')).not.toBeInTheDocument();
    expect(screen.queryByText('景點操作選單')).not.toBeInTheDocument();
    expect(screen.queryByText('多人即時協作改善')).not.toBeInTheDocument();
  });

  it('tolerates missing notes without crashing', () => {
    const { container } = render(
      <WhatsNewDialog notes={undefined} t={theme} onClose={vi.fn()} />,
    );
    expect(screen.getByTestId('whats-new-dialog')).toBeInTheDocument();
    expect(container.querySelectorAll('article')).toHaveLength(0);
  });
});

describe('WhatsNewDialog empty-lobby helper copy', () => {
  it('covers planning, map, tickets, expense/settlement and collaboration', () => {
    renderDialog({ tourCtaMode: 'lobby-empty' });
    const helper = screen.getByText(/建立旅程後/);
    for (const fragment of ['行程', '地圖', '票券', '記帳', '結算', '共編']) {
      expect(helper).toHaveTextContent(fragment);
    }
    expect(helper).not.toHaveTextContent('天數切換、景點操作與多人同步導覽');
  });

  it('only shows the helper paragraph for the empty lobby', () => {
    const view = renderDialog({ tourCtaMode: 'trip' });
    expect(screen.queryByText(/建立旅程後/)).not.toBeInTheDocument();
    view.unmount();
    renderDialog({ tourCtaMode: 'lobby-trips' });
    expect(screen.queryByText(/建立旅程後/)).not.toBeInTheDocument();
  });

  it.each([
    ['trip', 'whats-new-start-tour'],
    ['lobby-empty', 'whats-new-create-trip'],
    ['lobby-trips', 'whats-new-choose-trip-tour'],
  ])('uses the %s primary action', (mode, testId) => {
    renderDialog({ tourCtaMode: mode });
    expect(screen.getByTestId(testId)).toBeInTheDocument();
  });
});

describe('WhatsNewDialog accessibility and dismissal', () => {
  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('keeps a labelled modal dialog with a scrollable body and safe-area footer', () => {
    const { container } = renderDialog();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'whats-new-title');
    expect(container.querySelector('.overflow-y-auto')).toBeInTheDocument();
    expect(container.querySelector('footer')).toHaveClass(
      'pb-[max(1rem,env(safe-area-inset-bottom))]',
    );
  });

  it('keeps both dismissal actions and the close button', () => {
    renderDialog();
    expect(screen.getByTestId('whats-new-remind-later')).toHaveTextContent('稍後再看');
    expect(screen.getByTestId('whats-new-dismiss-version')).toHaveTextContent('不再顯示此版本');
    expect(screen.getByLabelText('關閉本次更新')).toBeInTheDocument();
  });

  it('locks body scrolling and restores it on unmount', () => {
    document.body.style.overflow = 'scroll';
    const { unmount } = renderDialog();
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('scroll');
  });

  it('closes on Escape and on a backdrop click', async () => {
    const user = userEvent.setup();
    const { callbacks } = renderDialog();
    await user.keyboard('{Escape}');
    expect(callbacks.onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('whats-new-dialog'));
    expect(callbacks.onClose).toHaveBeenCalledTimes(2);
  });

  it('traps Tab and Shift+Tab inside the dialog', async () => {
    const user = userEvent.setup();
    const { container } = renderDialog();
    const focusable = [...container.querySelectorAll('button')];
    const first = focusable[0];
    const last = focusable.at(-1);

    // The dialog focuses its close button on mount via requestAnimationFrame.
    await waitFor(() => expect(first).toHaveFocus());
    await user.tab({ shift: true });
    expect(last).toHaveFocus();
    await user.tab();
    expect(first).toHaveFocus();
  });

  it.each([
    ['whats-new-start-tour', 'onStartTour'],
    ['whats-new-remind-later', 'onRemindLater'],
    ['whats-new-dismiss-version', 'onDismissVersion'],
  ])('wires %s to its callback', async (testId, callbackName) => {
    const user = userEvent.setup();
    const { callbacks } = renderDialog();
    await user.click(screen.getByTestId(testId));
    expect(callbacks[callbackName]).toHaveBeenCalledTimes(1);
  });

  it('does not introduce a carousel or an external anchor', () => {
    const { container } = renderDialog();
    expect(container.querySelector('a')).toBeNull();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });
});
