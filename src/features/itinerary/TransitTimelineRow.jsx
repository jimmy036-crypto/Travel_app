import React from 'react';

import { formatStayTime } from '../../helpers.js';

const MODE_LABELS = Object.freeze({
  AUTO: ['🚗', '開車'],
  DRIVE: ['🚗', '開車'],
  WALK: ['🚶', '步行'],
  TRAIN: ['🚆', '鐵路'],
  TRANSIT: ['🚇', '大眾運輸'],
  FLIGHT: ['✈️', '飛行'],
  ERROR: ['⚠️', '路線'],
});

function getTransitTimelinePresentation(item, duration) {
  const mode = String(duration?.mode || item?.nextLeg?.mode || 'AUTO').toUpperCase();
  const [icon, label] = MODE_LABELS[mode] || MODE_LABELS.AUTO;

  if (mode === 'ERROR') {
    return {
      icon,
      label,
      detail: String(duration?.text || '無法計算'),
      state: 'error',
    };
  }

  if (duration?.text) {
    return {
      icon,
      label,
      detail: String(duration.text),
      state: 'ready',
    };
  }

  const storedMinutes = Number(item?.nextLeg?.mins);
  if (mode !== 'AUTO' && Number.isFinite(storedMinutes) && storedMinutes >= 0) {
    return {
      icon,
      label,
      detail: formatStayTime(storedMinutes),
      state: 'ready',
    };
  }

  return {
    icon,
    label,
    detail: '交通時間待計算',
    state: 'missing',
  };
}

export function TransitTimelineRow({ item, duration, index, t, onEdit }) {
  const presentation = getTransitTimelinePresentation(item, duration);
  const content = (
    <>
      <span aria-hidden="true">{presentation.icon}</span>
      <span>{presentation.label}</span>
      <span aria-hidden="true">・</span>
      <span>{presentation.detail}</span>
    </>
  );

  return (
    <div
      data-testid="transit-timeline-row"
      data-index={String(index)}
      data-state={presentation.state}
      className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-2"
    >
      <div className="relative flex min-h-10 justify-center" aria-hidden="true">
        <span className="absolute inset-y-0 w-px border-l border-dashed border-slate-400/60" />
      </div>
      {onEdit ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onEdit();
          }}
          className={`flex min-h-10 min-w-0 items-center gap-1 self-center rounded-xl px-2 text-left text-[11px] font-bold ${t.subText}`}
          aria-label={`編輯交通方式：${presentation.label}，${presentation.detail}`}
        >
          {content}
        </button>
      ) : (
        <div className={`flex min-h-10 min-w-0 items-center gap-1 px-2 text-[11px] font-bold ${t.subText}`}>
          {content}
        </div>
      )}
    </div>
  );
}
