import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OfflineTripPreview } from './OfflineTripPreview.jsx';

describe('OfflineTripPreview', () => {
  const mockSummary = {
    cachedAt: 1672531200000,
    meta: {
      title: 'Trip A',
      destination: 'Taipei',
      startDate: '2023-01-01',
      endDate: '2023-01-05',
      members: ['A', 'B'],
      themeColor: '#123456'
    },
    days: [
      {
        id: 'd1',
        label: 'Day 1',
        items: [
          { id: 'p1', name: 'Place 1', time: '10:00', address: 'Add 1', note: 'N1', category: 'C1' }
        ]
      },
      {
        id: 'd2',
        label: 'Day 2',
        items: []
      }
    ],
    summary: {
      expenseTotal: 500,
      expenseCount: 2,
      checklistCompleted: 1,
      checklistTotal: 3,
      ticketCount: 4
    }
  };

  it('PREVIEW-01 PREVIEW-02 PREVIEW-03 PREVIEW-04 PREVIEW-06 PREVIEW-07 PREVIEW-08 renders correctly', () => {
    render(<OfflineTripPreview summary={mockSummary} isOnline={false} />);
    
    expect(screen.getByTestId('offline-preview-readonly-status')).toBeInTheDocument();
    expect(screen.getByTestId('offline-preview-cache-time')).toHaveTextContent('快取時間');
    
    expect(screen.getByText('Trip A')).toBeInTheDocument();
    expect(screen.getByText('Taipei')).toBeInTheDocument();
    expect(screen.getByText(/A, B/)).toBeInTheDocument();
    
    expect(screen.getByText(/500/)).toBeInTheDocument(); // total expense
    expect(screen.getByText(/2 筆/)).toBeInTheDocument();
    expect(screen.getByText(/1 \/ 3/)).toBeInTheDocument(); // checklist
    expect(screen.getByText(/4 張/)).toBeInTheDocument(); // tickets
    
    expect(screen.getByText('Day 1')).toBeInTheDocument();
    expect(screen.getByText('Place 1')).toBeInTheDocument();
    expect(screen.getByText(/Add 1/)).toBeInTheDocument();
    expect(screen.getByText('N1')).toBeInTheDocument();
  });

  it('PREVIEW-05 renders empty day', () => {
    render(<OfflineTripPreview summary={mockSummary} isOnline={false} />);
    expect(screen.getByText('此日尚無景點')).toBeInTheDocument();
  });

  it('PREVIEW-09 PREVIEW-10 calls callbacks', () => {
    const onBack = vi.fn();
    const onClearCache = vi.fn();
    render(<OfflineTripPreview summary={mockSummary} isOnline={false} onBack={onBack} onClearCache={onClearCache} />);
    
    fireEvent.click(screen.getByTestId('offline-preview-back'));
    expect(onBack).toHaveBeenCalled();
    
    fireEvent.click(screen.getByTestId('offline-preview-clear-cache'));
    expect(onClearCache).toHaveBeenCalled();
  });

  it('PREVIEW-11 shows online banner when online', () => {
    const onOpenOnline = vi.fn();
    render(<OfflineTripPreview summary={mockSummary} isOnline={true} onOpenOnline={onOpenOnline} />);
    
    const btn = screen.getByTestId('offline-preview-open-online');
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onOpenOnline).toHaveBeenCalled();
  });

  it('PREVIEW-12 hides online banner when offline', () => {
    render(<OfflineTripPreview summary={mockSummary} isOnline={false} />);
    expect(screen.queryByTestId('offline-preview-open-online')).toBeNull();
  });
  
  it('PREVIEW-13 does not render any editing features', () => {
    render(<OfflineTripPreview summary={mockSummary} isOnline={false} />);
    expect(screen.queryByText(/新增/)).toBeNull();
    expect(screen.queryByText(/編輯/)).toBeNull();
    expect(screen.queryByText(/刪除/)).toBeNull();
  });
});
