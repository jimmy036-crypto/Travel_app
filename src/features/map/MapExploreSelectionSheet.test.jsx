import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MapExploreSelectionSheet } from './MapExploreSelectionSheet.jsx';

const t = {
  headerBg: 'bg-white',
  cardMetaBg: 'bg-slate-100',
  cardBorder: 'border-slate-200',
  mainText: 'text-slate-900',
  subText: 'text-slate-600',
};

const place = {
  place_id: 'result-1',
  name: '車站咖啡',
  formatted_address: '台北市中正區',
  rating: 4.5,
  user_ratings_total: 80,
};

describe('MapExploreSelectionSheet', () => {
  it('stays inside the map panel and exposes day-specific anchored itinerary actions', () => {
    const onBack = vi.fn();
    const onShowDetails = vi.fn();
    const onAdd = vi.fn();
    render(
      <MapExploreSelectionSheet
        place={place}
        originItem={{ id: 'station', name: '台北車站' }}
        dayLabel="Day 2（9/21）"
        onBack={onBack}
        onShowDetails={onShowDetails}
        onAdd={onAdd}
        t={t}
      />,
    );

    const sheet = screen.getByRole('region', { name: '車站咖啡' });
    expect(sheet).toHaveClass('absolute', 'inset-x-2', 'bottom-2', 'lg:w-96');
    expect(sheet).not.toHaveClass('fixed');
    expect(screen.getByTestId('map-explore-add-target')).toHaveTextContent('將加入 Day 2（9/21）');

    fireEvent.click(screen.getByRole('button', { name: '返回附近搜尋結果' }));
    fireEvent.click(screen.getByRole('button', { name: '查看詳情與實景照' }));
    fireEvent.click(screen.getByRole('button', { name: '加到 Day 2（9/21）：這站前' }));
    fireEvent.click(screen.getByRole('button', { name: '加到 Day 2（9/21）：這站後' }));

    expect(onBack).toHaveBeenCalledOnce();
    expect(onShowDetails).toHaveBeenCalledOnce();
    expect(onAdd).toHaveBeenNthCalledWith(1, 'before');
    expect(onAdd).toHaveBeenNthCalledWith(2, 'after');
  });

  it('uses the end action without an anchor and keeps dark-mode rating contrast', () => {
    const onAdd = vi.fn();
    render(
      <MapExploreSelectionSheet
        place={place}
        originItem={null}
        onBack={vi.fn()}
        onShowDetails={vi.fn()}
        onAdd={onAdd}
        t={{ ...t, isLight: false }}
      />,
    );

    expect(screen.getByText('★ 4.5')).toHaveClass('text-orange-200');
    expect(screen.getByTestId('map-explore-add-target')).toHaveTextContent('將加入 目前日期');
    fireEvent.click(screen.getByRole('button', { name: '加入 目前日期 行程最後' }));
    expect(onAdd).toHaveBeenCalledWith('end');
  });

  it('moves initial focus to the selected place and returns on Escape', () => {
    const onBack = vi.fn();
    render(
      <MapExploreSelectionSheet
        place={place}
        originItem={null}
        dayLabel="Day 1"
        onBack={onBack}
        onShowDetails={vi.fn()}
        onAdd={vi.fn()}
        t={t}
      />,
    );

    const sheet = screen.getByRole('region', { name: '車站咖啡' });
    expect(sheet).toHaveFocus();
    fireEvent.keyDown(sheet, { key: 'Escape' });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('disables every add action while pending and cannot submit again', () => {
    const onAdd = vi.fn();
    const { rerender } = render(
      <MapExploreSelectionSheet
        place={place}
        originItem={{ id: 'station', name: '台北車站' }}
        dayLabel="Day 2"
        onBack={vi.fn()}
        onShowDetails={vi.fn()}
        onAdd={onAdd}
        t={t}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '加到 Day 2：這站後' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenLastCalledWith('after');

    rerender(
      <MapExploreSelectionSheet
        place={place}
        originItem={{ id: 'station', name: '台北車站' }}
        dayLabel="Day 2"
        isAdding
        onBack={vi.fn()}
        onShowDetails={vi.fn()}
        onAdd={onAdd}
        t={t}
      />,
    );

    const before = screen.getByRole('button', { name: '加到 Day 2：這站前' });
    const after = screen.getByRole('button', { name: '加到 Day 2：這站後' });
    for (const action of [before, after]) {
      expect(action).toBeDisabled();
      expect(action).toHaveAttribute('aria-busy', 'true');
      fireEvent.click(action);
    }
    expect(screen.getByRole('status')).toHaveTextContent('正在加入 Day 2，請稍候…');
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('reports detail loading and failure states while keeping retry explicit', () => {
    const onShowDetails = vi.fn();
    const { rerender } = render(
      <MapExploreSelectionSheet
        place={place}
        originItem={null}
        dayLabel="Day 1"
        isFetchingDetails
        onBack={vi.fn()}
        onShowDetails={onShowDetails}
        onAdd={vi.fn()}
        t={t}
      />,
    );

    const loading = screen.getByRole('button', { name: '正在載入詳情…' });
    expect(loading).toBeDisabled();
    expect(loading).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(loading);
    expect(onShowDetails).not.toHaveBeenCalled();

    rerender(
      <MapExploreSelectionSheet
        place={place}
        originItem={null}
        dayLabel="Day 1"
        detailsError="無法取得詳細資訊，請重試。"
        onBack={vi.fn()}
        onShowDetails={onShowDetails}
        onAdd={vi.fn()}
        t={t}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('無法取得詳細資訊，請重試。');
    const retry = screen.getByRole('button', { name: '重試載入詳情' });
    expect(retry).toBeEnabled();
    expect(retry).toHaveAttribute('aria-busy', 'false');
    fireEvent.click(retry);
    expect(onShowDetails).toHaveBeenCalledTimes(1);
  });
});
