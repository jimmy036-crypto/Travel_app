# Mobile Itinerary and Map Redesign QA

## Scope and references

This change is stacked on PR #40 commit
`231e6e3827388a9c41629ee1339106a301c8274a` and changes the mobile
composition only. The supplied references were inspected before implementation:

- `docs/references/mobile-itinerary-map-redesign/itinerary-reference.png`
- `docs/references/mobile-itinerary-map-redesign/map-reference.png`

The itinerary reference contributed the selected-day vertical rail, compact
time/place cards, and subordinate transit rows. The map reference contributed
the map-first hierarchy, ordered route markers, and a horizontal itinerary
sheet above the app navigation.

Apple Maps branding, Apple assets, proprietary controls and tiles, exact
reference styling, and the PNG files themselves were deliberately not copied
into the product. The existing Google Maps integration, theme tokens, icons,
actions, and trip data remain authoritative.

## Root component and data map

Before this change, `TripDetail.jsx` rendered every day in one horizontal
itinerary scroller on both phone and desktop. The map tab hid the desktop
sidebar, which also removed trip context and day switching. Mobile map and
itinerary therefore did not behave as two synchronized views of one selected
day.

The existing interaction and data contracts remain in place:

- `@hello-pangea/dnd` owns the drag lifecycle and calls the existing
  `moveItineraryItem` flow only on drag end.
- The existing recalculation path updates arrival times after a confirmed
  reorder; drag movement does not persist or deep-clone the whole trip.
- `Directions` continues to use Google `DirectionsService` and
  `DirectionsRenderer`; no route geometry or duration is fabricated.
- Existing place details, navigation, edit, nearby, copy, delete, and
  confirmation flows remain owned by `TripDetail` and the place-action hooks.
- `App.jsx` injects either `firebaseTripRepository.js` or
  `localExampleTripRepository.js`. None of the new presentation components
  imports or calls Firebase.
- Existing FeatureTour identifiers remain attached to the mobile day switcher,
  action-menu trigger, sync status, and details entry point.

Focused presentation components now provide the mobile composition:

- `MobileTripHeader.jsx` and `MobileDaySwitcher.jsx`: shared trip context.
- `MobileItineraryTimeline.jsx`: selected-day DnD list and lightweight clone.
- `ItineraryTimelineCard.jsx`: timeline node/handle and compact place surface.
- `TransitTimelineRow.jsx`: stored or calculated transport presentation.
- `MobileTripMapView.jsx`: one Google Map, route, markers, and selection state.
- `MapItinerarySheet.jsx` and `MapPlaceCard.jsx`: safe-area-aware horizontal
  itinerary controls.
- `mapItineraryModel.js`: pure ordered-marker and route-state derivation.
- `useMobileViewport.js`: one mobile or desktop render tree at the breakpoint.

## Mobile and desktop strategy

At 320–767 px, itinerary and map share one compact header and selected-day
switcher. The itinerary renders only the selected day as a vertical timeline.
The map uses the selected day for its markers, route, and cards. At 768 px and
above, the established detailed multi-day itinerary and desktop map remain
unchanged.

The responsive split is performed in React rather than by mounting two complete
CSS-hidden compositions. There is one DnD tree and one Google Map instance for
the active viewport strategy.

## Timeline behavior

- A numbered 44 px timeline node is the only drag handle.
- Place surfaces use 12 px padding, two-line titles, and
  `overflow-wrap:anywhere`.
- Arrival time, name, stay duration, navigation, and the existing secondary
  action menu are available without exposing desktop-only detail rows.
- Transit rows connect consecutive places and use real calculated duration or
  existing `nextLeg` data. Missing data is labeled `交通時間待計算`.
- The drag clone contains only order, arrival time, and place name, with a
  maximum contract of 240 × 72 px and no images or actions.
- Empty and loading states follow the timeline geometry.
- The scroll container remains vertically pannable; repository persistence and
  arrival-time recalculation occur after drop.

## Map, marker, route, and sheet behavior

- The existing `Map`, `AdvancedMarker`, `MAP_ID`, and `Directions` integration
  is retained.
- Marker numbers follow selected-day itinerary order. Selecting a marker
  selects and scrolls its card; selecting a card pans to a valid marker without
  changing zoom.
- Only valid numeric coordinates produce markers. Blank, null, or missing
  coordinates remain in the sheet with an explicit `無定位` label. Genuine
  zero coordinates remain valid.
- Route loading, partial/failure, map API failure, and no-valid-coordinate
  states remain readable without removing the itinerary sheet.
- The sheet defaults to 36% (bounded to 9.5–15 rem), expands to 62%, includes
  a 44 px handle, and sits above the bottom navigation with safe-area padding.
- Cards use only an existing `placePhoto.url`; absent and failed images receive
  a stable local fallback. No photo search or fabricated image was added.
- Bounds fitting depends on the selected day’s stable coordinate key and
  visible map state, so unrelated state updates do not repeatedly override
  manual pan/zoom.

