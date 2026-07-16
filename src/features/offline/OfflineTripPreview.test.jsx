import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OfflineTripPreview } from './OfflineTripPreview.jsx';
import * as firebaseModule from '../../firebase.js';
import * as firebaseDatabase from 'firebase/database';

vi.mock('../../firebase.js', () => ({
  db: null,
  storage: null,
  __firebaseAccess: vi.fn(() => {
    throw new Error('Firebase should not be called');
  }),
}));

vi.mock('firebase/database', () => ({
  ref: vi.fn(() => {
    throw new Error('Firebase database should not be called');
  }),
  get: vi.fn(() => {
    throw new Error('Firebase database should not be called');
  }),
  set: vi.fn(() => {
    throw new Error('Firebase database should not be called');
  }),
  update: vi.fn(() => {
    throw new Error('Firebase database should not be called');
  }),
  onValue: vi.fn(() => {
    throw new Error('Firebase database should not be called');
  }),
}));

const mockSummary = {
  version: 1,
  roomId: 'room1',
  cachedAt: 1672531200000,
  meta: {
    title: 'Trip A',
    destination: 'Taipei',
    startDate: '2023-01-01',
    endDate: '2023-01-05',
    members: ['A', 'B'],
    themeColor: '#123456',
  },
  days: [
    {
      id: 'd1',
      label: 'Day 1',
      items: [
        { id: 'p1', name: 'Place 1', time: '10:00', address: 'Add 1', note: 'N1', category: 'C1' },
      ],
    },
    {
      id: 'd2',
      label: 'Day 2',
      items: [],
    },
  ],
  summary: {
    expenseTotal: 500,
    expenseCount: 2,
    checklistCompleted: 1,
    checklistTotal: 3,
    ticketCount: 4,
  },
};

