import React from 'react';

export function ParkingDetailsSheet({ facility, onClose, t }) {
  if (!facility) return null;
  return (
    <aside className={`fixed inset-x-3 bottom-3 z-50 rounded-3xl border p-4 shadow-2xl ${t.headerBg} ${t.cardBorder}`}>
      <button type="button" className="min-h-11" onClick={onClose}>關閉</button>
      <pre className={`max-h-80 overflow-auto whitespace-pre-wrap text-xs ${t.mainText}`}>{JSON.stringify(facility, null, 2)}</pre>
    </aside>
  );
}
