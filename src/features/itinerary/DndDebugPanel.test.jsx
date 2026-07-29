import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DndDebugPanel } from './DndDebugPanel.jsx';
import { clearDndDebugEvents, traceDnd } from './dndDebugTrace.js';

describe('DndDebugPanel', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
    clearDndDebugEvents();
  });

  it('renders nothing without ?dndDebug=1', () => {
    render(<DndDebugPanel />);
    expect(screen.queryByTestId('dnd-debug-panel')).not.toBeInTheDocument();
  });

  describe('with ?dndDebug=1', () => {
    beforeEach(() => {
      window.history.replaceState(null, '', '/?dndDebug=1');
    });

    it('shows lifecycle events pushed via traceDnd, most recent first, with no place data', () => {
      render(<DndDebugPanel />);
      fireEvent.click(screen.getByTestId('dnd-debug-clear'));
      act(() => {
        traceDnd('onDragStart', { sourceDroppableId: 'Day 1', sourceIndex: 0 });
        traceDnd('onDragEnd', {
          sourceDroppableId: 'Day 1',
          sourceIndex: 0,
          destinationDroppableId: 'Day 1',
          destinationIndex: 2,
          reason: 'DROP',
        });
      });

      const rows = screen.getAllByRole('row');
      // header row + 2 event rows, most recent (onDragEnd) first.
      expect(rows.length).toBeGreaterThanOrEqual(3);
      expect(rows[1]).toHaveTextContent('onDragEnd');
      expect(rows[2]).toHaveTextContent('onDragStart');

      const panelText = screen.getByTestId('dnd-debug-panel').textContent || '';
      expect(panelText).not.toMatch(/lat|lng|room|firebase/i);
    });

    it('clear button empties the event list', () => {
      render(<DndDebugPanel />);
      act(() => {
        traceDnd('onDragStart', {});
      });
      fireEvent.click(screen.getByTestId('dnd-debug-clear'));
      expect(screen.getByTestId('dnd-debug-panel')).toHaveTextContent('dndDebug (0/60)');
    });

    it('collapse button hides the event table without unmounting the panel', () => {
      render(<DndDebugPanel />);
      fireEvent.click(screen.getByTestId('dnd-debug-toggle'));
      expect(screen.getByTestId('dnd-debug-panel')).toBeInTheDocument();
      expect(screen.queryAllByRole('row')).toHaveLength(0);
    });
  });
});
