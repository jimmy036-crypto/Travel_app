import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
    expect(screen.getByText('預計停留 1 小時 30 分鐘')).toBeInTheDocument();
    expect(screen.getByText(items[0].name)).toHaveClass('line-clamp-2', '[overflow-wrap:anywhere]');
    expect(screen.getByText(items[1].name)).toHaveClass('[overflow-wrap:anywhere]');
    expect(screen.getByTestId('transit-timeline-row')).toHaveTextContent('大眾運輸・約 25 分鐘');
    expect(screen.getByTestId('transit-timeline-row')).toHaveAttribute('data-state', 'ready');
  });

  it('shows missing transit data without inventing a duration', () => {
    renderTimeline({ durations: [] });

    expect(screen.getByTestId('transit-timeline-row')).toHaveTextContent('大眾運輸・25 分鐘');
    expect(screen.getByTestId('transit-timeline-row')).not.toHaveTextContent('約 25 分鐘');
  });

  it('isolates navigation and menu actions from opening place details or dragging', () => {
    const props = renderTimeline();
    const firstCard = screen.getAllByTestId('place-card')[0];
    const handle = within(firstCard).getByTestId('place-drag-handle');
    const navigation = within(firstCard).getByRole('button', { name: /導航到/ });
    const menu = within(firstCard).getByTestId('place-action-menu-trigger');

    expect(handle).toHaveAttribute('data-rfd-drag-handle-draggable-id', 'test-drag');
    expect(menu).not.toHaveAttribute('data-rfd-drag-handle-draggable-id');

    fireEvent.click(navigation);
    fireEvent.click(menu);

    expect(props.onNavigate).toHaveBeenCalledWith(items[0]);
    expect(props.onOpenActionMenu).toHaveBeenCalledTimes(1);
    expect(props.onOpenDetails).not.toHaveBeenCalled();

    fireEvent.click(firstCard);
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
