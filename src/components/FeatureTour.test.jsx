import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FeatureTour } from './FeatureTour.jsx';

const theme = {
  cardBg: 'bg-white',
  cardBorder: 'border-slate-200',
  modalBg: 'bg-white',
  mainText: 'text-slate-950',
  subText: 'text-slate-500',
};

const DESKTOP_WIDTH = 1280;
const MOBILE_WIDTH = 390;

let surface = null;

function setViewport(width, height = 844) {
  window.innerWidth = width;
  window.innerHeight = height;
}

// jsdom reports zero-sized rects, so every stub target declares its own box and
// the tour treats a missing stub exactly like hidden responsive DOM.
function stubRect(element, rect) {
  element.getBoundingClientRect = () => ({
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    x: rect.left,
    y: rect.top,
    toJSON: () => rect,
  });
}

function addTarget(testId, rect, { attributes = {}, parent = surface } = {}) {
  const element = document.createElement('div');
  element.dataset.testid = testId;
  element.setAttribute('data-testid', testId);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  element.scrollIntoView = vi.fn();
  stubRect(element, rect);
  parent.appendChild(element);
  return element;
}

function addPlaceCard({ layout, titleRect, infoRect } = {}) {
  const card = addTarget('place-card', { top: 200, left: 20, width: 300, height: 90 }, {
    attributes: layout ? { 'data-mobile-layout': layout } : {},
  });
  if (titleRect) {
    addTarget('place-card-title', titleRect, { parent: card });
  }
  if (infoRect) {
    addTarget('place-info-trigger', infoRect, { parent: card });
  }
  return card;
}

function buildMobileTrip({ withPlaces = true, withSync = true, planVisible = true } = {}) {
  setViewport(MOBILE_WIDTH);
  if (withSync) {
    const wrapper = addTarget('mobile-trip-sync-status', { top: 60, left: 12, width: 120, height: 24 });
    addTarget('sync-status-indicator', { top: 60, left: 12, width: 120, height: 24 }, { parent: wrapper });
  }
  addTarget('app-settings-trigger', { top: 12, left: 330, width: 44, height: 44 });
  if (planVisible) {
    addTarget('mobile-day-switcher', { top: 140, left: 12, width: 366, height: 48 });
    addTarget('itinerary-horizontal-scroll', { top: 190, left: 0, width: 390, height: 500 });
    if (withPlaces) {
      addPlaceCard({
        layout: 'timeline',
        titleRect: { top: 210, left: 70, width: 200, height: 20 },
      });
    }
  }
  addTarget('mobile-nav-map', { top: 770, left: 98, width: 97, height: 70 });
  addTarget('expense-tab-button', { top: 770, left: 293, width: 97, height: 70 }, {
    attributes: { 'data-layout': 'mobile' },
  });
}

function buildDesktopTrip({ withPlaces = true, withSync = true, planVisible = true } = {}) {
  setViewport(DESKTOP_WIDTH, 800);
  if (withSync) {
    addTarget('sync-status-indicator', { top: 20, left: 320, width: 110, height: 24 });
  }
  addTarget('app-settings-trigger', { top: 16, left: 1200, width: 44, height: 44 });
  addTarget('expense-tab-button', { top: 20, left: 700, width: 80, height: 30 }, {
    attributes: { 'data-layout': 'desktop' },
  });
  addTarget('map-panel', { top: 90, left: 640, width: 640, height: 700 });
  if (planVisible) {
    addTarget('itinerary-horizontal-scroll', { top: 90, left: 0, width: 640, height: 700 });
    const firstDay = addTarget('itinerary-day-card', { top: 100, left: 16, width: 340, height: 600 }, {
      attributes: { 'data-day-id': 'Day 1' },
    });
    addTarget('day-theme-row', { top: 130, left: 24, width: 320, height: 40 }, { parent: firstDay });
    // A second day card scrolled out of the viewport must never win resolution.
    const offscreenDay = addTarget('itinerary-day-card', { top: 100, left: 1400, width: 340, height: 600 }, {
      attributes: { 'data-day-id': 'Day 2' },
    });
    addTarget('day-theme-row', { top: 130, left: 1408, width: 320, height: 40 }, { parent: offscreenDay });
    if (withPlaces) {
      addPlaceCard({
        titleRect: { top: 220, left: 60, width: 200, height: 20 },
        infoRect: { top: 220, left: 270, width: 84, height: 44 },
      });
    }
  }
}

