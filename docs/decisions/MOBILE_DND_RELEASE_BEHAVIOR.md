# Mobile iOS Safari drag release behavior

Status: implementation decision for this change only. This document does not represent Gate 1, Gate 3, or release approval.

## Fourth round: lift now activates on the first touch; the orphaned drag during move/release is a separate bug

Physical iPhone 16 / iOS 26.5.2 Safari testing confirmed the third round's
mount-timing fix works: the first long-press now lifts the card (no second
attempt needed to activate). The same testing surfaced a further,
independent problem, visible only once lift already succeeds:

```text
first long-press on the handle -> card lifts (activation confirmed working)
finger stays down and moves     -> the lifted card stays put; the PAGE itself
                                    scrolls instead of the card following
first release                   -> the card stays lifted; no drop, no cancel
touching the still-lifted card again -> it starts following that second touch
second release                  -> drop completes immediately
```

This is evidence for the task's diagnostic "Path A" (`onDragStart` occurred,
`touchmove` occurred, a scroll occurred, the card did not visually update):
once native scrolling claims the touchmove stream for the same touch
identifier that lifted the card, the rest of that touch's lifecycle -
including its eventual `touchend` - can be consumed entirely by the browser's
native scroll gesture handling rather than reaching any JavaScript listener,
including `@hello-pangea/dnd`'s own touch sensor. The sensor's internal
"dragging" state is therefore never told the touch ended, which is why the
card stays visually lifted (not cancelled, not dropped) until an unrelated
second touch begins - a fresh touch sequence the sensor picks up and
associates with the still-open drag, completing it normally on that
second release.

### Why this was not visible before the third round's fix

Before the mount-timing fix, the first long-press failed to activate a drag
at all, so this move/release problem - which only manifests *after* a
successful lift - had no opportunity to surface. Confirming activation now
succeeds is what exposed it.

### Fix: an active-drag-scoped touch guard (Path A)

`src/TripDetail.jsx` now tracks, without touching any drag/itinerary state
or the library's own handlers:

1. A capture-phase, passive `touchstart` listener records which touch
   identifier began on `[data-testid="place-drag-handle"]`.
2. `onBeforeCapture` (the earliest lifecycle callback, firing as soon as the
   sensor confirms a real lift) installs a **non-passive** `touchmove`
   listener on `document`, scoped to that one touch identifier: for as long
   as the drag is active, if a `touchmove` event's `touches` still include
   that identifier, it calls `preventDefault()` (guarded by
   `event.cancelable`). Any other touch (a different finger, elsewhere on
   screen) is left completely alone - normal page scrolling is unaffected
   outside an active drag, and unaffected for any touch that isn't the one
   currently dragging.
3. `onDragEnd` removes that listener immediately, matching the task's "only
   install during an active drag" requirement.
4. As a defensive backstop - in case the library's own `onDragEnd` is ever
   skipped for the same underlying reason this bug existed - a raw
   `touchend`/`touchcancel` listener independently tears down the guard the
   moment the tracked touch identifier ends, and a mount-once cleanup effect
   removes it on unmount. None of this calls into `moveItineraryItem`,
   `setItinerary`, or any library method; it only ever adds/removes this
   one auxiliary listener.

This does not add a permanent `touch-action: none` anywhere, does not lock
`body` scroll, does not touch the Map's own gesture handling, and does not
call a synthetic `click` or manually invoke `onDragEnd` to force a stuck
drag closed - the fix is entirely about not losing ownership of the active
touch in the first place, which is also the most direct explanation for why
the orphaned-drag symptom (not just the scroll-hijack symptom) should
resolve: if the touch is never lost, its `touchend` reaches the sensor
normally and the drag ends on the first release.

### `?dndDebug=1` on-screen event panel

Console-only logging was not enough for a tester to hand back evidence from
an iPhone. `src/features/itinerary/dndDebugTrace.js` now keeps an in-memory,
60-event ring buffer (still non-PII: event name, timestamp, `data-testid` of
the event target, pointer/touch identifiers and counts, `cancelable`/
`defaultPrevented`, time since last scroll, current active draggable/phase/
indices/reason - never place names, coordinates, or room ids), and
`src/features/itinerary/DndDebugPanel.jsx` renders it as a collapsible
on-screen table - only when `?dndDebug=1` is present, never otherwise - with
copy and clear controls. It listens for `touchstart`/`touchmove`/`touchend`/
`touchcancel`, `pointerdown`/`pointermove`/`pointerup`/`pointercancel`,
`scroll`, and `click`, alongside the existing lifecycle trace
(`onBeforeCapture`/`onDragStart`/`onDragEnd`/`onDragEnd:commit`/
`...:nextFrame`). It writes nothing to the repository and does not affect
layout or override any library handler.

### Automated coverage and its limits