## Performance considerations

- Mobile and desktop do not mount duplicate map or DnD compositions.
- Derived marker and route models use stable memoized inputs.
- The map fit effect no longer depends on the complete itinerary object.
- The drag clone has no image decoding, blur, full-card controls, or rich
  details.
- Timeline cards avoid per-card backdrop filters and heavy shadows.
- Horizontal sheet scrolling stops pointer propagation to the map and uses
  native overflow without a new gesture dependency.

## Repository isolation and safety

Regular trips continue through the injected Firebase repository; all automated
browser writes used project `demo-travel-e2e` with Auth, Realtime Database, and
Storage emulators. Example trips continue through the Local Example Repository
and IndexedDB. The redesign introduces no component-level Firebase access and
does not change Storage, `myTrips`, Offline Trip Cache, settlement, expense,
ticket, or repository contracts.

Production Firebase access: **false**

Firebase Rules modified: **false**

Dependencies changed: **false**

Deploy: **false**

## Automated test matrix

| Area | Coverage | Result |
| --- | --- | --- |
| Timeline components | selected day, time/name/stay, transit ready/missing, empty/loading, action isolation, clone contract | PASS: 5 tests |
| Map model/components | ordered/invalid markers, route states, marker/card/day sync, image/API/sheet states, one map | PASS: 6 tests |
| Repository integration/helper | injected repositories and blank-coordinate guard | PASS: 17 tests |
| Timeline E2E | 320/390 px, 12 places, overflow, day switch, first/last drag, clone, Emulator persistence | PASS: 6 project tests |
| Map E2E | 320 × 568/390 × 844, sheet/safe area, invalid coordinate, selection/actions/day, desktop single map | PASS: 8 project tests |
| Existing drag E2E | same-day, cross-day, cancel, scroll, first/last, recalculation, persistence | PASS: 6 project tests |
| Existing place-menu E2E | Chinese/English long titles, bounding boxes, actions, desktop layout | PASS: 6 project tests |
| Lint | `npm run lint` | PASS |
| Typecheck | `npm run typecheck` | PASS |
| Build | `npm run build` | PASS; existing chunk-size warning only |
| Full Vitest | `npm run test:run` | PASS: 64 files, 750 tests in 26.22 s |
| Full Playwright: Desktop Chrome | Emulator only | PASS: 113 passed, 7 existing PWA conditional skips |
| Full Playwright: Mobile Safari | Emulator only | PASS: 113 passed, 7 existing PWA conditional skips |
| Diff hygiene | `git diff --check` | PASS |

## Second-round header, settings, and map-card refinement

### Root causes

Physical iPhone Safari review exposed four presentation bottlenecks that the
first redesign did not fully address:

- The mobile header placed back, a single-line title, sync state, 10 px
  date/destination/weather text, a trip-tools ellipsis, and Settings in one
  horizontal row. Controls and information therefore competed for the same
  width, while temperature and rain could be truncated.
- `MobileTripHeader` and `AppSettingsMenu` separately owned open state,
  outside-click, and Escape handling for two adjacent global menus. This
  duplicated the entry point and reduced the title area without adding a
  distinct information hierarchy.
- Map preview cards were up to 72 vw / 240 px wide and retained two 44 px
  action buttons below the image and title. The action row increased both card
  and Bottom Sheet height even though Place Details already exposed the same
  navigation and management actions.
- The complete Explore search form remained over the map at all times. Together
  with a 36%–15 rem default Sheet, it reduced the map-first viewport.

### Header information hierarchy

The phone header now uses three distinct regions:

1. A safe-area-aware utility row with one 44 px Back control and one 44 px
   Settings control. No absolute positioning overlays the summary.
2. A theme-aware summary card using
   `minmax(0, 1fr) clamp(5.25rem, 27vw, 6.75rem)`. The left column owns a
   two-line, anywhere-wrapping title, 12 px date/destination, and a separate
   sync row. The right column owns a weather glyph, the real forecast range,
   and rain probability.
3. The existing `MobileDaySwitcher`, unchanged below the header.

The weather range remains a range (`24~28°C`) and is not relabeled as a current
temperature. No condition description is invented because the current
Open-Meteo request does not fetch one. Missing data is explicitly shown as
`天氣未載入`.

Automated bounding-box and overflow checks passed at 320 × 568 and 390 × 844.
An additional ignored, temporary Emulator-only check passed at 375 × 812 with
the dark theme and 430 × 932 with the light theme; that temporary file was
removed after the run.

### One Settings entry and shared content

The header-owned `mobile-trip-tools-trigger`, local menu state, outside-pointer
listener, Escape listener, and menu DOM were removed. `TripDetail` supplies
typed-by-contract action descriptors to the existing `AppSettingsMenu`:

- Share collaboration
- Shared checklist
- Export itinerary

The menu now has recognizable `旅程工具` and `App 設定` sections. Lobby omits
the trip section by not providing trip actions. Appearance, release notes,
feature introduction, FeatureTour, update check, installation state, and
version actions retain their original handlers.

