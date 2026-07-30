# Arrival-time recalculation state machine

Status: implementation decision for this change only.

## Root cause

`timeRecalculationDays[dayId]` (a plain boolean, `src/TripDetail.jsx`) was
only ever cleared inside `handleRouteCalculated`, itself only called from
`Directions`'s `onRouteCalculated` prop (`src/components/UIComponents.jsx`).
`Directions`'s effect returns without calling `onRouteCalculated` in three
real, reachable cases:

1. `if (!routesLib || !map || !dayId) return undefined;` - if the Google Maps
   library or map instance is not ready (including `apiUnavailable`, where
   `MobileTripMapView` does not even mount a `<Map>`), the callback never
   fires at all.
2. Effect cleanup (`isCancelled = true`) runs without calling
   `onRouteCalculated` whenever `routeKey`, `dayId`, or `map` change before a
   fetch resolves - which happens on every day switch, since `Directions` is
   a single instance bound to whichever day is currently selected
   (`dayId={safeCurrentDay}` on desktop and in `MobileTripMapView`).
3. The same cleanup covers unmount and "a newer reorder replaced this
   request" (the effect re-runs, cancelling the in-flight one).

In every one of these, the old code left `timeRecalculationDays[dayId]: true`
forever - exactly the "⏱ 正在依新順序精算時間 不得永久存在" bug.

`Directions` is not actually conditioned on the Map **tab** being active in
either layout: on desktop the map panel is always mounted (`hidden` only
applies below the `md` breakpoint, where a different, mobile viewport is
used instead); in `MobileTripMapView`, mounting only depends on
`isMobileViewport`, not `activeTab`. The one real "Map unavailable"
dependency is `apiUnavailable` (Google Maps API failed to load), which case
1 above already covers structurally. Recalculation was never literally
"only runs when you're looking at the Map tab" - but nothing previously
guaranteed it would settle if the API never became available, if a request
was silently dropped, or if the day was switched away from mid-request.

## State machine

Per affected day:

```
idle -> pending { requestId, startedAt } -> success { requestId, completedAt }
                                          -> error   { requestId, completedAt, message }
```

Implemented as two pieces of state in `src/TripDetail.jsx`:

- `pendingTimeRecalculationRef` (ref): which days have a reorder whose
  arrival times haven't been recalculated yet, and the anchor time to
  recalculate from. Set by `handleDragEnd`, cleared on settle.
- `dirtyRecalcDays` (state): mirrors the same "needs recalculation" fact
  reactively, driving the "已重排，切換此日後精算" / "正在依新順序精算時間"
  badges for every affected day, not just the active one.
- `recalculationState` (state): `{ [dayId]: { status, requestId, startedAt |
  completedAt, message } }` - tracks the *actively in-flight* request, which
  can only ever be the currently-viewed day, because only one `Directions`
  instance is ever mounted (bound to `safeCurrentDay`).

`beginRecalculation(dayId)` mints a fresh `requestId`
(`recalcRequestIdRef.current += 1`), stores it on both the pending ref entry
and `recalculationState`, and schedules a `RECALCULATION_TIMEOUT_MS` (10s,
within the required 8-12s window) timeout. `settleRecalculation(dayId,
requestId, status, message)` only applies if the stored `requestId` still
matches - a guard against a stale settle clobbering a newer request.
`abandonRecalculation(dayId)` quietly drops a `pending` entry back to
untracked (no error, no toast) - used for day switch and unmount, since the
day stays in `dirtyRecalcDays` and will recalculate again next time it's
viewed.

### Where each required case settles

| Case | How it settles |
| --- | --- |
| Success | `handleRouteCalculated` calls `settleRecalculation(day, pending.requestId, 'success')` after recalculating arrival times and clears `dirtyRecalcDays[day]`. |
| Missing coordinates | `Directions` still returns a full `durations` array (per-leg `mode: 'ERROR'`, `座標無效`) and calls `onRouteCalculated` - same success path. |
| Map unavailable / dropped request | Never reaches `handleRouteCalculated`; the 10s timeout fires `settleRecalculation(..., 'error', ...)`, clears `dirtyRecalcDays[day]` (times are kept as-is, not fabricated), and shows a one-time `toast.error` with the exact required message. |
| day < 2 | `daysNeedingRecalculation` (`handleDragEnd`) filters to days with more than one item; a day left with ≤1 item is never marked pending or dirty - there is no leg to compute. |
| Day switch | A `useEffect` keyed on `[safeCurrentDay]` calls `beginRecalculation(safeCurrentDay)` on entry and `abandonRecalculation(safeCurrentDay)` in its cleanup (the previous day) - settling the day you're leaving without an error toast, and resuming a dirty day's request the moment you return to it. This is what makes recalculation resume from Plan-side day selection alone, independent of the Map tab. |
| Unmount | The same cleanup above fires on unmount; a separate mount-once effect also force-clears any outstanding `recalcTimeoutsRef` entries so a timeout can never fire (and touch state) after the view is gone. |
| Request replaced | A second reorder on the still-current day calls `beginRecalculation` again, minting a new `requestId` that supersedes the old one in both the ref and `recalculationState`. `Directions`'s own `isCancelled` effect-cleanup (unchanged, pre-existing) means a superseded fetch structurally never calls `onRouteCalculated`, so this is enforced at both layers. |
| Timeout | 10s, see "Map unavailable" row - the same mechanism handles both. |

No arrival time is ever fabricated: the error/timeout path only stops
showing the pending badge and leaves whatever times were already present.

## UI

- `mobile-day-theme-label`'s recalculating line only shows for
  `safeCurrentDay` and only while `recalculationState[safeCurrentDay]?.status
  === 'pending'`.
- The desktop per-day badge shows for any `dirtyRecalcDays[dayId]`,
  regardless of whether it's the current day, with the existing two-message
  split (`dayId === safeCurrentDay` vs. deferred).

## Tests

`src/TripDetail.recalculation.test.jsx` covers: pending only while in
flight then settling on success; a 10s-timeout error settling with exactly
one `toast.error` call; a quiet (no-toast) settle on day switch away from a
pending day; and a day left with one item never being marked as needing
recalculation. It mocks `@hello-pangea/dnd`'s `DragDropContext` to capture
`onDragEnd` and `Directions` to capture `onRouteCalculated` per day, so the
state machine is exercised directly rather than through simulated pointer
gestures (already covered separately by the DnD E2E specs).

## Scope limits

No change to `moveItineraryItem`, `recalculateArrivalTimes`, or the
`Directions` route-fetching logic itself (single-request vs. per-leg
fallback, coordinate validation, mode handling) - only to how their result
(or absence of one) is tracked and settled.