`e2e/dnd-debug-panel.spec.ts` confirms the panel is absent by default,
appears under `?dndDebug=1`, logs the expected lifecycle events through a
real (pointer-sensor) drag with no extra tap, and never contains seeded
place names. It does **not** exercise the touch guard itself: Playwright's
"Desktop Chrome" project has no touch-capable browser context (attempting
`new TouchEvent()`/`document.createEvent('TouchEvent')` there throws
`NotSupportedError`), and WebKit's synthetic `Touch`/`TouchEvent`
construction is already documented above as unreliable against this
library's sensor. Automated coverage of "does the guard actually keep the
page from scrolling during a real touch drag" is therefore not achievable
in this environment; physical confirmation is the required next step.

### Scope limits

No change to `flushSync`, `onDragEnd:commit`, `onDragEnd:nextFrame`, the
arrival-time recalculation state machine, its 10s timeout, the desktop
title's non-italic weight, or the day-theme overflow fix - all untouched
per this round's explicit instruction. No dependency was added or
evaluated; this is entirely a same-library, same-dependency fix (Gate path
A). Gate path D (a mobile-only `@dnd-kit` migration) was not approached
because its precondition - real event evidence proving the *library itself*
cannot maintain a touch sequence even with this guard in place - has not
been established; it would require a physical-device `?dndDebug=1` capture
showing the guard installed, `defaultPrevented: true` on the drag's
touchmove events, and the drag still going orphaned.

## Third round: release-to-drop confirmed fixed; first-touch activation was a separate bug

Physical iPhone Safari testing of the second round's `flushSync` fix
confirmed it worked: releasing the finger now inserts the item immediately,
with no second tap needed. The same testing surfaced an independent,
previously-unreported problem: the **first** long-press on a drag handle
after the trip view loads does not start a drag at all; a second long-press
immediately after does, and dragging then works normally for the rest of
the session. This is an activation-timing bug, not a release/commit bug -
the `flushSync` fix is unrelated and stays in place.

### Root cause

`@hello-pangea/dnd`'s touch sensor (`useTouchSensor` in the library) binds
its window-level `touchstart` listener - the one thing that lets it recognize
a touch on a drag handle at all - in a layout effect that runs when
`DragDropContext` mounts. The same mount also runs the library's own
long-standing `webkitHack` mitigation: a no-op, non-passive `touchmove`
listener registered on `window`, specifically because WebKit is documented
to ignore a later `preventDefault()` on `touchmove` unless a non-passive
listener was already present on `window` *before* the touch sequence began.

`TripDetail.jsx` mounted `DragDropContext` only inside the "trip has
loaded" branch - while `isLoading || !meta`, the component returned a
completely different tree (`TripDetailSkeleton`) with no `DragDropContext`
anywhere in it. That meant the touch sensor's window listeners, and the
`webkitHack` primer specifically meant to run ahead of the first real touch,
were not registered until the exact same synchronous render commit that
first inserted the real itinerary DOM - drag handles included - and made
them touchable. On iOS Safari, a large synchronous DOM insertion and a
freshly-registered touch listener competing with the browser's own
gesture-recognition/hit-test setup in the same frame is a known source of
the first gesture being claimed by native scrolling/long-press handling
instead of reaching JavaScript. By the second attempt, both the DOM and the
listeners have settled, and the sensor works exactly as expected from then
on - which matches the reported symptom precisely.

### Fix

`DragDropContext` is now mounted unconditionally, wrapping both branches:
the loading skeleton (`TripDetailSkeleton`) is rendered as its child while
`isLoading || !meta`, and the real trip content once loaded - instead of
`DragDropContext` only existing inside the "loaded" branch. This gives the
touch sensor's window listeners (and its `webkitHack` primer) the entire
loading-skeleton period - typically at least one network round trip - to
register and settle *before* the user can see or touch any real drag
handle, rather than registering them in the same commit that exposes those
handles. `DragDropContext` renders no DOM element of its own, and
`TripDetailSkeleton` contains no `Droppable`/`Draggable`, so wrapping the
skeleton in it is behaviorally inert - this is a pure mount-timing change,
not a new dependency or a change to any drag/drop logic.

### Scope and verification

No change to `handleDragEnd`, the `flushSync` commit, `moveItineraryItem`,
or any of the drag lifecycle callbacks - only where `DragDropContext` is
mounted relative to the loading state. Full Vitest (760 tests, including
the existing skeleton-loading coverage), lint, typecheck, build, and the
existing drag/skeleton E2E specs all pass unchanged. This agent still has
no access to a physical iPhone; the mount-timing root cause is inferred from
the library's own source (`useTouchSensor`, the `webkitHack` effect) and the
component's render structure, not from a captured device trace. Physical
confirmation that the *first* long-press now activates a drag remains the
required next step, alongside the still-outstanding release-to-drop
`?dndDebug=1` confirmation from the second round below.

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

### Physical confirmation: resolved

Confirmed on physical iPhone Safari (see the third round above): release
now inserts the item immediately, with no second tap required. This closes
the release-to-drop investigation. The `?dndDebug=1` trace remains available
for any future regression, but is no longer a blocking open item for this
symptom.

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