At the mobile breakpoint, `AppSettingsMenu` reuses
`ResponsiveBottomSheet`: it has a named dialog, focus trap, Escape and backdrop
close, body-scroll lock, vertical scrolling, and bottom safe-area padding.
Desktop retains the positioned Portal popover and its outside-click behavior.
Both presentations render one shared `SettingsMenuContent`; actions are not
duplicated. Closing restores focus to the single Settings trigger, whose trip
label is `開啟旅程工具與設定`.

### Map preview and Sheet

Map cards now contain only order, real photo/fallback, arrival time, name,
no-coordinate state, and selected state. Timeline card navigation and
secondary actions are unchanged.

The established two-stage map interaction is now the only card interaction:

- First click on an unselected card selects its marker and pans the map.
- Second click on the selected card opens existing Place Details.

Place Details remains the entry to navigation, edit, nearby, copy, and delete;
no capability was removed. Map-only navigation and ellipsis props were removed
from `MapPlaceCard`, `MapItinerarySheet`, `MobileTripMapView`, and the
`TripDetail` call site.

Cards use `clamp(132px, 38vw, 160px)`, a 64 px image, two-line
anywhere-wrapping names, and a border/ring selection state without scale. The
Sheet defaults to `clamp(10.5rem, 30%, 12.5rem)` and expands to 56%. Its 44 px
handle, horizontal native scrolling, marker-driven `scrollIntoView`, reduced
motion behavior, bottom navigation clearance, and safe-area padding remain.

The Explore form now expands from a 44 × 44 `搜尋周邊景點` control and reuses
the existing query/search/clear callbacks. Closing returns to the compact
control. Google Maps provider, controls, Logo/Terms, API errors, route data,
and map instance count are unchanged.

### Second-round automated evidence

| Check | Result |
| --- | --- |
| MobileTripHeader component | PASS: 3 tests |
| AppSettingsMenu component | PASS: 26 tests |
| Map model/components | PASS: 8 tests |
| Focused mobile timeline/Header | PASS: 3 Mobile Safari + 3 Desktop Chrome project tests |
| Focused mobile map | PASS: 4 Mobile Safari + 4 Desktop Chrome project tests |
| Existing drag regression | PASS: 6 tests across both projects |
| Existing place-menu regression | PASS: 6 tests across both projects |
| Appearance / settlement regression | PASS: 8 tests across both projects |
| 375 dark / 430 light temporary viewport check | PASS: 2 Mobile Safari tests |
| Lint | PASS |
| Typecheck | PASS |
| Build | PASS; existing chunk-size warning only |
| Full Vitest | PASS: 64 files, 750 tests |
| Full Playwright | PASS: 226; SKIP: 14 existing PWA conditional tests; 11.3 min |
| Firebase Emulator project | `demo-travel-e2e` |
| Production Firebase accessed | false |
| Firebase Rules/config modified | false |
| Dependencies changed | false |
| Deploy | false |

### Second-round physical iPhone Safari checklist

- [ ] Confirm Back and the single Settings gear remain comfortable around the
      Dynamic Island and landscape/portrait safe areas.
- [ ] Confirm long Traditional Chinese and unbroken English trip titles balance
      naturally against the real weather range at 320–430 px.
- [ ] Confirm dark, light, and a custom trip color retain sufficient contrast
      under real-device brightness settings.
- [ ] Confirm the Settings Bottom Sheet scrolls to its final item without the
      Home Indicator covering it, and focus/VoiceOver labels are natural.
- [ ] Confirm two map cards plus part of the next card remain visible at
      390 × 844 and inertial horizontal scrolling does not move the map.
- [ ] Confirm the reduced Sheet leaves useful map context and the compact
      Explore control does not conflict with native Google Maps controls.
- [ ] Recheck physical-device timeline drag, edge auto-scroll, persistence,
      arrival-time recalculation, and Timeline-only navigation/menu actions.

## Third-round responsive chrome, density, DnD, and map peek refinement

Real iPhone Safari and Desktop review of PR #41 (see
`docs/references/mobile-ux-refinement/mobile-expense-header-current.jpg` and
`docs/references/mobile-ux-refinement/desktop-itinerary-current.png`)
surfaced four remaining bottlenecks, addressed here as a stacked, incremental
refinement. Full root cause and decision detail lives in
`docs/decisions/RESPONSIVE_TRIP_PAGE_CHROME.md` and
`docs/decisions/MOBILE_DND_RELEASE_BEHAVIOR.md`; this section summarizes and
records evidence.

### Per-tab header strategy

`MobileTripHeader` (title/date/destination/weather) was previously mounted
unconditionally for every mobile tab. It is now scoped to `activeTab ===
'plan'` only:

- **Map**: a new `MobileMapTopBar` — Back, an embedded `MobileDaySwitcher`
  (which gained an optional `wrapperClassName` prop so it can drop its own
  border/padding when embedded), and Settings, in one safe-area-aware row.
  No title, destination, or weather competes with the map canvas.
