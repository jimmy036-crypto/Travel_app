import React, { useEffect, useState } from 'react';

import {
  clearDndDebugEvents,
  installRawEventTrace,
  isDndDebugEnabled,
  subscribeDndDebugEvents,
} from './dndDebugTrace.js';

const COLUMNS = [
  ['t', 't(ms)'],
  ['event', 'event'],
  ['targetTestId', 'target'],
  ['pointerType', 'pointerType'],
  ['touchIdentifier', 'touchId'],
  ['touchesCount', 'touches'],
  ['changedTouchesCount', 'changed'],
  ['cancelable', 'cancelable'],
  ['defaultPrevented', 'prevented'],
  ['sinceLastScrollMs', 'sinceScroll'],
  ['activeDraggable', 'activeDraggable'],
  ['phase', 'phase'],
  ['sourceIndex', 'srcIdx'],
  ['destinationIndex', 'dstIdx'],
  ['reason', 'reason'],
];

/**
 * On-screen, non-PII drag event panel for physical-device diagnosis. Only
 * mounts when `?dndDebug=1` is present; renders nothing otherwise. Shows the
 * last 60 lifecycle/touch/pointer/scroll/click events so a tester can copy
 * evidence directly off an iPhone without needing devtools console access.
 */
export function DndDebugPanel() {
  const [events, setEvents] = useState(/** @type {Array<Record<string, unknown>>} */ ([]));
  const [collapsed, setCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isDndDebugEnabled()) return undefined;
    installRawEventTrace();
    return subscribeDndDebugEvents(setEvents);
  }, []);

  if (!isDndDebugEnabled()) return null;

  const handleCopy = async () => {
    const text = JSON.stringify(events, null, 2);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        window.prompt('複製 dndDebug 事件紀錄', text);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('複製 dndDebug 事件紀錄', text);
    }
  };

  return (
    <div
      data-testid="dnd-debug-panel"
      className="fixed inset-x-0 bottom-0 z-10060 max-h-[45dvh] overflow-hidden border-t border-white/20 bg-black/90 text-[10px] text-white backdrop-blur-sm"
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/20 px-2 py-1.5">
        <span className="font-black">dndDebug ({events.length}/60)</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            data-testid="dnd-debug-copy"
            onClick={handleCopy}
            className="rounded border border-white/30 px-2 py-1 font-bold active:scale-95"
          >
            {copied ? '已複製' : '複製紀錄'}
          </button>
          <button
            type="button"
            data-testid="dnd-debug-clear"
            onClick={() => clearDndDebugEvents()}
            className="rounded border border-white/30 px-2 py-1 font-bold active:scale-95"
          >
            清除
          </button>
          <button
            type="button"
            data-testid="dnd-debug-toggle"
            onClick={() => setCollapsed((previous) => !previous)}
            className="rounded border border-white/30 px-2 py-1 font-bold active:scale-95"
          >
            {collapsed ? '展開' : '收合'}
          </button>
        </div>
      </div>
      {collapsed ? null : (
        <div className="overflow-auto" style={{ maxHeight: '38dvh' }}>
          <table className="w-full min-w-max border-collapse text-left">
            <thead>
              <tr>
                {COLUMNS.map(([key, label]) => (
                  <th key={key} className="sticky top-0 whitespace-nowrap border-b border-white/20 bg-black/95 px-1.5 py-1 font-bold">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...events].reverse().map((entry) => (
                <tr key={String(entry.id)} className="odd:bg-white/5">
                  {COLUMNS.map(([key]) => (
                    <td key={key} className="whitespace-nowrap px-1.5 py-0.5">
                      {String(entry[key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
