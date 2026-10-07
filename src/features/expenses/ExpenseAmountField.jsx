import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const KEYS = ['(', ')', 'clear', 'delete', '7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '0', '.', '=', '+'];
const LABELS = { clear: '清除金額', delete: '刪除一位', '=': '計算結果' };

// Keep one input path for physical keyboards, paste, and the on-screen keypad.
export function ExpenseAmountField({ t, value, onChange, onBlur, onKeyDown, ...inputProps }) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);
  const caretRef = useRef(null);
  const fieldRef = useRef(null);
  const pointerDownRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    const startPointer = () => { pointerDownRef.current = true; };
    const endPointer = () => { pointerDownRef.current = false; };
    const closeOutside = (event) => {
      if (!fieldRef.current?.contains(event.target)) setOpen(false);
      endPointer();
    };
    // Collapsing on pointer blur moves the clicked control before its click fires.
    document.addEventListener('pointerdown', startPointer, true);
    document.addEventListener('keydown', endPointer, true);
    document.addEventListener('pointercancel', endPointer, true);
    document.addEventListener('click', closeOutside);
    return () => {
      document.removeEventListener('pointerdown', startPointer, true);
      document.removeEventListener('keydown', endPointer, true);
      document.removeEventListener('pointercancel', endPointer, true);
      document.removeEventListener('click', closeOutside);
      pointerDownRef.current = false;
    };
  }, [open]);

  useLayoutEffect(() => {
    if (caretRef.current === null) return;
    inputRef.current?.setSelectionRange(caretRef.current, caretRef.current);
    caretRef.current = null;
  }, [value]);

  const pressKey = (key) => {
    if (key === '=') {
      onBlur?.();
      return;
    }
    const input = inputRef.current;
    const start = input.selectionStart ?? value.length;
    const end = input.selectionEnd ?? start;
    const from = key === 'delete' && start === end ? Math.max(0, start - 1) : start;
    const inserted = key === 'delete' ? '' : key;
    const next = key === 'clear' ? '' : value.slice(0, from) + inserted + value.slice(end);
    const caret = key === 'clear' ? 0 : from + inserted.length;
    if (next === value) {
      caretRef.current = null;
      input.setSelectionRange(caret, caret);
      return;
    }
    caretRef.current = caret;
    onChange({ target: { value: next } });
  };

  return (
    <div
      ref={fieldRef}
      className="contents"
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) {
          if (event.target === inputRef.current) onBlur?.();
          return;
        }
        onBlur?.();
        if (!pointerDownRef.current) setOpen(false);
      }}
    >
      <input
        {...inputProps}
        ref={inputRef}
        type="text"
        inputMode="none"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={onChange}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {open ? (
        <div role="group" aria-label="金額計算鍵盤" className={`col-span-full mt-2 grid w-full grid-cols-4 gap-2 rounded-xl border p-2 ${t.cardMetaBg} ${t.cardBorder}`}>
          <output aria-label="目前算式" className={`sticky top-0 col-span-full overflow-x-auto rounded-lg p-2 text-right font-mono text-base ${t.isLight ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'}`}>
            {value || '0'}
          </output>
          {KEYS.map((key) => (
            <button
              key={key}
              type="button"
              aria-label={LABELS[key] || key}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pressKey(key)}
              className={`min-h-11 min-w-11 rounded-lg border text-lg font-bold touch-manipulation focus-visible:outline-2 focus-visible:outline-blue-500 active:bg-blue-500/20 ${key === '=' ? 'bg-blue-600 text-white border-blue-600' : `${t.cardBg} ${t.cardBorder} ${t.mainText}`}`}
            >
              {key === 'clear' ? 'C' : key === 'delete' ? '⌫' : key}
            </button>
          ))}
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onBlur?.();
              inputRef.current?.focus();
              setOpen(false);
            }}
            className={`col-span-full min-h-11 rounded-lg text-sm font-bold focus-visible:outline-2 focus-visible:outline-blue-500 ${t.mainText}`}
          >完成輸入</button>
        </div>
      ) : null}
    </div>
  );
}