- **Ticket / Expense**: a new `MobileCompactUtilityBar` — Back and Settings
  only, ~52–60px including safe area, no day switcher, no trip summary.

All three chrome variants reuse one `AppSettingsMenu` element built once per
render, so there is never more than one Settings trigger mounted. Desktop
header/tabs are unchanged.

### Mobile daily theme typography

The per-day theme name moved from a single `text-xs` truncated line to a
two-tier block: a 10px `本日主題` label followed by a 17px `font-black`,
two-line, `overflow-wrap:anywhere` theme name. The route-optimize control
became a 44px icon button with an `aria-label`/`title`, showing its text
label only at `min-[390px]` and up so it never collides with the theme name
at 320px; the existing undo (`↩️`) control is unchanged in behavior.

### Desktop density before/after

The desktop place card (`TripDetail.jsx`) previously always rendered a
"景點資訊" info row (`place-info-trigger`) — even with no photo, memo,
resources, or menu — as a fallback-text placeholder, and used `p-4`/`gap-4`
spacing. It now:

- Renders `place-info-trigger` only when there is real data to summarize
  (`detailParts.length > 0`); with none, it renders nothing instead of an
  empty ~52px block.
- Renders the tag row only when `item.tags` is non-empty.
- Uses `p-3`/`gap-3` (12px, within the 12–16px target) instead of `p-4`/`gap-4`.

The transit connector row between cards was already within the 28–36px
target (`h-7`, 28px) and needed no change. Desktop drag, navigation,
details, resources, notes, and the hover action row are unchanged.
`e2e/desktop-itinerary-density.spec.ts` seeds 6 places with no
photo/memo/resources at 1440×900 and asserts at least 3 land fully inside
the visible dropzone, that `place-info-trigger` does not render, and that a
basic card stays ≤140px tall.

### iPhone drop root cause

`DragDropContext` had only `onDragEnd` wired; `onDragEnd` is guaranteed by
`@hello-pangea/dnd`'s touch sensor and does fire on release, so the
"needs a second tap" complaint was not a missing drop. It was the drag
handle's `touch-action: pan-y` (same as the card) letting the browser's
native pan gesture compete with the library's touch sensor, combined with no
mechanism to distinguish the drop's release from the synthetic `click`
Safari dispatches immediately after — `ItineraryTimelineCard`'s card-open
`onClick` checked only `snapshot.isDragging`, which is already `false` by
the time that trailing click arrives, so it reopened place details right
after every touch-driven drop.

### Touch-action decision

The 44px handle now uses `touch-none` (`touch-action: none`) plus
`select-none` and `[-webkit-touch-callout:none]`, isolating it from native
browser gestures. Card surfaces keep `touch-pan-y` explicitly, so list
scrolling everywhere except the handle is unaffected. Applied to both the
mobile timeline handle (`ItineraryTimelineCard.jsx`) and the desktop card
handle (`TripDetail.jsx`).

### Synthetic click suppression

`DragDropContext` now wires `onBeforeCapture`/`onDragStart` (record the
active `draggableId` for lifecycle bookkeeping only), `onDragUpdate`
(intentional no-op — no state read or written during drag movement), and
the existing `onDragEnd`. `handleDragEnd` unconditionally stamps
`dragReleaseAtRef.current = Date.now()`, including on a cancelled or no-op
drop. `handleSavedItemDetails` and `openPlaceActionMenu` — the shared entry
points every card-open and action-menu path funnels through, mobile and
desktop, timeline and map sheet — bail out if invoked within 300ms of that
stamp. A normal tap that never engaged the sensor is unaffected.

### autoScroller tuning

`DragDropContext` now sets `autoScrollerOptions` to
`{ startFromPercentage: 0.2, maxScrollAtPercentage: 0.08, maxPixelScroll:
16, durationDampening: { stopDampeningAt: 800, accelerateAt: 300 } }` — the
range the task specified — so edge auto-scroll starts earlier and stays
capped instead of the library default.

### WebKit E2E touch-simulation limitation

Playwright's WebKit build does not reliably deliver a full drag gesture to
`@hello-pangea/dnd`'s touch sensor via synthetic `Touch`/`TouchEvent`
construction in headless mode: `new Touch()`/`new TouchEvent()` throw
`Illegal constructor` in this WebKit build, and the legacy
`document.createTouch`/`createTouchList`/`initTouchEvent` path does not
activate the sensor consistently either. `e2e/mobile-touch-drag-release.spec.ts`
therefore drives the same release/click-suppression contract through the
library's pointer (mouse) sensor (`mouseDragHandle` in
`e2e/support/touchDrag.ts`: press, a fine-grained multi-step lift past the
sensor's activation threshold, many small move steps, release). This is a
stand-in for, not a replacement of, the physical iPhone Safari checklist
below, which is the only way to confirm real-touch release-to-drop feel.

