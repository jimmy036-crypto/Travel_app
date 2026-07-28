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
| Full Vitest | `npm run test:run` | PASS: 63 files, 742 tests in 27.68 s |
| Full Playwright: Desktop Chrome | Emulator only | PASS: 113 passed, 7 existing conditional skips in 4.1 min |
| Full Playwright: Mobile Safari | Emulator only | PASS: 113 passed, 7 existing conditional skips in 7.5 min |
| Diff hygiene | `git diff --check` | PASS |

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
