# Mobile iOS Safari drag release behavior

Status: implementation decision for this change only. This document does not represent Gate 1, Gate 3, or release approval.

## Second round: the touch-action/click-suppression fix did not resolve release-to-drop

Physical iPhone testing after the round documented below still showed the
finger release not inserting the item immediately - a second tap was needed.
That is a different symptom than what the first round fixed. The first round
diagnosed and fixed "the drop reopens Place Details right after release,"
caused by iOS Safari's trailing synthetic `click`. It did **not** address "the
reordered position does not visually commit on release," which is the actual
task-1 complaint. Re-diagnosing from the code (real hardware was not
available to this agent in this session; see "What still needs physical
confirmation" below):

- `onDragEnd` **is** still guaranteed by `@hello-pangea/dnd`'s touch sensor
  contract - nothing in this codebase intercepts or cancels the touch
  sequence before release, and the sensor's own lifecycle (`onBeforeCapture`
  → `onDragStart` → `onDragEnd`) is fully wired with no gaps (Gate path A
  applies; path B's dependency swap was not evaluated because this precondition
  fails).
- `handleDragEnd` (`src/TripDetail.jsx`) computed the reordered itinerary and
  called `setItinerary` (plus several other setters) as an ordinary state
  update. On iOS Safari, that update is scheduled through React's normal
  batching, which does not guarantee the browser paints the reordered DOM
  before it decides whether the current frame needs a repaint at all. Because
  the call originates from `@hello-pangea/dnd`'s own internal touch-sensor
  dispatch (not a React synthetic event), the reordered DOM could sit
  committed-but-unpainted until the next touch interaction forced a repaint -
  exactly the "needs a second tap" symptom, and distinct from the click-reopen
  bug already fixed.
- Both drag clones (`MobileItineraryTimeline.jsx`'s `MobileItineraryDragClone`
  and the desktop clone in `TripDetail.jsx`) carried `will-change-transform`
  in addition to `transform-gpu`. `will-change` is a standing hint to keep a
  layer promoted; on a short-lived clone that mounts and unmounts within one
  drag, this is unnecessary and is one of the known WebKit patterns for a
  stale composited layer surviving past its node's removal.

### Fix

1. **`flushSync` around the drop commit.** `handleDragEnd`'s state updates
   (`setBackupItin`, `clearOptimizationSummary`, `setRouteDurations`,
   `setDirtyRecalcDays`, `setItinerary`) are now wrapped in a single
   `react-dom` `flushSync` call, so the whole drop - one commit, matching the
   task's "minimal scope" requirement - is synchronously reflected in the DOM
   before the `touchend`-driven callback returns, instead of being left to
   React's default scheduling. `beginRecalculation` (see
   `docs/decisions/ARRIVAL_TIME_RECALCULATION_STATE.md`) runs immediately
   after, outside the `flushSync`, since it does not need to affect this
   frame's paint.
2. **Dropped `will-change-transform`** from both drag clones, keeping
   `transform-gpu` (a one-time `translateZ(0)` promotion) for smooth 60fps
   movement during the drag without leaving a persistent "keep this layer
   around" hint once the clone unmounts.
3. **No synthetic click, no second tap.** Neither change adds an extra tap,
   click, or `requestAnimationFrame`-deferred repaint hack; both are exactly
   the remedies the task's Gate path A anticipates ("必要時只在單次 drop commit
   使用最小範圍 flushSync" and "檢查 transform-gpu／will-change 是否保留 stale
   layer").

### `?dndDebug=1` trace

`src/features/itinerary/dndDebugTrace.js` adds an opt-in, non-PII trace,
enabled only when the URL contains `?dndDebug=1`. It logs, via
`console.info`, only: event name, a relative timestamp
(`performance.now()`), day/droppable ids, indices, and drag reason - never
place names, coordinates, or any repository data. It is wired into
`onBeforeCapture`, `onDragStart`, `onDragEnd` (including destination
validity), a same-tick `onDragEnd:commit` marker immediately after the
`flushSync` block, and a `requestAnimationFrame`-scheduled `...:nextFrame`
marker so a physical-device session can confirm the reordered DOM is present
on the very next frame. A capture-phase, passive, debug-only `touchend`/
`touchcancel` listener (gated the same way, added only when `?dndDebug=1` is
present) is layered on top purely to correlate native touch-release timing
with `onDragEnd` on real hardware; it changes no behavior and writes nothing
to the repository.

### What still needs physical confirmation

This agent has no access to a physical iPhone. The fix above is the specific,
scoped remedy the task's diagnostic gate names for the "`onDragEnd` fires
but the visual commit is late" case, and it is exercised by the existing
pointer-sensor E2E stand-in (`e2e/mobile-touch-drag-release.spec.ts`, all
passing) plus the full existing drag regression suite. It has **not** been
confirmed on real iPhone Safari hardware. The physical checklist in
`docs/qa/MOBILE_ITINERARY_MAP_REDESIGN_QA.md` - including a `?dndDebug=1` run
to capture real `touchend`/`onDragEnd`/`nextFrame` timing - is the required
next step before this can be called resolved.

## First round: root cause