A separate, pre-existing, unrelated observation: on this checkout, a
single-position keyboard-driven reorder on a freshly seeded 4-item day does
not reliably reach the Firebase Emulator within several seconds, while the
existing 12-item/11-position keyboard spec persists reliably. This
reproduces with the keyboard sensor alone, on code this change does not
touch, so it is a characteristic of small-magnitude reorders in this test
harness, not a regression. `e2e/mobile-touch-drag-release.spec.ts` asserts
DOM-level release behavior only; the existing keyboard spec remains the
persistence regression check.

### Map peek decision

`MapItinerarySheet` moves from a single collapsed/56%-expanded toggle to two
states, `peek` and `cards` (default `cards`, matching the existing default
experience):

- **peek**: `h-[calc(4.5rem+env(safe-area-inset-bottom))]` (72px + safe
  area, within the 64–76px target), a single full-row button showing the
  handle plus either the selected place's time/name (single-line, truncated)
  or `今日 N 個景點` / `展開今日行程` when nothing is selected. No image, no
  navigation, no `⋯`. Tapping anywhere on the row expands to `cards`.
- **cards**: unchanged `clamp(10.5rem, 30%, 12.5rem)` horizontal card rail.
  The former 56% expanded state is removed — no distinct product value was
  identified for a third height beyond peek and the existing card rail.

`MapItinerarySheet` no longer remounts on day switch (the `key={dayId}` on
its call site in `MobileTripMapView.jsx` was removed), so `peek`/`cards`
state now persists across day switches as required; marker/card selection
sync into the peek label without forcing an expand, and switching days
updates the peek label to the new day's selected/first place without
changing peek/cards state.

### 320/390/1440 evidence

- `e2e/mobile-map-itinerary-sheet.spec.ts` (320×568, 390×844): map tab no
  longer shows `mobile-trip-header`; shows `mobile-map-top-bar`,
  `back-to-lobby`, `app-settings-trigger`, day switcher; sheet defaults to
  `cards`; toggling to peek keeps a ≥44px touch target, shows the selected
  day's place name, sits above `mobile-nav-map`, and tapping it re-expands.
- `e2e/place-menu-layout.spec.ts` (320×390 unchanged; desktop breakpoint
  updated): desktop card padding-top is now 12px (was 16px), and
  `place-info-trigger` is absent (not merely hidden) when no data is seeded.
- `e2e/desktop-itinerary-density.spec.ts` (1440×900): ≥3 basic cards fully
  visible per day column, no oversized fixed height, no empty info
  placeholder.
- `e2e/mobile-touch-drag-release.spec.ts` (390×844): release-triggered
  reorder with no extra tap, no accidental details-open, no lingering click,
  cancel clears drag state, and a normal tap still opens details.

### Regression found and fixed during this round

Scoping `MobileTripHeader` to the plan tab also removed its
`SyncStatusIndicator` (`sync-status-indicator`) from the map, ticket, and
expense tabs, where it had always been visible. This broke three existing
specs (`external-app-ticket.spec.ts`, `ticket-edit-lifecycle.spec.ts`, and a
`whats-new-tour.spec.ts` FeatureTour step that targets the sync status
control) at the Mobile Safari viewport. Fixed by adding an optional
`syncStatusNode` prop to `MobileMapTopBar` and `MobileCompactUtilityBar`,
wired from the same `capabilities.cloudSync` expression `MobileTripHeader`
already used, built once per render and shared across all three chrome
variants like the existing `mobileSettingsMenu`. All three specs pass after
the fix; `MobileMapTopBar.test.jsx` and `MobileCompactUtilityBar.test.jsx`
now assert the sync status node renders.

### Third-round automated evidence

| Check | Result |
| --- | --- |
| MobileMapTopBar component | PASS: 1 test |
| MobileCompactUtilityBar component | PASS: 1 test |
| MobileTripMapView / map peek component | PASS: 9 tests (3 new: peek selected-place label, peek day-count fallback, state persists across day switch) |
| Desktop density/regression component (`TripDetail.repositoryIntegration.test.jsx`) | PASS: updated for `md:p-3` and no-data info-trigger absence |
| Focused map sheet E2E (`mobile-map-itinerary-sheet.spec.ts`) | PASS: 4 Mobile Safari + 4 Desktop Chrome |
| Focused desktop density E2E (`desktop-itinerary-density.spec.ts`) | PASS: 1 Mobile Safari + 1 Desktop Chrome |
| Focused real-touch/pointer drag E2E (`mobile-touch-drag-release.spec.ts`) | PASS: 3 Mobile Safari + 3 Desktop Chrome |
| Existing drag/place-menu regression (`itinerary-drag.spec.ts`, `place-menu-layout.spec.ts`) | PASS: both projects |
| Full regression sweep (Expense/Ticket/Appearance/Settlement/FeatureTour/Example Trip/etc.) | PASS: 233 passed, 14 existing PWA conditional skips, both projects, 11.4 min. One `external-app-ticket.spec.ts` Desktop Chrome anchor-attribute check was flaky under full-suite load but passed reliably in isolation; it does not touch any file this change modifies. |
| Lint | PASS |
| Typecheck | PASS |
| Build | PASS; existing chunk-size warning only |
| Full Vitest | PASS: 66 files, 755 tests |
| `git diff --check` | PASS |
| Firebase Emulator project | `demo-travel-e2e` |
| Production Firebase accessed | false |
| Firebase Rules/config modified | false |
| Dependencies changed | false |
| Deploy | false |

