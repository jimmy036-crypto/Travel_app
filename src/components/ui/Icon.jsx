import React from 'react';

const ICON_PATHS = {
  arrowLeft: <><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></>,
  calendar: <><path d="M8 2v4M16 2v4" /><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18" /></>,
  checkCircle: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4.5V3h6v1.5M9 10h6M9 14h6" /></>,
  download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2" /><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2" /></>,
  location: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z" /><path d="M9 3v15M15 6v15" /></>,
  palette: <><path d="M12 3a9 9 0 0 0 0 18h1.5a2 2 0 0 0 0-4H12a2 2 0 0 1 0-4h3a6 6 0 0 0 0-12Z" /><circle cx="7.5" cy="10" r=".7" fill="currentColor" stroke="none" /><circle cx="9" cy="6.5" r=".7" fill="currentColor" stroke="none" /><circle cx="14" cy="6" r=".7" fill="currentColor" stroke="none" /></>,
  plane: <><path d="M22 2 9.5 14.5" /><path d="m22 2-8 20-4.5-7.5L2 10Z" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  print: <><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v7H6Z" /></>,
  receipt: <><path d="M5 3v18l3-2 4 2 4-2 3 2V3l-3 2-4-2Z" /><path d="M9 10h6M9 14h6" /></>,
  reset: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></>,
  ticket: <><path d="M3 8a2 2 0 0 0 0 4v5h18v-5a2 2 0 0 0 0-4V3H3Z" /><path d="M13 7h4M13 11h4M13 15h4M9 3v14" /></>,
  trash: <><path d="M3 6h18M8 6V3h8v3M19 6l-1 15H6L5 6M10 10v7M14 10v7" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
};

export function Icon({ name, size = 20, strokeWidth = 1.8, className = '', title }) {
  const paths = ICON_PATHS[name];
  if (!paths) return null;

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {paths}
    </svg>
  );
}

export default Icon;
