# Desktop itinerary planner information hierarchy

Status: implementation decision for this change only.

## What changed and why

Real-device review of PR #41 flagged three separate desktop planner
problems: the trip title used an italic weight that read as decorative
rather than a clear heading level; long day themes could push the "智慧排路線"
control outside the visible day-column width; and the desktop place card
exposed a direct navigation button plus a full edit/nearby/copy/delete row,
duplicating actions that Place Details already owns and competing for space
with the high-frequency actions (drag, time, name, 景點資訊).

## Title weight

`trip-detail-title` (`src/TripDetail.jsx`) no longer carries `italic`. It
keeps its existing `text-xl font-black` weight, which is already the
clearest bold level in the header; no new class was needed once the italic
was removed. The mobile header (`MobileTripHeader.jsx`) never had `italic`
and is unchanged.

## Day column header layout

The day column header previously combined the day title and theme in one
`truncate` (single-line) `<h2>` inside a `flex` row that also held the
undo/optimize buttons, with no `min-w-0` on the text side. A flex item's
default `min-width: auto` means it does not shrink below its content size,
so a long theme could overflow its own box width and push the
sibling button column out of, or past, the card - `truncate`'s
`overflow: hidden` never took effect because the flex item itself was never
constrained.

The header is now three rows:

1. `第一天` (day ordinal, small/uppercase) and the date, unconstrained.
2. A `grid-template-columns: minmax(0,1fr) auto` row: the theme name
   (`min-w-0`, `line-clamp-2`, `[overflow-wrap:anywhere]`) in the first
   column, and the undo/optimize buttons (`shrink-0`) in the second. `auto`
   sizes the button column to its content and never shrinks below it;
   `minmax(0,1fr)` is what actually lets the theme column shrink and wrap
   instead of pushing the grid's second track outside the card.
3. The existing date/weather/optimization-summary/recalculation-badge row,
   unchanged except for reading the new recalculation state (see
   `ARRIVAL_TIME_RECALCULATION_STATE.md`).

The undo/optimize buttons keep a fixed icon at all widths and show their
text label only at `min-[420px]:inline`, so a narrow column degrades to
icon-only (with `aria-label`/`title` retained for accessibility) instead of
overflowing; their width does not change between the idle and "分析中…"
label, so the row does not reflow while optimizing.

## Desktop place card: 景點資訊 only

The desktop card (`src/TripDetail.jsx`, `md:` breakpoint) removed:

- The always-visible `md:flex` direct navigation button.
- The `desktop-place-actions` hover row (編輯／周圍／複製／刪除), previously
  revealed on card hover via `md:group-hover:max-h-14`.

Both existed as duplicates of actions already available one click away.
Removing them keeps the card to its left column (drag handle, order, arrival
time), a middle column (name, stay time, and only-when-present metadata:
notes/menu/photo/links, unchanged from the prior compact-card round), and
the existing `place-info-trigger` summary as the only right-side affordance
- which itself only renders when there is real photo/menu/note/resource data
to summarize (`detailParts.length > 0`), so no empty placeholder is ever
shown. The whole card (outside the drag handle) still opens Place Details on
click, unchanged.

Navigate, edit, search-nearby, copy, and delete all now live in
`PlaceItemDetailModal` (`src/TripDetail.jsx`), which gained a
`place-detail-quick-actions` row (`place-detail-navigate-button`,
`place-detail-nearby-button`, `place-detail-copy-button`,
`place-detail-delete-button`) alongside the pre-existing
`place-detail-edit-button` footer action. Delete keeps the existing
confirmation dialog (`usePlaceActions.js`'s `deleteItineraryItem`, unchanged)
- clicking delete in Place Details closes the sheet immediately (matching
the existing mobile ⋯ action-menu pattern of dismissing the transient UI
before the async confirm/delete flow runs) rather than waiting on the
confirmation's result.

The mobile-compact action row (`data-layout="mobile-compact"`,
`md:hidden`, navigation button + `⋯` trigger opening the existing
`place-action-menu`) is untouched - it only ever renders below the 768px
breakpoint, which is exactly where `MobileItineraryTimeline`'s dedicated
timeline card is used instead, so it does not compete with this desktop
change.

### Tests updated for this contract change

`e2e/place-menu-layout.spec.ts` (desktop breakpoint test),
`e2e/place-crud.spec.ts` (`desktop-place-actions` assertions and the shared
`openDeleteConfirmationForPlace` helper's desktop path),
`e2e/core-empty-states.spec.ts` and `e2e/realtime-sync.spec.ts` (same shared
delete-via-card-hover pattern), and
`src/TripDetail.repositoryIntegration.test.jsx` were updated to open Place
Details and exercise the new `place-detail-*` action testids instead of the
removed card-level ones. These are intentional assertion changes reflecting
the task's required behavior change, not relaxed coverage - the same
navigate/edit/nearby/copy/delete actions are still asserted to exist and
work, just through Place Details.

## Scope limits

No change to Place Details' existing photo/menu/notes/resources/Google
sections, to the transit row (already directly editable, already
28-36px), or to `usePlaceActions.js`'s copy/delete/edit logic.