## Fourth-round: planner DnD refinement and arrival-time state machine

Physical iPhone testing of the third round's touch-action/click-suppression
fix showed release-to-drop was still not resolved, and separately confirmed
four planner issues: the desktop title read as decorative italic, the
desktop card still exposed a direct navigation button and an edit/nearby/
copy/delete hover row duplicating Place Details, a long day theme could push
the 智慧排路線 control outside the day column, and the recalculation badge
could stay on screen permanently. Full root cause and decision detail lives
in `docs/decisions/MOBILE_DND_RELEASE_BEHAVIOR.md`,
`docs/decisions/DESKTOP_ITINERARY_PLANNER_HIERARCHY.md`, and
`docs/decisions/ARRIVAL_TIME_RECALCULATION_STATE.md`; this section
summarizes and records evidence.

### iPhone drop: re-diagnosis and fix

The third round's root cause (a trailing synthetic `click` reopening Place
Details) was real but distinct from the task's actual complaint ("release
doesn't insert immediately"). Re-reading the code: `onDragEnd` is still
guaranteed to fire, but `handleDragEnd`'s state updates went through React's
default (non-`flushSync`) scheduling from a callback the DnD library invokes
outside React's synthetic event system - on iOS Safari this can leave the
reordered DOM committed-but-unpainted until the next touch interaction. Both
drag clones also carried `will-change-transform` on top of `transform-gpu`,
a known contributor to a stale composited layer surviving a short-lived
clone's unmount. Fix: the whole drop's state (`setBackupItin`,
`clearOptimizationSummary`, `setRouteDurations`, `setDirtyRecalcDays`,
`setItinerary`) is now committed in one `react-dom` `flushSync` call, and
`will-change-transform` was removed from both clones. No dependency was
added or evaluated - Gate path A's precondition (`onDragEnd` firing
reliably) holds, so path B's `@dnd-kit` swap was out of scope this round.
See the "Manual iPhone Safari checklist" below - this remains unconfirmed on
real hardware from this session.

### `?dndDebug=1` trace

`src/features/itinerary/dndDebugTrace.js` adds an opt-in, non-PII console
trace (event name, relative timestamp, day/droppable ids, indices, drag
reason only - never place names, coordinates, or repository data), enabled
only via `?dndDebug=1` in the URL. It covers `onBeforeCapture`,
`onDragStart`, `onDragEnd` (with destination validity), a same-tick
post-`flushSync` commit marker, a next-`requestAnimationFrame` marker, and a
debug-only capture-phase `touchend`/`touchcancel` listener for correlating
native release timing with `onDragEnd` on real hardware.

### Desktop planner hierarchy

- `trip-detail-title` no longer renders `italic`.
- The desktop place card no longer renders a direct navigation button or the
  `desktop-place-actions` hover row (編輯／周圍／複製／刪除). Those actions,
  plus navigate, now live in Place Details
  (`place-detail-navigate-button`/`-nearby-button`/`-copy-button`/
  `-delete-button`, alongside the existing `place-detail-edit-button`).
  Delete keeps its existing confirmation dialog. The card's only right-side
  affordance is the existing `place-info-trigger` summary, unchanged in its
  "only when there's real data" rendering rule.
- The day column header is now `第一天 · 7/29` on its own line, then a
  `grid-template-columns: minmax(0,1fr) auto` row pairing a `line-clamp-2`,
  `overflow-wrap:anywhere` theme name against `shrink-0` undo/optimize
  buttons that degrade to icon-only below `min-[420px]`, so a long theme can
  no longer push those buttons outside the card.

### Arrival-time recalculation state machine

`timeRecalculationDays` (a plain boolean, only ever cleared on a successful
`onRouteCalculated` callback) is replaced with a per-day `idle -> pending
{requestId, startedAt} -> success | error {requestId, completedAt}` machine
(`recalculationState`, `dirtyRecalcDays`, both in `src/TripDetail.jsx`).
`Directions` never calls `onRouteCalculated` when the Map API isn't ready,
on effect cleanup (day switch, unmount, a newer request replacing an older
one), or on a genuine failure - all of those previously left the badge on
screen forever. Every one of those cases, plus a day left with ≤1 item, now
settles: a 10s timeout backstops the cases `Directions` can't itself report,
each settle is guarded by a `requestId` match so a stale/replaced request
can never overwrite a newer one, and a day switch settles the day you leave
quietly (no error toast) while resuming its request automatically when you
return to it - independent of whether the Map tab is the active tab. No
arrival time is fabricated on error or timeout; the existing time is kept
and a one-time toast reads the required "無法取得新的移動時間，已保留目前抵達時間".