async function renderTour(props = {}) {
  const onClose = props.onClose || vi.fn();
  const view = render(<FeatureTour t={theme} onClose={onClose} />);
  await waitFor(() => expect(screen.getByTestId('feature-tour-step')).toBeInTheDocument());
  await act(async () => {
    await Promise.resolve();
  });
  return { ...view, onClose };
}

const currentStepId = () => screen.getByTestId('feature-tour-step').dataset.stepId;

const advance = async (user) => {
  await user.click(screen.getByTestId('feature-tour-next'));
};

async function collectStepIds(user) {
  const ids = [currentStepId()];
  while (screen.queryByTestId('feature-tour-next')) {
    await advance(user);
    ids.push(currentStepId());
  }
  return ids;
}

beforeEach(() => {
  surface = document.createElement('div');
  document.body.appendChild(surface);
  setViewport(MOBILE_WIDTH);
});

afterEach(() => {
  surface?.remove();
  surface = null;
  document.body.style.overflow = '';
  vi.restoreAllMocks();
});

describe('FeatureTour step coverage', () => {
  it('teaches sync, planning, place details, map, expense, tools and done on mobile', async () => {
    buildMobileTrip();
    const user = userEvent.setup();
    await renderTour();

    expect(await collectStepIds(user)).toEqual([
      'sync-status',
      'current-day-planning',
      'place-details',
      'map-itinerary',
      'expense-settlement',
      'trip-tools',
      'done',
    ]);
  });

  it('teaches the same areas on desktop', async () => {
    buildDesktopTrip();
    const user = userEvent.setup();
    await renderTour();

    expect(await collectStepIds(user)).toEqual([
      'sync-status',
      'current-day-planning',
      'place-details',
      'map-itinerary',
      'expense-settlement',
      'trip-tools',
      'done',
    ]);
  });

  it('never teaches the desktop ellipsis menu or a desktop navigation button', async () => {
    buildDesktopTrip();
    // Hidden responsive DOM: present in the desktop tree but not rendered.
    const hiddenEllipsis = addTarget('place-action-menu-trigger', { top: 0, left: 0, width: 0, height: 0 });
    const user = userEvent.setup();
    await renderTour();

    const ids = await collectStepIds(user);
    expect(ids).not.toContain('place-actions');
    expect(document.body.textContent).not.toContain('點「⋯」');
    expect(document.body.textContent).not.toContain('複製或刪除景點');
    expect(hiddenEllipsis).toBeInTheDocument();
  });

  it('shows step counters that match the built step list', async () => {
    buildMobileTrip();
    const user = userEvent.setup();
    await renderTour();

    expect(screen.getByTestId('feature-tour-card')).toHaveTextContent('1 / 7');
    await advance(user);
    expect(screen.getByTestId('feature-tour-card')).toHaveTextContent('2 / 7');
  });
});

