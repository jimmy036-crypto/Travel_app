import { useEffect, useRef } from 'react';
import { CATEGORIES } from '../../constants';

export function ExpenseCategoryPicker({ value, onChange, t }) {
  const listRef = useRef(null);

  useEffect(() => {
    const list = listRef.current;
    const onWheel = (event) => {
      if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? list.clientWidth : 1);
      const next = Math.max(0, Math.min(list.scrollWidth - list.clientWidth, list.scrollLeft + delta));
      if (next === list.scrollLeft) return;
      event.preventDefault();
      list.scrollLeft = next;
    };
    list.addEventListener('wheel', onWheel, { passive: false });
    return () => list.removeEventListener('wheel', onWheel);
  }, []);

  const scroll = (direction) => listRef.current?.scrollBy({ left: direction * listRef.current.clientWidth * 0.8 });
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span id="expense-category-label" className={`text-xs font-bold ${t.subText}`}>分類</span>
        <div className="flex gap-2">
          <button type="button" aria-label="向左捲動分類" onClick={() => scroll(-1)} className={`h-11 w-11 rounded-lg border focus-visible:outline-2 focus-visible:outline-blue-500 ${t.cardBorder} ${t.mainText}`}>‹</button>
          <button type="button" aria-label="向右捲動分類" onClick={() => scroll(1)} className={`h-11 w-11 rounded-lg border focus-visible:outline-2 focus-visible:outline-blue-500 ${t.cardBorder} ${t.mainText}`}>›</button>
        </div>
      </div>
      <div ref={listRef} role="group" aria-labelledby="expense-category-label" data-testid="expense-category-list" className="flex min-w-0 gap-2 overflow-x-auto overscroll-x-contain pb-2">
        {CATEGORIES.map((option) => (
          <button
            type="button"
            key={option.id}
            data-testid="expense-category-button"
            data-category={option.id}
            aria-pressed={value === option.id}
            onClick={() => onChange(option.id)}
            className={`min-h-11 shrink-0 select-none px-4 py-2 rounded-xl border flex items-center gap-2 whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 ${value === option.id ? `${option.color} border-transparent text-white shadow-md` : `${t.cardBg} ${t.cardBorder} ${t.subText}`}`}
          >
            <span aria-hidden="true">{option.icon}</span><span className="text-xs font-bold">{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