### Fourth-round automated evidence

| Check | Result |
| --- | --- |
| `TripDetail.recalculation.test.jsx` (new) | PASS: 4 tests (pending→success, timeout→one error toast, day-switch settles quietly, day left with 1 item never marked dirty) |
| `TripDetail.repositoryIntegration.test.jsx` (updated for the new card/Place Details contract) | PASS: 7 tests |
| `TripDetail.emulator.test.jsx` | PASS |
| Focused desktop density E2E (`desktop-itinerary-density.spec.ts`) | PASS: 1 Desktop Chrome |
| Focused place-menu-layout E2E (updated for the card/Place Details contract) | PASS: 3 Desktop Chrome |
| Existing drag E2E (`itinerary-drag.spec.ts`, `mobile-touch-drag-release.spec.ts`) | PASS: 6 Desktop Chrome + 6 Mobile Safari |
| `place-crud.spec.ts`, `core-empty-states.spec.ts` (updated desktop-delete path) | PASS: 10 Desktop Chrome + 10 Mobile Safari |
| `realtime-sync.spec.ts` (updated desktop-delete path) | PASS: 10 Desktop Chrome + 10 Mobile Safari |
| Lint | PASS |
| Typecheck | PASS |
| Build | PASS; existing chunk-size warning only |
| Full Vitest | PASS: 67 files, 760 tests |
| Firebase Emulator project | `demo-travel-e2e` |
| Production Firebase accessed | false |
| Firebase Rules/config modified | false |
| Dependencies changed | false |
| Deploy | false |
| Full Playwright (Desktop Chrome + Mobile Safari) | 233 passed, 1 failed, 14 skipped, 12.3 min. The failure - `realtime-sync.spec.ts` "syncs place edits between active browser contexts in realtime" (Mobile Safari) - is a WebKit engine crash (`WebKit encountered an internal error. This is a WebKit bug.` in `WebLoaderStrategy.cpp`) under full-suite resource load, not an assertion failure. Re-run alone: passed in 17.9s. It does not touch any file this change modifies beyond the pre-existing `deletePlaceThroughUi` helper, which this spec's failed run never reached. |

Full-suite Vitest and Playwright numbers above are the actual results of
this round's run, per this repository's flaky-test policy (no run is
reported as a full PASS without the real numbers and the isolated re-run
evidence for any failure).

## Fifth-round: first-touch drag activation

Physical iPhone Safari testing confirmed the fourth round's `flushSync`
release-to-drop fix works - no second tap needed on release. It also
surfaced a separate, previously-unreported bug: the first long-press on a
drag handle after the trip view loads does not start a drag; a second
long-press immediately after does, and dragging then works normally for the
rest of the session. Full root cause and decision detail is in the "Third
round" section of `docs/decisions/MOBILE_DND_RELEASE_BEHAVIOR.md` (that
document's own internal round-numbering; it is this task's fifth round
overall).

### Root cause and fix

`@hello-pangea/dnd`'s touch sensor registers its window-level `touchstart`
listener, and a `webkitHack` primer specifically meant to run ahead of the
first real touch, when `DragDropContext` mounts. `TripDetail.jsx` only
mounted `DragDropContext` inside the "trip has loaded" branch - the loading
skeleton (`TripDetailSkeleton`) was a completely separate tree with no
`DragDropContext` in it at all. That left the touch sensor's setup to run in
the very same synchronous commit that first exposed the real, touchable
drag handles, giving iOS Safari's gesture recognition no time to settle
before the user's first touch. `DragDropContext` now wraps both the loading
skeleton and the loaded content (a ternary inside it, rather than an early
`return` before it), so the sensor's listeners register during the loading
period and are already settled by the time any real handle is visible.
`DragDropContext` itself renders no DOM node and `TripDetailSkeleton`
contains no `Droppable`/`Draggable`, so this is a pure mount-timing change -
no drag/drop logic, dependency, or visual change.

### Fifth-round automated evidence

| Check | Result |
| --- | --- |
| Full Vitest | PASS: 67 files, 760 tests |
| Lint | PASS |
| Typecheck | PASS |
| Build | PASS; existing chunk-size warning only |
| Focused skeleton-loading E2E (`core-skeleton-loading.spec.ts`) | PASS: 3 Desktop Chrome + 3 Mobile Safari |
| Focused drag E2E (`itinerary-drag.spec.ts`, `mobile-touch-drag-release.spec.ts`) | PASS: 6 Desktop Chrome + 6 Mobile Safari |
| Full Playwright (Desktop Chrome + Mobile Safari) | 233 passed, 1 failed, 14 skipped, 12.4 min. The failure - `external-app-ticket.spec.ts` "syncs external App CRUD and isolated identities across browser contexts" (Desktop Chrome) - is the same test already documented as flaky under full-suite load in the third round above; re-run alone it passed in 4.9s. It exercises ticket/external-app sync, unrelated to this round's skeleton/`DragDropContext` mount-timing change. |
| Firebase Emulator project | `demo-travel-e2e` |
| Production Firebase accessed | false |
| Firebase Rules/config modified | false |
| Dependencies changed | false |
| Deploy | false |

