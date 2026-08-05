import React from 'react';
import { createPortal } from 'react-dom';

import { ResponsiveBottomSheet } from './ResponsiveBottomSheet.jsx';

export function AppearanceDialog({
  color,
  onColorChange,
  onClose,
  t,
  context = 'lobby',
}) {
  const isTrip = context === 'trip';
  const colorLabel = isTrip ? '旅程主題顏色' : '主頁背景顏色';
  const description = isTrip
    ? '選擇旅程主題顏色；變更會立即預覽並隨旅程保存。'
    : '選擇主頁背景顏色；變更會立即預覽並保存在這台裝置。';

  return createPortal(
    <ResponsiveBottomSheet
      onClose={onClose}
      labelledBy="appearance-dialog-title"
      testId="appearance-dialog"
      initialFocusSelector="[data-testid='appearance-color-input']"
      panelClassName={`${t.modalBg} ${t.cardBorder}`}
    >
      <header className={`flex items-start gap-4 border-b p-5 ${t.headerBg} ${t.cardBorder}`}>
        <div className="min-w-0 flex-1">
          <h2 id="appearance-dialog-title" className={`text-lg font-black ${t.mainText}`}>
            自訂外觀
          </h2>
          <p className={`mt-1 text-xs font-bold ${t.subText}`}>
            {description}
          </p>
        </div>
        <button
          type="button"
          data-testid="appearance-close-button"
          onClick={onClose}
          aria-label="關閉自訂外觀"
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-lg font-black ${t.cardBorder} ${t.mainText}`}
        >
          ×
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <label htmlFor="appearance-color-input" className={`text-xs font-black ${t.mainText}`}>
          {colorLabel}
        </label>
        <div className={`mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-2xl border p-4 ${t.cardBg} ${t.cardBorder}`}>
          <input
            id="appearance-color-input"
            data-testid="appearance-color-input"
            type="color"
            value={String(color)}
            onChange={(event) => onColorChange(event.target.value)}
            className="h-16 w-full min-w-0 cursor-pointer rounded-xl border-0 bg-transparent p-0"
            aria-label={`選擇${colorLabel}`}
          />
          <output className={`font-mono text-sm font-black ${t.mainText}`}>
            {String(color).toUpperCase()}
          </output>
        </div>
      </div>

      <footer
        className={`border-t p-5 ${t.headerBg} ${t.cardBorder}`}
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
      >
        <button
          type="button"
          data-testid="appearance-done-button"
          onClick={onClose}
          className="min-h-11 w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg transition-transform active:scale-95"
        >
          完成
        </button>
      </footer>
    </ResponsiveBottomSheet>,
    document.body,
  );
}
