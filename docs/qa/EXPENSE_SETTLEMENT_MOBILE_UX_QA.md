# Expense Settlement and Mobile UX QA

## Problems and root causes

### Settlement completion

The existing expense engine produced current transfer suggestions and had a `settlements` repository branch, but legacy settlement entries directly offset balances and only stored `id/from/to/amount/scope/createdAt`. There was no pending/paid lifecycle, paid time, update time, currency-safe match, rollback UI, or general completed-history section.

### Home appearance

Both lobby triggers programmatically clicked an `input[type=color]` that was `sr-only` and removed from keyboard focus. Mobile Safari can ignore a programmatic native color-picker request for an invisible control, so clicking “自訂外觀” had no visible response. There was no dialog to receive focus or provide backdrop/Escape/close behavior.

### Mobile itinerary drag

The app already uses `@hello-pangea/dnd` and saves only after `onDragEnd`. Its touch sensor starts after a 120 ms hold and cancels when the finger moves before activation, but the drag clone was the complete place card. Moving that DOM, together with card blur/transitions and a short bottom drop area, caused unnecessary mobile compositing and unstable edge drops.

### Place title/menu layout

The title row used flex and `min-width: 0`, but the same narrow mobile row reserved space for both a 44 px menu and a navigation button beside the drag handle. Long Traditional Chinese and unbroken English names were compressed to a very small single-line title region. The action space was implicit rather than expressed as a `minmax(0, 1fr) auto` contract.

## Implementation

### Main files

- `src/features/expenses/settlementTransferRecords.js`
- `src/features/expenses/expenseCalculations.js`
- `src/features/expenses/ExpenseSection.jsx`
- `src/TripDetail.jsx`
- `src/components/AppearanceDialog.jsx`
- `src/components/AppSettingsMenu.jsx`
- `src/App.jsx`
- Relevant unit/component tests and focused Playwright specs

### Repository behavior

Regular trips call the injected Firebase repository and write `rooms/{tripId}/settlements` in the Firebase Emulator. Example trips call the injected Local Example Repository and persist the same records in its versioned IndexedDB snapshot.

Example settlement writes do not call Firebase, Storage, `myTrips`, or Offline Trip Cache.

### UI behavior

- Settlement UI has “待轉帳” and “已完成” sections.
- A paid record matches only the same payer, recipient, currency, and amount.
- Mark/cancel controls are at least 44 px high, disable while saving, show a saving label, use toasts, and roll back local state after repository failure.
- The appearance selector reuses the existing background-color state inside the project’s responsive bottom-sheet pattern.
- The drag handle remains the only DnD activator and explicitly preserves vertical touch panning.
- Drag rendering uses a lightweight name/time clone, reduces mobile blur/transition work, and leaves bottom space above mobile navigation.
- Place title/action layout uses `minmax(0, 1fr) auto`, a two-line clamp, and `overflow-wrap:anywhere`; navigation is moved below the title row.

## Test matrix

| Area | Automated coverage | Result |
| --- | --- | --- |
| Settlement record matching | exact amount, changed amount, changed currency, legacy history | PASS |
| Settlement component | pending, mark, completed, cancel, loading state, rollback | PASS |
| Repository integration | Firebase branch, local IndexedDB, rollback after failure | PASS |
| Appearance | direct/settings trigger, color change, backdrop, Escape, close, focus restore | PASS |
| Drag | existing same/cross-day plus 12-item first/last, cancel, scroll, reload | PASS |
| Place menu | 320/390 px, Chinese/unbroken English, bounding boxes, click isolation | PASS |
| Lint | `npm run lint` | PASS (12.2 s) |
| Typecheck | `npm run typecheck` | PASS (4.4 s) |
| Build | `npm run build` | PASS (6.5 s; existing chunk-size warning only) |
| Full Vitest | `npm run test:run` | PASS: 60 files, 730 tests (27.77 s) |
| Full Playwright: Desktop Chrome | Firebase Emulator only | PASS |
| Full Playwright: Mobile Safari | Firebase Emulator only | PASS |

Focused Playwright evidence:

- Appearance: 4 passed in 16.6 s.
- Settlement: 4 passed in 25.2 s.
- Itinerary drag: 6 passed in 32.4 s.
- Place menu layout: 4 passed in 17.8 s.

Full Playwright evidence:

- 224 discovered across Desktop Chrome and Mobile Safari.
- 210 passed, 14 existing conditional skips, 0 failed.
- Duration: 11.3 minutes (677.3 s command wall time).
- No `test.skip`, assertion relaxation, or timeout increase was added by this change.

## Known limits

- Settlement currency is TWD because the current expense engine normalizes expense balances to TWD.
- Partial payments and cross-currency settlement are intentionally out of scope.
- The existing DnD library’s built-in touch hold is 120 ms and is not configurable without replacing or copying its sensor. This change keeps the library and focuses on handle-only activation, scroll cancellation, lightweight rendering, and stable drop space.
- Physical-device Mobile Safari touch feel and final visual polish remain human QA items; automated Mobile Safari covers handle isolation, scrolling, cancellation, first/last moves, time recalculation, and persistence.

## Safety evidence

- Firebase Emulator project: `demo-travel-e2e`
- Production Firebase access: false
- Firebase Rules modified: false
- Dependencies changed: false
- Deploy: false