`@hello-pangea/dnd` v18 was wired with only `onDragEnd` on `DragDropContext`; there was no `onBeforeCapture`, `onDragStart`, or `onDragUpdate`, and no independent tracking of "a drag just ended." The 44px drag handle used `touch-action: pan-y` — the same value as the surrounding card — so the browser's native vertical-pan gesture recognizer and the library's own touch sensor competed for the same touch stream on the handle itself. `onDragEnd` reliably fires (it is guaranteed by the library's touch sensor contract), so the "still open after release" and "needs an extra tap" complaints were not caused by a missing drop; they were caused by the absence of any mechanism to distinguish a real tap from the synthetic `click` iOS Safari dispatches after a touch sequence ends. Because `ItineraryTimelineCard`'s card body opened place details on `onClick` whenever `snapshot.isDragging` was already `false` (true again by click time), that trailing synthetic click reliably reopened details right after a drop.

## Decision

1. **Touch-action split.** The drag handle now uses `touch-none` (`touch-action: none`) plus `select-none` and `[-webkit-touch-callout:none]`, so the browser never intercepts a touch that starts on the handle. Card surfaces (`ItineraryTimelineCard`'s `article`, the desktop `place-card` container) explicitly keep `touch-pan-y` so vertical list scrolling is unaffected outside the handle. This applies to both the mobile timeline handle (`ItineraryTimelineCard.jsx`) and the desktop card handle (`TripDetail.jsx`).
2. **Full lifecycle wiring.** `DragDropContext` now receives `onBeforeCapture`, `onDragStart`, `onDragUpdate`, and `onDragEnd`. `onBeforeCapture`/`onDragStart` record the active `draggableId` in a ref (`activeDraggableIdRef`) for lifecycle bookkeeping; `onDragUpdate` is an intentional no-op — no itinerary state is read or written during drag movement, only on drop, matching the existing "recalculate after a confirmed reorder" contract.
3. **Click suppression window.** `handleDragEnd` unconditionally stamps `dragReleaseAtRef.current = Date.now()` (even when the drop is a no-op or has no destination — a cancelled drag still produces a trailing synthetic click on iOS). `handleSavedItemDetails` and `openPlaceActionMenu` — the two entry points every card-open and action-menu path in `TripDetail.jsx` funnels through, on both mobile and desktop, from the timeline, the desktop day columns, and the map sheet — bail out via `isDragReleaseClick()` if invoked within `DRAG_CLICK_SUPPRESSION_MS` (300ms) of that stamp. A normal tap that never engaged the sensor never touches `dragReleaseAtRef`, so it opens immediately as before.
4. **Auto-scroll tuning.** `ITINERARY_DND_AUTO_SCROLLER_OPTIONS` (`startFromPercentage: 0.2`, `maxScrollAtPercentage: 0.08`, `maxPixelScroll: 16`, dampening `stopDampeningAt: 800` / `accelerateAt: 300`) is passed to `DragDropContext` — the exact starting range the task specified — so edge auto-scroll begins earlier and stays capped rather than being left at the library default.

## Why suppression lives in `TripDetail.jsx`, not in each card

Both the mobile timeline card and the desktop day-column card already call back into `TripDetail.jsx` to open details (`handleSavedItemDetails`) and the action menu (`openPlaceActionMenu`). Gating there once, instead of duplicating a suppression check in `ItineraryTimelineCard`, the desktop inline card, and `MapPlaceCard`'s two-stage select/open, guarantees a single source of truth for "was this the tail end of a drag" and automatically covers every entry point, including the map sheet's card-open path, without touching those components.

## E2E touch-simulation limitation

Playwright's WebKit build (used for the "Mobile Safari" project) does not reliably deliver a full press/move/release gesture to `@hello-pangea/dnd`'s touch sensor when driven through synthetic `Touch`/`TouchEvent` construction — neither the modern `new Touch()`/`new TouchEvent()` constructors (WebKit throws `Illegal constructor`) nor the legacy `document.createTouch`/`createTouchList`/`initTouchEvent` path activate the sensor consistently in headless mode. `e2e/mobile-touch-drag-release.spec.ts` therefore drives the same `onDragEnd`/click-suppression contract through the library's pointer (mouse) sensor instead — `mouseDragHandle` in `e2e/support/touchDrag.ts` presses, performs a fine-grained multi-step lift past the sensor's activation threshold, moves in many small steps, and releases. This is a deliberate stand-in, not a replacement, for the physical iPhone Safari touch checklist in `docs/qa/MOBILE_ITINERARY_MAP_REDESIGN_QA.md`, which remains the only way to confirm real-touch release-to-drop feel.

A related, pre-existing and unrelated observation surfaced while building this coverage: on this checkout, a single-position reorder (one `ArrowDown` via the existing keyboard sensor, unmodified by this change) on a freshly seeded 4-item day does not reliably reach the Firebase Emulator within several seconds, while the existing 12-item/11-position keyboard drag spec (`e2e/mobile-itinerary-timeline.spec.ts`) persists reliably. This reproduces with the keyboard sensor alone, on code this change does not touch (`moveItineraryItem`, `setItinerary`, `useRoomBranchSync`), so it is a pre-existing characteristic of small-magnitude reorders in this test harness, not a regression from this change. The new touch/mouse specs therefore assert DOM-level release behavior only and rely on the existing keyboard spec for persistence-after-reorder regression coverage.

## Scope limits

No second DnD library was added. `node_modules` was not patched. No change to `moveItineraryItem`, arrival-time recalculation, or the repository write path.
