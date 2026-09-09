import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  MobileItineraryDragClone,
  MobileItineraryTimeline,
  MobileTimelineSkeleton,
} from './MobileItineraryTimeline.jsx';

vi.mock('@hello-pangea/dnd', () => ({
  Droppable: ({ children }) => children({
    innerRef: vi.fn(),
    droppableProps: {},
    placeholder: null,
  }),
  Draggable: ({ children }) => children({
    innerRef: vi.fn(),
    draggableProps: {},
    dragHandleProps: {
      'data-rfd-drag-handle-draggable-id': 'test-drag',
    },
  }, { isDragging: false }),
}));

const t = {
  isLight: true,
  mainText: 'text-slate-900',
  subText: 'text-slate-600',
  cardBg: 'bg-white/60',
  cardBorder: 'border-black/10',
  cardMetaBg: 'bg-black/5',
  itemBg: 'bg-white/80',
};

const items = [
  {
    id: 'place-a',
    name: '沖繩美麗海水族館 海洋博公園 熱帶夢幻中心紀念品商店',
    time: '09:45',
    stayTime: 90,
    nextLeg: { mode: 'TRANSIT', mins: 25 },
  },
  {
    id: 'place-b',
    name: 'OkinawaChuraumiAquariumOceanExpoParkSouvenirShop',
    time: '11:40',
  },
];

function renderTimeline(overrides = {}) {
  const props = {
    dayId: 'Day 2',
    items,
    durations: [{ mode: 'TRANSIT', text: '約 25 分鐘', value: 25 }],
    t,
    onAddPlace: vi.fn(),
    onOpenDetails: vi.fn(),
    onNavigate: vi.fn(),
    onOpenActionMenu: vi.fn(),
    activeActionMenuId: '',
    registerActionTrigger: vi.fn(),
    onEditTransit: vi.fn(),
    ...overrides,
  };
  render(<MobileItineraryTimeline {...props} />);
  return props;
}

describe('MobileItineraryTimeline', () => {
  it('renders selected-day places, stay metadata, and a connected transit row', () => {
    renderTimeline();

    expect(screen.getByTestId('itinerary-day-card')).toHaveAttribute('data-day-id', 'Day 2');
    expect(screen.getAllByTestId('place-card')).toHaveLength(2);
    expect(screen.getByText('09:45')).toBeInTheDocument();
    expect(screen.getByText('預計停留 1 小時 30 分鐘')).toHaveClass('text-sm', 'leading-5');
    expect(screen.getByText(items[0].name)).toHaveClass('line-clamp-2', '[overflow-wrap:anywhere]');
    expect(screen.getByText(items[1].name)).toHaveClass('[overflow-wrap:anywhere]');
    const transitRow = screen.getByTestId('transit-timeline-row');
    expect(transitRow).toHaveTextContent('大眾運輸・約 25 分鐘');
    expect(transitRow).toHaveAttribute('data-state', 'ready');
    expect(within(transitRow).getByRole('button')).toHaveClass('min-h-[44px]', 'text-sm', 'leading-5');
  });

  it('shows missing transit data without inventing a duration', () => {
    renderTimeline({ durations: [] });

    expect(screen.getByTestId('transit-timeline-row')).toHaveTextContent('大眾運輸・25 分鐘');
    expect(screen.getByTestId('transit-timeline-row')).not.toHaveTextContent('約 25 分鐘');
  });

  it('opens place details from a focusable native button with Enter and Space', async () => {
    const user = userEvent.setup();
    const props = renderTimeline();
    const firstCard = screen.getAllByTestId('place-card')[0];
    const details = within(firstCard).getByRole('button', {
      name: `查看 ${items[0].name} 詳細資訊`,
    });

    expect(details.tagName).toBe('BUTTON');
    expect(details).toHaveAttribute('type', 'button');
    expect(details).toHaveAttribute('aria-haspopup', 'dialog');

    details.focus();
    expect(details).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(props.onOpenDetails).toHaveBeenCalledTimes(1);
    expect(props.onOpenDetails).toHaveBeenLastCalledWith(items[0], 'Day 2');

    details.focus();
    await user.keyboard(' ');
    expect(props.onOpenDetails).toHaveBeenCalledTimes(2);
    expect(props.onOpenDetails).toHaveBeenLastCalledWith(items[0], 'Day 2');
  });

  it('keeps navigation, menu, and drag handling outside the details action', () => {
    const props = renderTimeline();
    const firstCard = screen.getAllByTestId('place-card')[0];
    const handle = within(firstCard).getByTestId('place-drag-handle');
    const details = within(firstCard).getByTestId('place-details-trigger');
    const navigation = within(firstCard).getByRole('button', { name: /導航到/ });
    const menu = within(firstCard).getByTestId('place-action-menu-trigger');
    const actions = within(firstCard).getByTestId('place-card-actions');

    expect(handle).toHaveAttribute('data-rfd-drag-handle-draggable-id', 'test-drag');
    expect(menu).not.toHaveAttribute('data-rfd-drag-handle-draggable-id');
    expect(within(actions).getAllByRole('button')).toHaveLength(2);
    expect(details.contains(navigation)).toBe(false);
    expect(details.contains(menu)).toBe(false);
    expect(details.contains(handle)).toBe(false);
    expect(firstCard.querySelector('button button, button a, button [role="button"]')).toBeNull();

    fireEvent.click(navigation);
    fireEvent.click(menu);
    fireEvent.click(handle);
    fireEvent.click(firstCard);

    expect(props.onNavigate).toHaveBeenCalledWith(items[0]);
    expect(props.onOpenActionMenu).toHaveBeenCalledTimes(1);
    expect(props.onOpenDetails).not.toHaveBeenCalled();

    fireEvent.click(details);
    expect(props.onOpenDetails).toHaveBeenCalledWith(items[0], 'Day 2');
  });

  it('renders a coherent empty state and timeline-shaped loading state', () => {
    const onAddPlace = vi.fn();
    renderTimeline({ items: [], onAddPlace });

    fireEvent.click(screen.getByTestId('itinerary-empty-add-place'));
    expect(onAddPlace).toHaveBeenCalledTimes(1);

    render(<MobileTimelineSkeleton t={t} />);
    expect(screen.getByTestId('mobile-timeline-skeleton')).toBeInTheDocument();
  });

  it('keeps the drag clone lightweight and content-only', () => {
    render(
      <MobileItineraryDragClone
        item={items[0]}
        index={0}
        provided={{
          innerRef: vi.fn(),
          draggableProps: { style: { height: 160, transform: 'translate(1px, 2px)' } },
          dragHandleProps: {},
        }}
      />,
    );

    const clone = screen.getByTestId('itinerary-drag-clone');
    expect(clone).toHaveAttribute('data-mobile-layout', 'compact');
    expect(clone).toHaveAttribute('data-composition', 'timeline');
    expect(clone).toHaveStyle({ height: 'auto', transform: 'translate(1px, 2px)' });
    expect(clone).toHaveClass('max-h-18', 'max-w-60');
    expect(clone).toHaveTextContent('09:45');
    expect(clone).toHaveTextContent(items[0].name);
    expect(within(clone).queryByRole('button')).not.toBeInTheDocument();
    expect(clone.querySelector('img')).toBeNull();
  });
});