describe('FeatureTour responsive target resolution', () => {
  it('spotlights the mobile day switcher and timeline place title', async () => {
    buildMobileTrip();
    const user = userEvent.setup();
    await renderTour();

    await advance(user);
    expect(currentStepId()).toBe('current-day-planning');
    expect(screen.getByTestId('feature-tour-card')).toHaveTextContent('點天數切換');
    expect(screen.getByTestId('feature-tour-spotlight')).toBeInTheDocument();

    await advance(user);
    expect(currentStepId()).toBe('place-details');
    expect(screen.getByTestId('feature-tour-card')).toHaveTextContent('點景點名稱或卡片');
    expect(screen.queryByTestId('feature-tour-instructional-step')).not.toBeInTheDocument();
  });

  it('spotlights the desktop day planner header and the 景點資訊 action', async () => {
    buildDesktopTrip();
    const user = userEvent.setup();
    await renderTour();

    await advance(user);
    expect(currentStepId()).toBe('current-day-planning');
    expect(screen.getByTestId('feature-tour-card')).toHaveTextContent('桌面把每天並排顯示');

    const spotlight = screen.getByTestId('feature-tour-spotlight');
    // The first in-viewport day header wins, not the horizontally scrolled one.
    expect(Number.parseFloat(spotlight.style.left)).toBeLessThan(DESKTOP_WIDTH);

    await advance(user);
    expect(currentStepId()).toBe('place-details');
    expect(screen.getByTestId('feature-tour-card')).toHaveTextContent('景點資訊');
  });

  it('uses the desktop map panel and the desktop expense tab button', async () => {
    buildDesktopTrip();
    const user = userEvent.setup();
    await renderTour();

    await advance(user);
    await advance(user);
    await advance(user);
    expect(currentStepId()).toBe('map-itinerary');
    expect(screen.getByTestId('feature-tour-card')).toHaveTextContent('地圖依當日順序顯示標記與路線');
    expect(screen.queryByTestId('feature-tour-instructional-step')).not.toBeInTheDocument();

    await advance(user);
    expect(currentStepId()).toBe('expense-settlement');
    expect(screen.getByTestId('feature-tour-card')).toHaveTextContent('已轉帳');
    expect(screen.queryByTestId('feature-tour-instructional-step')).not.toBeInTheDocument();
  });

  it('keeps the spotlight inside the viewport', async () => {
    buildMobileTrip();
    await renderTour();

    const spotlight = screen.getByTestId('feature-tour-spotlight');
    expect(Number.parseFloat(spotlight.style.top)).toBeGreaterThanOrEqual(0);
    expect(Number.parseFloat(spotlight.style.left)).toBeGreaterThanOrEqual(0);
    expect(
      Number.parseFloat(spotlight.style.left) + Number.parseFloat(spotlight.style.width),
    ).toBeLessThanOrEqual(MOBILE_WIDTH);
  });

  it('re-resolves targets for the new layout after a resize', async () => {
    buildMobileTrip();
    const user = userEvent.setup();
    await renderTour();
    await advance(user);
    expect(screen.getByTestId('feature-tour-card')).toHaveTextContent('點天數切換');

    surface.remove();
    surface = document.createElement('div');
    document.body.appendChild(surface);
    buildDesktopTrip();

    await act(async () => {
      window.dispatchEvent(new Event('resize'));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId('feature-tour-card')).toHaveTextContent('桌面把每天並排顯示');
    });
  });
});