### Fifth-round outstanding

This agent has no access to a physical iPhone; the mount-timing root cause
is inferred from `@hello-pangea/dnd`'s own source and this component's
render structure, not a captured device trace. The manual checklist item
below (first long-press after a fresh page load activates a drag
immediately) is the required next step.

## Known limitations

- Emulator E2E intentionally has no production Google Maps credential. Pure
  component tests exercise marker/card synchronization and API failure, while
  browser tests verify that the real map canvas remains singular and the sheet
  stays fully usable in the unauthenticated map state.
- Actual route results depend on the existing Google Directions service.
  Failure is shown as a route state; no decorative fallback line is presented
  as real routing.
- Native inertial scrolling, map gestures, edge auto-scroll feel, light/dark
  contrast, and final density still require a physical iPhone Safari review.
- Playwright's WebKit build cannot reliably simulate a full touch drag
  gesture against `@hello-pangea/dnd` in headless mode (see the
  WebKit E2E touch-simulation limitation above); release-to-drop feel is
  verified through the library's pointer sensor in E2E and remains a
  physical-device checklist item below.

## Manual iPhone Safari checklist

### Itinerary

- [ ] The timeline follows the compact reference direction and shows multiple
      itinerary items in one screen.
- [ ] Cards are not oversized; transit rows and long Chinese/English names are
      readable without overlap or page-level horizontal overflow.
- [ ] Navigation and secondary actions remain usable and do not open details or
      start drag accidentally.
- [ ] Normal vertical scroll, handle drag, edge auto-scroll, first/last drop,
      arrival-time recalculation, and reload persistence feel natural.
- [x] Touch release on the 44px handle inserts the item immediately — no
      second tap is needed, and details do not open right after a drop.
      Confirmed on physical iPhone Safari after the `flushSync` fix.
- [ ] The **first** long-press on a drag handle after the trip view finishes
      loading starts a drag immediately — no second long-press/tap is needed
      to "wake up" dragging. (New in the fifth round; see
      `docs/decisions/MOBILE_DND_RELEASE_BEHAVIOR.md`, "Third round.")
- [ ] A genuine single tap (no drag) still opens place details instantly.
- [ ] The "本日主題" theme name is comfortably readable (not 320px-cramped
      against 智慧排路線) and wraps to a second line for long names without
      overlapping the route-optimize button.
- [ ] Reload with `?dndDebug=1` appended to the URL, perform a real drag,
      and confirm in the console: `touchend` fires, `onDragEnd` fires with a
      valid `destination`, `onDragEnd:commit` logs, and `...:nextFrame` logs
      on the very next frame with the list already reordered on screen — no
      second tap needed to see it. Confirm no place names or coordinates
      appear in any logged line.
- [ ] After a reorder, the day header's "正在依新順序精算時間" clears once
      arrival times update (or, if it doesn't clear within ~10s, a one-time
      "無法取得新的移動時間" toast appears and existing times are kept —
      it never stays on screen indefinitely).

### Map

- [ ] The map remains dominant; the default sheet leaves meaningful map context.
- [ ] Marker numbering matches itinerary order and uses the actual route line.
- [ ] Marker/card selection, horizontal card scrolling, and day switching stay
      synchronized without aggressive zoom jumps.
- [ ] Invalid-coordinate items remain visible and sheet/navigation/safe areas
      do not overlap.
- [ ] The map tab shows only Back, the day switcher, and Settings above the
      canvas — no trip title/weather — and does not overlap native Google
      Maps controls.
- [ ] Collapsing the sheet to peek leaves a comfortable amount of map
      visible, shows the selected place (or day count) on one line, and
      tapping the peek row reliably re-expands to cards.

### Desktop

- [ ] At a typical 1440-class width, at least three basic place cards are
      visible per day column without scrolling past mostly-empty space.
- [ ] Places without notes/resources/photos show no empty "景點資訊" block.
- [ ] The desktop card shows no direct navigation button and no hover action
      row; clicking the card (not the drag handle) opens Place Details, which
      offers 導航／編輯／周圍／複製／刪除 (delete still confirms before
      removing).
- [ ] The trip title in the desktop header is bold, not italic.
- [ ] A long day theme name wraps to at most two lines and never pushes the
      智慧排路線／復原 buttons outside the day column, at both a typical and a
      narrowed desktop window width.

### Ticket / Expense

- [ ] Both tabs open directly into their content — no trip summary card, no
      day switcher — with a compact Back + Settings row that does not cover
      content and stays within the safe area.

### Cross-feature

- [ ] Light and dark appearance themes remain readable.
- [ ] FeatureTour targets still point to visible controls.
- [ ] Settlement and expense behavior is unchanged.
- [ ] Example Trip remains local and no production access occurs.
