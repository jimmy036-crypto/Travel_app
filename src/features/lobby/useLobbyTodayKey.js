import { useEffect, useState } from 'react';

function formatLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getNextMidnightDelay(now) {
  const nextDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    1,
  );
  return Math.max(1_000, nextDay.getTime() - now.getTime());
}

export function useLobbyTodayKey(enabled = true) {
  const [todayKey, setTodayKey] = useState(() => formatLocalDateKey(new Date()));

  useEffect(() => {
    if (!enabled) return undefined;

    let timeoutId = null;

    const clearMidnightTimer = () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      timeoutId = null;
    };

    const refreshAndSchedule = () => {
      clearMidnightTimer();
      if (document.hidden) return;

      const now = new Date();
      setTodayKey(formatLocalDateKey(now));
      timeoutId = window.setTimeout(refreshAndSchedule, getNextMidnightDelay(now));
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearMidnightTimer();
        return;
      }
      refreshAndSchedule();
    };

    refreshAndSchedule();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearMidnightTimer();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled]);

  return todayKey;
}

export default useLobbyTodayKey;