describe('FeatureTour no-target fallbacks', () => {
  it('gives an empty trip exactly one meaningful place fallback', async () => {
    buildMobileTrip({ withPlaces: false });
    const user = userEvent.setup();
    await renderTour();

    const ids = await collectStepIds(user);
    expect(ids.filter((id) => id === 'empty-place-fallback')).toHaveLength(1);
    expect(ids).not.toContain('place-details');
    expect(ids).toHaveLength(7);
  });

  it('describes the empty place fallback without promising hidden actions', async () => {
    buildDesktopTrip({ withPlaces: false });
    const user = userEvent.setup();
    await renderTour();

    await advance(user);
    await advance(user);
    expect(currentStepId()).toBe('empty-place-fallback');
    expect(screen.getByTestId('feature-tour-empty-place-fallback')).toBeInTheDocument();
    const card = screen.getByTestId('feature-tour-card');
    expect(card).toHaveTextContent('這個旅程還沒有景點');
    expect(card).not.toHaveTextContent('⋯');
    expect(screen.queryByTestId('feature-tour-spotlight')).not.toBeInTheDocument();
  });

  it('uses instructional copy instead of spotlighting a hidden planner', async () => {
    buildMobileTrip({ planVisible: false });
    const user = userEvent.setup();
    await renderTour();

    await advance(user);
    expect(currentStepId()).toBe('current-day-planning');
    expect(screen.getByTestId('feature-tour-instructional-step')).toBeInTheDocument();
    expect(screen.getByTestId('feature-tour-card')).toHaveTextContent('切換到「行程」後');
    expect(screen.queryByTestId('feature-tour-spotlight')).not.toBeInTheDocument();

    await advance(user);
    expect(currentStepId()).toBe('place-details');
    expect(screen.getByTestId('feature-tour-instructional-step')).toBeInTheDocument();
    expect(screen.getByTestId('feature-tour-card')).toHaveTextContent('回到「行程」後');
  });

  it('explains a missing sync indicator for local example trips', async () => {
    buildMobileTrip({ withSync: false });
    await renderTour();

    expect(currentStepId()).toBe('sync-status');
    expect(screen.getByTestId('feature-tour-instructional-step')).toBeInTheDocument();
    expect(screen.getByTestId('feature-tour-card')).toHaveTextContent('本機範例旅程不會同步');
  });

  it('does not mark the target-less done step as instructional', async () => {
    buildMobileTrip();
    const user = userEvent.setup();
    await renderTour();

    await collectStepIds(user);
    expect(currentStepId()).toBe('done');
    expect(screen.queryByTestId('feature-tour-instructional-step')).not.toBeInTheDocument();
    expect(screen.getByTestId('feature-tour-finish')).toBeInTheDocument();
  });
});

describe('FeatureTour interaction contract', () => {
  it('never activates a tab or clicks a target while spotlighting', async () => {
    buildMobileTrip();
    const mapTab = document.querySelector('[data-testid="mobile-nav-map"]');
    const expenseTab = document.querySelector('[data-testid="expense-tab-button"]');
    const mapClick = vi.fn();
    const expenseClick = vi.fn();
    mapTab.addEventListener('click', mapClick);
    expenseTab.addEventListener('click', expenseClick);

    const user = userEvent.setup();
    await renderTour();
    await collectStepIds(user);

    expect(mapClick).not.toHaveBeenCalled();
    expect(expenseClick).not.toHaveBeenCalled();
  });

  it('closes on Escape, on skip and on finish', async () => {
    buildMobileTrip();
    const user = userEvent.setup();
    const { onClose, unmount } = await renderTour();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId('feature-tour-skip'));
    expect(onClose).toHaveBeenCalledTimes(2);
    unmount();
  });

  it('supports going back and disables back on the first step', async () => {
    buildMobileTrip();
    const user = userEvent.setup();
    await renderTour();

    expect(screen.getByTestId('feature-tour-back')).toBeDisabled();
    await advance(user);
    expect(currentStepId()).toBe('current-day-planning');
    await user.click(screen.getByTestId('feature-tour-back'));
    expect(currentStepId()).toBe('sync-status');
  });

  it('locks body scrolling and restores focus to the launching control', async () => {
    buildMobileTrip();
    const launcher = document.createElement('button');
    document.body.appendChild(launcher);
    launcher.focus();
    document.body.style.overflow = 'scroll';

    const { unmount } = await renderTour();
    expect(document.body.style.overflow).toBe('hidden');

    unmount();
    expect(document.body.style.overflow).toBe('scroll');
    expect(launcher).toHaveFocus();
    launcher.remove();
  });

  it('keeps scroll positioning for the resolved target', async () => {
    buildMobileTrip();
    await renderTour();

    const indicator = document.querySelector('[data-testid="sync-status-indicator"]');
    expect(indicator.scrollIntoView).toHaveBeenCalled();
  });
});
