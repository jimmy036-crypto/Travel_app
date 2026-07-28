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

### Map

- [ ] The map remains dominant; the default sheet leaves meaningful map context.
- [ ] Marker numbering matches itinerary order and uses the actual route line.
- [ ] Marker/card selection, horizontal card scrolling, and day switching stay
      synchronized without aggressive zoom jumps.
- [ ] Invalid-coordinate items remain visible and sheet/navigation/safe areas
      do not overlap.

### Cross-feature

- [ ] Light and dark appearance themes remain readable.
- [ ] FeatureTour targets still point to visible controls.
- [ ] Settlement and expense behavior is unchanged.
- [ ] Example Trip remains local and no production access occurs.
