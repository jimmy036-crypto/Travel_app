export function FeatureIntroductionButton({
  onOpen,
  className = '',
  compact = false,
}) {
  return (
    <button
      type="button"
      data-testid="feature-introduction-button"
      aria-label="開啟功能介紹"
      onClick={onOpen}
      className={`min-h-11 rounded-2xl bg-violet-600 px-4 py-2 font-black text-white shadow-lg shadow-violet-500/20 transition hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 ${className}`}
    >
      {compact ? '功能介紹' : '✨ 功能介紹'}
    </button>
  );
}
