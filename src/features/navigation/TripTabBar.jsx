import React from 'react';

import { Icon } from '../../components/ui/Icon.jsx';

const MOBILE_TABS = [
  { id: 'plan', label: '行程', icon: 'clipboard', testId: 'mobile-nav-plan' },
  { id: 'map', label: '地圖', icon: 'map', testId: 'mobile-nav-map' },
  { id: 'ticket', label: '票券', icon: 'ticket', testId: 'ticket-tab-button' },
  { id: 'expense', label: '記帳', icon: 'receipt', testId: 'expense-tab-button' },
];

const DESKTOP_TABS = [
  { id: 'plan', label: '行程', icon: 'clipboard' },
  { id: 'expense', label: '記帳', icon: 'receipt', testId: 'expense-tab-button' },
  { id: 'ticket', label: '票券', icon: 'ticket', testId: 'ticket-tab-button' },
];

export function TripTabBar({ activeTab, layout, onSelect, t }) {
  const inactiveHoverClass = t?.isLight === false
    ? 'hover:bg-white/10'
    : 'hover:bg-slate-900/5';

  if (layout === 'mobile') {
    return (
      <nav
        data-testid="mobile-bottom-navigation"
        aria-label="旅程主要功能"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.5rem)' }}
        className={`z-30 grid h-[calc(4.5rem+max(env(safe-area-inset-bottom),0.5rem))] shrink-0 grid-cols-4 border-t px-2 pt-1 shadow-[0_-10px_28px_-22px_rgba(15,23,42,0.65)] md:hidden ${t.headerBg} ${t.cardBorder}`}
      >
        {MOBILE_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              data-testid={tab.testId}
              data-layout={tab.id === 'ticket' || tab.id === 'expense' ? 'mobile' : undefined}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onSelect(tab.id)}
              className={`mx-1 flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 rounded-2xl px-2 text-xs font-extrabold transition-[background-color,color,transform] duration-200 ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : `${t.subText} ${inactiveHoverClass}`
              }`}
            >
              <Icon name={tab.icon} size={22} strokeWidth={isActive ? 2.2 : 1.8} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    );
  }

  return (
    <nav
      aria-label="旅程主要功能"
      className={`hidden min-h-11 items-center gap-1 rounded-xl border p-1 shadow-inner md:flex ${t.cardBg} ${t.cardBorder}`}
    >
      {DESKTOP_TABS.map((tab) => {
        const isActive = tab.id === 'plan'
          ? activeTab === 'plan' || activeTab === 'map'
          : activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            data-testid={tab.testId}
            data-layout={tab.testId ? 'desktop' : undefined}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onSelect(tab.id)}
            className={`flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-extrabold transition-[background-color,color,box-shadow] duration-200 ${
              isActive
                ? 'bg-blue-600 text-white shadow-sm'
                : `${t.subText} ${inactiveHoverClass}`
            }`}
          >
            <Icon name={tab.icon} size={17} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default TripTabBar;
