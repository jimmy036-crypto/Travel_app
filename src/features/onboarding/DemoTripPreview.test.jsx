import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { createTokyoDemoTrip } from './demoTripData.js';
import { DemoTripPreview } from './DemoTripPreview.jsx';

const FIXED_OPTIONS = {
  startDate: '2026-07-22',
  now: new Date(2026, 6, 21, 12, 0),
};

function renderPreview(overrides = {}) {
  const demo = overrides.demo || createTokyoDemoTrip(FIXED_OPTIONS);
  const props = {
    demo,
    initialTab: 'overview',
    onBack: vi.fn(),
    onCreateTrip: vi.fn(),
    onCloneDemo: vi.fn(),
    onAddPlace: vi.fn(),
    onUpdatePlace: vi.fn(),
    onDeletePlace: vi.fn(),
    onMovePlace: vi.fn(),
    onAddChecklistItem: vi.fn(),
    onUpdateChecklistItem: vi.fn(),
    onDeleteChecklistItem: vi.fn(),
    onResetDemo: vi.fn(),
    ...overrides,
  };
  return { ...render(<DemoTripPreview {...props} />), demo, props };
}

describe('DemoTripPreview editable local shell and tabs', () => {
  it('shows the demo banner, title, editable local state, and no-sync explanation', () => {
    renderPreview();
    expect(screen.getByTestId('demo-trip-preview')).toBeInTheDocument();
    expect(screen.getByTestId('demo-mode-banner')).toHaveTextContent('示範模式');
    expect(screen.getByTestId('demo-mode-banner')).toHaveTextContent('本機可編輯副本');
    expect(screen.getByTestId('demo-mode-banner')).toHaveTextContent('不會同步到雲端');
    expect(screen.getByTestId('demo-trip-title')).toHaveTextContent('東京三日示範旅程');
  });

  it('opens overview by default', () => {
    renderPreview();
    expect(screen.getByTestId('demo-tab-overview')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('demo-overview')).toBeVisible();
    expect(screen.getByTestId('demo-tickets')).not.toBeVisible();
  });

  it('honors a valid initialTab', () => {
    renderPreview({ initialTab: 'expenses' });
    expect(screen.getByTestId('demo-tab-expenses')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('demo-expenses')).toBeVisible();
  });

  it('falls back to overview for an invalid initialTab', () => {
    renderPreview({ initialTab: 'unknown-tab' });
    expect(screen.getByTestId('demo-tab-overview')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('demo-overview')).toBeVisible();
  });

  it('switches all five tabs using local component state', async () => {
    const user = userEvent.setup();
    renderPreview();
    for (const tab of ['itinerary', 'tickets', 'expenses', 'checklist', 'overview']) {
      await user.click(screen.getByTestId(`demo-tab-${tab}`));
      expect(screen.getByTestId(`demo-tab-${tab}`)).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByTestId(`demo-${tab}`)).toBeVisible();
    }
  });

  it('uses accessible tabs and labelled controls', () => {
    renderPreview();
    expect(screen.getByRole('tablist', { name: '示範旅程內容' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(5);
    screen.getAllByRole('tab').forEach((tab) => {
      expect(tab).toHaveAttribute('type', 'button');
      expect(tab).toHaveAttribute('aria-controls');
    });
    expect(screen.getAllByRole('button', { name: '返回首頁' })).toHaveLength(2);
  });

  it('keeps horizontal overflow contained for mobile tabs and long content', () => {
    const demo = createTokyoDemoTrip(FIXED_OPTIONS);
    demo.meta.title = '東京三日示範旅程'.repeat(20);
    renderPreview({ demo });
    expect(screen.getByTestId('demo-trip-preview')).toHaveClass('overflow-x-hidden', 'min-h-dvh', 'overflow-y-auto');
    expect(screen.getByRole('tablist')).toHaveClass('overflow-x-auto', 'max-w-full');
    expect(screen.getByTestId('demo-trip-title')).toHaveClass('break-words');
  });
});

describe('DemoTripPreview overview and itinerary', () => {
  it('shows overview counts, dates, members, and checklist progress', () => {
    renderPreview();
    const summary = screen.getByTestId('demo-overview-trip-summary');
    expect(summary).toHaveTextContent('2026-07-22 至 2026-07-24');
    expect(summary).toHaveTextContent('3 天');
    expect(summary).toHaveTextContent('11 個');
    expect(summary).toHaveTextContent('3 張');
    expect(summary).toHaveTextContent('4 筆');
    expect(summary).toHaveTextContent('清單完成度：2/6');
    expect(screen.getByTestId('demo-overview-collaboration')).toHaveTextContent('自己');
    expect(screen.getByTestId('demo-overview-collaboration')).toHaveTextContent('旅伴 A');
    expect(screen.getByTestId('demo-overview-collaboration')).toHaveTextContent('旅伴 B');
  });

  it('describes offline and PWA features without claiming the demo is cached', () => {
    renderPreview();
    const section = screen.getByTestId('demo-overview-offline-pwa');
    expect(section).toHaveTextContent('正式旅程可離線查看');
    expect(section).toHaveTextContent('將網站加入主畫面');
    expect(section).toHaveTextContent('這份內建示範不會寫入離線快取');
  });

  it('switches among all three itinerary days', async () => {
    const user = userEvent.setup();
    renderPreview({ initialTab: 'itinerary' });
    expect(screen.getByText('淺草寺（示範）')).toBeVisible();
    await user.click(screen.getByRole('button', { name: /第 2 天/ }));
    expect(screen.getByText('明治神宮（示範）')).toBeVisible();
    await user.click(screen.getByRole('button', { name: /第 3 天/ }));
    expect(screen.getByText('築地場外市場（示範）')).toBeVisible();
  });

  it('shows time, notes, accessible edit/reorder controls, and no map UI', () => {
    const { container } = renderPreview({ initialTab: 'itinerary' });
    const firstPlace = screen.getAllByTestId('demo-place-card')[0];
    expect(firstPlace).toHaveTextContent('09:00');
    expect(firstPlace).toHaveTextContent('非即時交通建議');
    expect(screen.getByTestId('demo-add-place')).toBeInTheDocument();
    expect(screen.getAllByTestId('demo-editable-place')[0]).toHaveAttribute('draggable', 'true');
    expect(screen.getAllByRole('button', { name: /刪除景點/ }).length).toBeGreaterThan(0);
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('[data-testid*="map"]')).toBeNull();
  });
});

describe('DemoTripPreview tickets', () => {
  it('shows shared, personal, and multi-member ticket examples', () => {
    renderPreview({ initialTab: 'tickets' });
    const cards = screen.getAllByTestId('demo-ticket-card');
    expect(cards).toHaveLength(3);
    expect(cards[0]).toHaveTextContent('共同票券');
    expect(cards[1]).toHaveTextContent('個人票券：自己');
    expect(cards[2]).toHaveTextContent('多人票券：自己、旅伴 A');
  });

  it('shows presenter, identity, network, login, and dynamic-code concepts', () => {
    renderPreview({ initialTab: 'tickets' });
    expect(screen.getByTestId('demo-ticket-identity-example')).toHaveTextContent('不是權限驗證');
    expect(screen.getAllByText('主要出示人：自己')).toHaveLength(2);
    expect(screen.getByText('主要出示人：旅伴 A')).toBeInTheDocument();
    expect(screen.getByText('需要網路')).toBeInTheDocument();
    expect(screen.getByText('需要登入')).toBeInTheDocument();
    expect(screen.getByText('動態條碼')).toBeInTheDocument();
  });

  it('expands and collapses manual instructions without navigation', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderPreview({ initialTab: 'tickets' });
    const toggle = screen.getAllByTestId('demo-ticket-manual-toggle')[0];
    expect(toggle).toHaveAttribute('type', 'button');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('這是示範資料，請勿當作實際票券使用。')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('這是示範操作');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it('keeps web-ticket actions inert and renders no third-party anchors', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { container } = renderPreview({ initialTab: 'tickets' });
    expect(container.querySelector('a')).toBeNull();
    await user.click(screen.getByRole('button', { name: '示範開啟票券' }));
    expect(screen.getByRole('status')).toHaveTextContent('不會開啟外部 App 或網站');
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });
});

describe('DemoTripPreview expenses and checklist', () => {
  it('shows total, categories, payers, splits, and a simplified settlement', () => {
    renderPreview({ initialTab: 'expenses' });
    expect(screen.getByText('以下金額為示範資料。')).toBeVisible();
    expect(screen.getByTestId('demo-expense-summary')).toHaveTextContent('NT$ 18,300');
    expect(screen.getAllByTestId('demo-expense-card')).toHaveLength(4);
    expect(screen.getByTestId('demo-expense-summary')).toHaveTextContent('住宿');
    expect(screen.getByText(/付款人：旅伴 A/)).toBeInTheDocument();
    expect(screen.getByTestId('demo-settlement-summary')).toHaveTextContent('旅伴 A → 自己：NT$ 2,600');
    expect(screen.getByTestId('demo-settlement-summary')).toHaveTextContent('旅伴 B → 自己：NT$ 3,800');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('shows packing, todo, shared, personal, and progress states', () => {
    renderPreview({ initialTab: 'checklist' });
    const sections = screen.getAllByTestId('demo-checklist-section');
    expect(sections).toHaveLength(2);
    expect(sections[0]).toHaveTextContent('行李');
    expect(sections[1]).toHaveTextContent('待辦');
    expect(screen.getByTestId('demo-checklist-progress')).toHaveTextContent('完成度：2/6');
    expect(screen.getByText(/共同項目・負責：旅伴 A/)).toBeInTheDocument();
    expect(screen.getAllByText(/個人項目/).length).toBeGreaterThan(0);
  });

  it('uses editable checkboxes through the supplied local callback only', async () => {
    const user = userEvent.setup();
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const { props } = renderPreview({ initialTab: 'checklist' });
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(6);
    checkboxes.forEach((checkbox) => expect(checkbox).toBeEnabled());
    const wasChecked = checkboxes[0].checked;
    await user.click(checkboxes[0]);
    expect(props.onUpdateChecklistItem).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ completed: !wasChecked }),
    );
    expect(setItemSpy).not.toHaveBeenCalled();
    setItemSpy.mockRestore();
  });
});

