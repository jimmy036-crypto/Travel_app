import { useMemo, useState } from 'react';

/**
 * Opt-in (?qaDebug=1), non-intrusive build-identity badge so a tester can
 * confirm which commit a Preview deployment is actually serving instead of
 * assuming a stale deployment or cached Service Worker is current. Hidden by
 * default in every environment, including Preview and Production - it only
 * renders when the URL explicitly requests it. Shows no secrets: branch name
 * and short commit SHA are public Vercel build metadata (the same values
 * already visible in this repository's PR checks), and build time is a
 * plain timestamp.
 */
export function QaDebugBadge() {
  const [dismissed, setDismissed] = useState(false);
  const enabled = useMemo(() => {
    try {
      return typeof window !== 'undefined'
        && new URLSearchParams(window.location.search).get('qaDebug') === '1';
    } catch {
      return false;
    }
  }, []);

  if (!enabled || dismissed) return null;

  const branch = typeof __QA_BUILD_BRANCH__ !== 'undefined' ? __QA_BUILD_BRANCH__ : '';
  const sha = typeof __QA_BUILD_SHA__ !== 'undefined' ? __QA_BUILD_SHA__ : '';
  const buildTime = typeof __QA_BUILD_TIME__ !== 'undefined' ? __QA_BUILD_TIME__ : '';

  return (
    <div
      data-testid="qa-debug-badge"
      className="fixed left-2 top-2 z-10070 flex items-center gap-2 rounded-lg border border-white/20 bg-black/85 px-2.5 py-1.5 text-[10px] font-bold text-white shadow-lg"
    >
      <span data-testid="qa-debug-branch">branch: {branch || '未知'}</span>
      <span data-testid="qa-debug-sha">sha: {sha || '未知'}</span>
      <span data-testid="qa-debug-build-time">build: {buildTime || '未知'}</span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="關閉版本標記"
        className="rounded border border-white/30 px-1.5 font-black active:scale-95"
      >
        ✕
      </button>
    </div>
  );
}