describe('OfflineTripPreview', () => {
  it('PREVIEW-01 renders basic trip information', () => {
    render(<OfflineTripPreview summary={mockSummary} isOnline={false} />);

    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Trip A' })).toBeInTheDocument();
    expect(screen.getByText('Taipei')).toBeInTheDocument();
    expect(screen.getByText('A, B')).toBeInTheDocument();
  });

  it('PREVIEW-02 renders a valid cache time', () => {
    render(<OfflineTripPreview summary={mockSummary} isOnline={false} />);

    expect(screen.getByTestId('offline-preview-cache-time')).toHaveTextContent('快取時間：');
    expect(screen.getByTestId('offline-preview-cache-time')).not.toHaveTextContent('快取時間未知');
  });

  it('PREVIEW-03 renders readonly and stale explanations', () => {
    render(<OfflineTripPreview summary={mockSummary} isOnline={false} />);

    expect(screen.getByTestId('offline-preview-readonly-status')).toHaveTextContent('離線唯讀預覽');
    expect(screen.getByTestId('offline-preview-stale-note')).toHaveTextContent('可能不是雲端最新內容');
  });

  it('PREVIEW-04 renders daily itinerary places', () => {
    render(<OfflineTripPreview summary={mockSummary} isOnline={false} />);

    expect(screen.getByText('Day 1')).toBeInTheDocument();
    expect(screen.getByText('Place 1')).toBeInTheDocument();
    expect(screen.getByText('10:00')).toBeInTheDocument();
    expect(screen.getByText('Add 1')).toBeInTheDocument();
    expect(screen.getByText('N1')).toBeInTheDocument();
  });

  it('PREVIEW-05 renders an empty day', () => {
    render(<OfflineTripPreview summary={mockSummary} isOnline={false} />);

    expect(screen.getByText('此日尚無景點')).toBeInTheDocument();
  });

  it('PREVIEW-06 renders expense summary', () => {
    render(<OfflineTripPreview summary={mockSummary} isOnline={false} />);

    expect(screen.getByText('支出總額（2 筆）')).toBeInTheDocument();
    expect(screen.getByText('NT$ 500')).toBeInTheDocument();
  });

  it('PREVIEW-07 renders checklist summary', () => {
    render(<OfflineTripPreview summary={mockSummary} isOnline={false} />);

    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('PREVIEW-08 renders ticket summary', () => {
    render(<OfflineTripPreview summary={mockSummary} isOnline={false} />);

    expect(screen.getByText('4 張')).toBeInTheDocument();
  });

  it('PREVIEW-09 calls back callback', () => {
    const onBack = vi.fn();
    render(<OfflineTripPreview summary={mockSummary} isOnline={false} onBack={onBack} />);

    fireEvent.click(screen.getByTestId('offline-preview-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('PREVIEW-10 calls clear callback', () => {
    const onClearCache = vi.fn();
    render(<OfflineTripPreview summary={mockSummary} isOnline={false} onClearCache={onClearCache} />);

    fireEvent.click(screen.getByTestId('offline-preview-clear-cache'));
    expect(onClearCache).toHaveBeenCalledTimes(1);
  });

  it('PREVIEW-11 renders and calls online action', () => {
    const onOpenOnline = vi.fn();
    render(<OfflineTripPreview summary={mockSummary} isOnline={true} onOpenOnline={onOpenOnline} />);

    fireEvent.click(screen.getByTestId('offline-preview-open-online'));
    expect(onOpenOnline).toHaveBeenCalledTimes(1);
  });

  it('PREVIEW-12 hides online action while offline', () => {
    render(<OfflineTripPreview summary={mockSummary} isOnline={false} />);

    expect(screen.queryByTestId('offline-preview-open-online')).not.toBeInTheDocument();
  });

  it('PREVIEW-13 does not render product modification actions', () => {
    render(<OfflineTripPreview summary={mockSummary} isOnline={false} />);

    expect(screen.queryByText('新增')).not.toBeInTheDocument();
    expect(screen.queryByText('編輯')).not.toBeInTheDocument();
    expect(screen.queryByText('刪除雲端')).not.toBeInTheDocument();
  });

  it('PREVIEW-14 does not import or call Firebase during render and interaction', () => {
    const onBack = vi.fn();
    const onClearCache = vi.fn();
    const onOpenOnline = vi.fn();
    render(
      <OfflineTripPreview
        summary={mockSummary}
        isOnline={true}
        onBack={onBack}
        onClearCache={onClearCache}
        onOpenOnline={onOpenOnline}
      />
    );

    fireEvent.click(screen.getByTestId('offline-preview-back'));
    fireEvent.click(screen.getByTestId('offline-preview-clear-cache'));
    fireEvent.click(screen.getByTestId('offline-preview-open-online'));

    expect(firebaseModule.__firebaseAccess).not.toHaveBeenCalled();
    expect(firebaseDatabase.ref).not.toHaveBeenCalled();
    expect(firebaseDatabase.get).not.toHaveBeenCalled();
    expect(firebaseDatabase.set).not.toHaveBeenCalled();
    expect(firebaseDatabase.update).not.toHaveBeenCalled();
    expect(firebaseDatabase.onValue).not.toHaveBeenCalled();
  });

  it('PREVIEW-15 renders safely with summary null', () => {
    const { container } = render(<OfflineTripPreview summary={null} isOnline={false} />);

    expect(screen.getByText('未命名旅程')).toBeInTheDocument();
    expect(screen.getByText('尚無行程資料')).toBeInTheDocument();
    expect(container).not.toHaveTextContent('[object Object]');
  });

  it('PREVIEW-16 handles days as a non-array', () => {
    render(<OfflineTripPreview summary={{ ...mockSummary, days: {} }} isOnline={false} />);

    expect(screen.getByText('尚無行程資料')).toBeInTheDocument();
  });

  it('PREVIEW-17 handles null day entries', () => {
    render(<OfflineTripPreview summary={{ ...mockSummary, days: [null] }} isOnline={false} />);

    expect(screen.getByText('Day 1')).toBeInTheDocument();
    expect(screen.getByText('此日尚無景點')).toBeInTheDocument();
  });

  it('PREVIEW-18 handles day.items as a non-array', () => {
    render(<OfflineTripPreview summary={{ ...mockSummary, days: [{ id: 'd1', label: 'Day 1', items: {} }] }} isOnline={false} />);

    expect(screen.getByText('此日尚無景點')).toBeInTheDocument();
  });

  it('PREVIEW-19 handles null item entries', () => {
    render(<OfflineTripPreview summary={{ ...mockSummary, days: [{ id: 'd1', label: 'Day 1', items: [null] }] }} isOnline={false} />);

    expect(screen.getByTestId('offline-preview-place')).toBeInTheDocument();
    expect(screen.getByText('未定時間')).toBeInTheDocument();
  });

  it('PREVIEW-20 handles invalid cachedAt without Invalid Date', () => {
    const { container } = render(<OfflineTripPreview summary={{ ...mockSummary, cachedAt: 'bad' }} isOnline={false} />);

    expect(screen.getByTestId('offline-preview-cache-time')).toHaveTextContent('快取時間未知');
    expect(container).not.toHaveTextContent('Invalid Date');
  });

  it('PREVIEW-21 normalizes invalid numeric summary values to 0', () => {
    render(
      <OfflineTripPreview
        summary={{
          ...mockSummary,
          summary: {
            expenseTotal: { amount: 1 },
            expenseCount: '2',
            checklistCompleted: Number.POSITIVE_INFINITY,
            checklistTotal: -1,
            ticketCount: {},
          },
        }}
        isOnline={false}
      />
    );

    expect(screen.getByText('支出總額（0 筆）')).toBeInTheDocument();
    expect(screen.getByText('NT$ 0')).toBeInTheDocument();
    expect(screen.getByText('0 / 0')).toBeInTheDocument();
    expect(screen.getByText('0 張')).toBeInTheDocument();
  });

  it('PREVIEW-22 handles members as a non-array', () => {
    render(<OfflineTripPreview summary={{ ...mockSummary, meta: { ...mockSummary.meta, members: {} } }} isOnline={false} />);

    expect(screen.getByText('自己')).toBeInTheDocument();
  });
});