describe('DemoTripPreview local editing contract', () => {
  it('routes itinerary add, edit, delete, and keyboard reorder through callbacks', async () => {
    const user = userEvent.setup();
    const { props } = renderPreview({ initialTab: 'itinerary' });
    await user.click(screen.getByTestId('demo-add-place'));
    expect(props.onAddPlace).toHaveBeenCalledWith('Day 1');

    const nameInput = screen.getAllByRole('textbox', { name: /景點名稱/ })[0];
    await user.clear(nameInput);
    await user.type(nameInput, '編輯後景點');
    expect(props.onUpdatePlace).toHaveBeenLastCalledWith(
      'Day 1',
      expect.any(String),
      { name: '編輯後景點' },
    );

    await user.click(screen.getAllByRole('button', { name: /向後移動/ })[0]);
    expect(props.onMovePlace).toHaveBeenCalledWith('Day 1', expect.any(String), 'down');
    await user.click(screen.getAllByRole('button', { name: /刪除景點/ })[0]);
    expect(props.onDeletePlace).toHaveBeenCalledWith('Day 1', expect.any(String));
  });

  it('routes Checklist add, edit, assignee, toggle, and delete through callbacks', async () => {
    const user = userEvent.setup();
    const { props } = renderPreview({ initialTab: 'checklist' });
    await user.click(screen.getByTestId('demo-add-checklist-item'));
    expect(props.onAddChecklistItem).toHaveBeenCalledTimes(1);

    const nameInput = screen.getAllByRole('textbox', { name: /項目名稱/ })[0];
    await user.clear(nameInput);
    await user.type(nameInput, '新的清單文字');
    expect(props.onUpdateChecklistItem).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ text: '新的清單文字' }),
    );
    await user.selectOptions(screen.getAllByRole('combobox', { name: /負責人/ })[0], '');
    expect(props.onUpdateChecklistItem).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ assignee: '' }),
    );
    await user.click(screen.getAllByRole('button', { name: /刪除清單項目/ })[0]);
    expect(props.onDeleteChecklistItem).toHaveBeenCalledWith(expect.any(String));
  });

  it('confirms Reset and reports persistent, memory-only, and save-error states', async () => {
    const user = userEvent.setup();
    const { props, unmount } = renderPreview();
    expect(screen.getByTestId('demo-sandbox-status')).toHaveTextContent('不會寫入 Firebase');
    await user.click(screen.getByTestId('demo-reset-button'));
    expect(screen.getByRole('dialog', { name: '重設示範資料？' })).toBeInTheDocument();
    await user.click(screen.getByTestId('demo-reset-confirm'));
    expect(props.onResetDemo).toHaveBeenCalledTimes(1);
    unmount();

    const memory = renderPreview({ persistence: 'memory' });
    expect(screen.getByTestId('demo-sandbox-status')).toHaveTextContent('重新整理後不會保留');
    memory.unmount();
    renderPreview({ saveError: '本機保存失敗' });
    expect(screen.getByTestId('demo-sandbox-status')).toHaveTextContent('本機保存失敗');
  });

  it('labels expenses, settlement, tickets, and attachments as preview-only', async () => {
    const user = userEvent.setup();
    renderPreview({ initialTab: 'tickets' });
    expect(screen.getByText(/票券與附件僅供預覽/)).toBeVisible();
    await user.click(screen.getByTestId('demo-tab-expenses'));
    expect(screen.getByText(/費用與結算僅供預覽/)).toBeVisible();
  });
});

describe('DemoTripPreview callbacks and isolation boundaries', () => {
  it('does not trigger any callback automatically', () => {
    const { props } = renderPreview();
    expect(props.onBack).not.toHaveBeenCalled();
    expect(props.onCreateTrip).not.toHaveBeenCalled();
    expect(props.onCloneDemo).not.toHaveBeenCalled();
  });

  it('calls onBack from the labelled header action', async () => {
    const user = userEvent.setup();
    const { props } = renderPreview();
    await user.click(screen.getByTestId('demo-back-button'));
    expect(props.onBack).toHaveBeenCalledTimes(1);
  });

  it('calls onCreateTrip without creating anything itself', async () => {
    const user = userEvent.setup();
    const { props } = renderPreview();
    await user.click(screen.getByTestId('demo-create-trip-button'));
    expect(props.onCreateTrip).toHaveBeenCalledTimes(1);
    expect(props.onCloneDemo).not.toHaveBeenCalled();
  });

  it('passes the original demo to onCloneDemo only after confirmation click', async () => {
    const user = userEvent.setup();
    const { demo, props } = renderPreview();
    expect(props.onCloneDemo).not.toHaveBeenCalled();
    await user.click(screen.getByTestId('demo-clone-trip-button'));
    expect(props.onCloneDemo).toHaveBeenCalledTimes(1);
    expect(props.onCloneDemo).toHaveBeenCalledWith(demo);
  });

  it('hides clone action when showCloneAction is false and uses a two-column footer', () => {
    renderPreview({ showCloneAction: false });
    expect(screen.queryByTestId('demo-clone-trip-button')).not.toBeInTheDocument();
    expect(screen.getByTestId('demo-create-trip-button').parentElement).toHaveClass('sm:grid-cols-2');
  });

  it('hides clone action when onCloneDemo is not a function', () => {
    renderPreview({ onCloneDemo: undefined });
    expect(screen.queryByTestId('demo-clone-trip-button')).not.toBeInTheDocument();
  });

  it('uses a custom create action label without changing the default contract', () => {
    const { unmount } = renderPreview({ createActionLabel: '建立另一個旅程' });
    expect(screen.getByTestId('demo-create-trip-button')).toHaveTextContent('建立另一個旅程');
    unmount();
    renderPreview();
    expect(screen.getByTestId('demo-create-trip-button')).toHaveTextContent('建立我的第一個旅程');
  });

  it('does not read or write localStorage while rendering and switching tabs', async () => {
    const user = userEvent.setup();
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    renderPreview();
    await user.click(screen.getByTestId('demo-tab-tickets'));
    await user.click(screen.getByTestId('demo-tab-checklist'));
    expect(getItemSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
    getItemSpy.mockRestore();
    setItemSpy.mockRestore();
  });

  it('has no persistence, remote-service, route, or cache imports', () => {
    const source = readFileSync(resolve('src/features/onboarding/DemoTripPreview.jsx'), 'utf8');
    expect(source).not.toMatch(/from ['"][^'"]*(firebase|offlineTripCache|ticketsService|placesService|useExpenseActions)/i);
    expect(source).not.toMatch(/localStorage[.(]|sessionStorage[.(]|window\.location|history\.|fetch\(|XMLHttpRequest|WebSocket/);
  });

  it('renders every guidance targetTestId in the preview DOM', () => {
    const { demo } = renderPreview();
    demo.guidance.chapters.forEach((chapter) => {
      expect(screen.getByTestId(chapter.targetTestId)).toBeInTheDocument();
    });
  });

  it('uses only buttons for ticket operations and never writes Clipboard', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const { container } = renderPreview({ initialTab: 'tickets' });
    const ticketSection = screen.getByTestId('demo-tickets');
    expect(within(ticketSection).getAllByRole('button').length).toBeGreaterThan(0);
    expect(container.querySelector('a')).toBeNull();
    await user.click(screen.getByRole('button', { name: '示範開啟票券' }));
    expect(writeText).not.toHaveBeenCalled();
  });
});
