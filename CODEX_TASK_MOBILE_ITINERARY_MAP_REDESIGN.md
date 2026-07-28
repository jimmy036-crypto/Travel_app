# CODEX TASK — Mobile Itinerary Timeline and Map Experience Redesign

## 0. Product intent

Redesign the Travel App mobile itinerary and map pages using these two supplied visual references as **layout direction**, not as pixel-perfect artwork:

```text
docs/references/mobile-itinerary-map-redesign/itinerary-reference.png
docs/references/mobile-itinerary-map-redesign/map-reference.png
```

The desired experience is:

- itinerary page: a compact vertical timeline with clear time/place cards and transit rows;
- map page: a map-first view with ordered route markers and a horizontally scrollable itinerary sheet;
- mobile-first, easy to scan, one-hand friendly, and visually calm;
- preserve all current product data, repository isolation, drag persistence, route behavior, and existing actions.

Do not guess from memory. Inspect both reference images before planning or editing code.

The references are conceptual mockups. Do not copy Apple Maps branding, Apple logos, proprietary map tiles, or exact proprietary interface assets. Continue using the project’s existing Google Maps integration and existing icons/assets.

---

# 1. Repository and branch boundaries

## Repository

```text
jimmy036-crypto/Travel_app
```

## Required local worktree

```text
C:\Users\jimmy\PycharmProjects\travel-release-rc
```

Do not work in:

```text
C:\Users\jimmy\PycharmProjects\travel
```

Do not touch the UI Benchmark workspace or AI Project OS repositories.

## Current dependency

This redesign depends on the latest mobile itinerary refinements already present in PR #40:

```text
PR #40
branch: fix/expense-settlement-theme-mobile-itinerary
expected starting commit:
231e6e3827388a9c41629ee1339106a301c8274a
```

Before editing, verify:

```powershell
git status --short
git branch --show-current
git rev-parse HEAD
git log -1 --oneline
```

The task package itself may appear as the only expected untracked content:

```text
CODEX_TASK_MOBILE_ITINERARY_MAP_REDESIGN.md
README-START-HERE.md
SHA256SUMS.txt
docs/references/mobile-itinerary-map-redesign/itinerary-reference.png
docs/references/mobile-itinerary-map-redesign/map-reference.png
```

These supplied files are allowed and should be committed with the redesign documentation.
Any other modified or untracked file is a blocker.

If unexpected worktree changes exist, or the latest PR #40 commit is unavailable, stop without stash/reset/clean and report:

```text
MOBILE_MAP_REDESIGN_BLOCKED_BASE_NOT_READY
```

## Branch strategy

This is a major visual feature and must not enlarge PR #40.

Create a new stacked branch from the PR #40 head:

```text
feat/mobile-itinerary-map-redesign
```

The initial Draft PR must target:

```text
fix/expense-settlement-theme-mobile-itinerary
```

This makes the new PR show only the redesign diff.

Do not:

- add redesign commits to PR #40;
- retarget PR #40;
- merge PR #40;
- merge the new stacked PR;
- modify PR #38;
- target `main`;
- deploy to production.

After PR #40 is human-merged into `release/editable-demo-sandbox-rc`, a human may retarget this redesign PR to the RC branch. Codex must not do that automatically.

---

# 2. Safety rules

Prohibited:

- production Firebase access;
- `firebase deploy`;
- Firebase Rules or Firebase config changes;
- `.env`, secret, token, credential changes;
- package manager or lockfile changes unless strictly unavoidable;
- replacing Google Maps with Apple Maps or another provider;
- fabricated route geometry, duration, coordinates, weather, or photos;
- writing example-trip data to Firebase, Storage, `myTrips`, or Offline Trip Cache;
- broad rewrite of `TripDetail`;
- force push, rebase, hard reset, clean, auto-merge;
- unrelated changes to expense settlement, tickets, onboarding, PWA, or release workflows;
- using the reference PNG files as actual application backgrounds.

All Firebase E2E activity must use the existing Emulator project only.

---

# 3. Required discovery before implementation

Inspect the current implementation and record the result before changing code.

Identify:

1. mobile and desktop itinerary render paths;
2. the current `@hello-pangea/dnd` drag handle, clone, persistence, and arrival-time recalculation flow;
3. current day switching and horizontal day container behavior;
4. current map tab, `Map`, `AdvancedMarker`, `Directions`, route selection, and marker click behavior;
5. current place photo source and fallback behavior;
6. existing place details, action menu, navigation, edit, nearby, copy, and delete flows;
7. current bottom navigation and safe-area handling;
8. regular-trip Firebase Repository and Local Example Repository boundaries;
9. map loading, missing-coordinate, error, and API-unavailable states;
10. feature-tour targets that will be affected by the new layout.

Do not implement until the root components and data contracts are understood.

Prefer extracting focused components rather than adding another large section directly into `TripDetail.jsx`.

Suggested component boundaries, subject to the existing architecture:

```text
src/features/itinerary/MobileItineraryTimeline.jsx
src/features/itinerary/ItineraryTimelineCard.jsx
src/features/itinerary/TransitTimelineRow.jsx
src/features/map/MobileTripMapView.jsx
src/features/map/MapItinerarySheet.jsx
src/features/map/MapPlaceCard.jsx
```

Do not create duplicate domain logic. Reuse current calculations, repositories, actions, and map data.

---

# 4. Shared mobile page shell

The itinerary and map pages should feel like two views of the same trip.

At mobile widths, both pages should share:

## Header

- trip title;
- selected date;
- current weather when already available;
- no fabricated weather;
- compact spacing;
- safe-area top padding;
- current theme tokens rather than hardcoded white-only styling.

The itinerary reference shows a frosted summary card. The map reference shows a more open text header. Implement one coherent app style; exact duplication of both inconsistent headers is not required.

## Day switcher

- directly below the header;
- pill/segmented control;
- selected day visually clear without color alone;
- horizontal scrolling when days exceed available width;
- no page-level horizontal overflow;
- preserve current selected-day state;
- minimum 44 px touch targets;
- use existing day labels or localized equivalents;
- changing day updates both timeline and map data.

## Bottom navigation

- preserve current navigation destinations and semantics;
- fixed/sticky behavior must respect `env(safe-area-inset-bottom)`;
- content must not be hidden behind it;
- no reference-specific Apple icons or Apple branding.

## Responsive scope

- new composition is mobile-first at 320–767 px;
- desktop may retain the current detailed itinerary/map behavior unless a shared extraction improves maintainability without regression;
- do not force the phone mockup into desktop.

---

# 5. Itinerary page redesign

Use:

```text
docs/references/mobile-itinerary-map-redesign/itinerary-reference.png
```

as the layout reference.

## 5.1 Structure

The mobile itinerary must become a vertical timeline:

```text
header
day switcher
timeline
  place node + place card
  transit row
  place node + place card
  transit row
  ...
bottom navigation
```

## 5.2 Timeline rail

- a thin vertical rail on the left;
- one circular node per itinerary place;
- nodes aligned with their corresponding cards;
- route/transit rows visually connect consecutive places;
- the rail is decorative and must not convey order only by color;
- avoid expensive blur/filter effects during scroll and drag.

## 5.3 Place cards

Each mobile place card should primarily display:

- arrival time;
- place name;
- formatted stay duration when present;
- compact navigation action;
- an accessible route to existing secondary actions/details.

Layout direction:

```text
09:45  首里城公園
預計停留 1.5 小時
```

Requirements:

- significantly denser than the pre-refinement large cards;
- approximately 10–14 px internal padding;
- no oversized unused vertical space;
- title uses up to two lines;
- unbroken English uses `overflow-wrap:anywhere`;
- no overlap with controls;
- no horizontal overflow at 320 px;
- theme-aware surface, border, and text;
- reduced-motion friendly;
- avoid heavy box shadows and excessive backdrop blur on every card.

Do not hardcode the sample times or place names from the image.

## 5.4 Actions

Preserve the latest product decision:

- navigation is the primary visible action;
- edit, nearby search, copy, and delete remain in the existing secondary action menu or place-details action sheet;
- tapping the card/title opens the existing place-detail experience;
- tapping navigation opens navigation only;
- tapping the action entry does not open details or start dragging;
- destructive actions keep existing confirmation behavior.

The layout reference does not show every action. Do not remove existing capability merely to match the picture.

## 5.5 Drag and reorder

Preserve and integrate the PR #40 behavior:

- handle-only drag activation;
- normal vertical scrolling does not start a drag;
- timeline node or a dedicated 44 px handle may act as the drag handle;
- drag handle must remain accessible by keyboard where supported by the existing library;
- mobile drag clone remains lightweight and no larger than the current maximum:
  `240 × 72 px`;
- clone shows only order, arrival time, and place name;
- no image, navigation, tags, action menu, or full-card height;
- reorder persists only on drag end;
- arrival times recalculate after the confirmed reorder;
- Firebase/IndexedDB repository behavior remains unchanged;
- edge auto-scroll and first/last drop remain usable;
- desktop drag remains unchanged.

## 5.6 Transit rows

Between place cards, display the existing transport information:

- transport mode icon/label;
- estimated travel duration;
- optional distance only if existing real data already supplies it;
- do not invent route time or distance;
- compact, visually subordinate to place cards;
- align with the vertical timeline;
- do not make the transit row draggable.

Examples are visual only:

```text
🚗 開車・約 40 分鐘
🚇 大眾運輸・約 25 分鐘
🚶 步行・約 8 分鐘
```

Use current project terminology and actual stored values.

## 5.7 States

Provide coherent mobile states:

- loading skeleton matching the timeline geometry;
- empty day with existing add-place action;
- error state with retry when supported;
- missing stay duration;
- missing transit data;
- long itinerary with 10+ places;
- place without image;
- disabled cloud-only action in Example Trip.

---

# 6. Map page redesign

Use:

```text
docs/references/mobile-itinerary-map-redesign/map-reference.png
```

as the layout reference.

## 6.1 Map-first composition

At mobile widths:

```text
header
day switcher
map canvas occupying the primary viewport area
floating trip/back chip if useful
numbered route markers and route line
bottom itinerary sheet with horizontal place cards
bottom navigation
```

The map should remain the dominant surface.

Do not use the reference image itself as a map, background, or screenshot.

## 6.2 Existing Google Maps integration

Continue using:

```text
@vis.gl/react-google-maps
Google Map
AdvancedMarker
Directions / existing route implementation
```

Requirements:

- no Apple Maps replacement;
- no Apple Maps logo;
- no proprietary copied map controls;
- existing `MAP_ID` and current map configuration remain authoritative;
- do not change API keys or environment configuration;
- no fake coordinates or route polyline;
- only places with valid coordinates receive map markers;
- route requests use the existing supported mechanism;
- missing/failed route must degrade gracefully without hiding markers.

## 6.3 Ordered markers

For the selected day:

- marker numbers reflect itinerary order;
- marker label may include compact place name and existing category icon;
- selected marker is visually distinct using shape/border/scale in addition to color;
- labels must not cover the entire map;
- at dense zoom levels, prevent uncontrolled overlap where reasonably possible;
- clicking a marker selects the corresponding bottom-sheet card;
- selecting a card centers or pans to the marker without excessive zoom jumps;
- reorder changes marker order after persistence.

Do not hardcode the labels shown in the mockup.

## 6.4 Route display

- show the route line between valid ordered coordinates using existing real route behavior;
- do not draw a straight or decorative line and present it as a real route unless the existing app already labels it as a fallback;
- skipped invalid-coordinate items remain visible in the itinerary sheet with a clear “無定位” state;
- fit bounds to the selected day’s valid places, while respecting header and sheet padding;
- avoid refitting on every minor state update;
- user manual pan/zoom should not be constantly overridden.

## 6.5 Bottom itinerary sheet

Create a bottom sheet above the app navigation:

- visible grab handle;
- default partially expanded state preserving map context;
- horizontally scrollable place cards;
- optional collapsed/expanded states if they can be implemented with the existing dependencies;
- no new gesture library;
- respect bottom safe area and navigation height;
- no nested page-level horizontal overflow;
- sheet must not fully obscure the map by default.

Recommended initial geometry:

- collapsed/header state: enough to show handle and context;
- default state: roughly 28–38% of available mobile height;
- expanded maximum: roughly 55–65%, with internal scroll;
- exact values should be derived from existing page shell and tested at 320 × 568 and 390 × 844.

Each horizontal map card should display:

- cover image when already available;
- stable fallback when absent or failed;
- arrival time;
- place name;
- selected state;
- no fabricated photo;
- no remote image search.

Card interaction:

- tap selects and focuses marker;
- tapping selected card opens existing place details only if that matches the current interaction contract;
- preserve a clear navigation action;
- action menu remains available without cluttering the main card;
- scrolling cards should not pan the map underneath.

When selected marker changes, scroll the corresponding card into view without aggressive animation when reduced motion is enabled.

## 6.6 Map controls and overlays

- keep essential existing map controls;
- avoid placing controls beneath the header, sheet, or bottom navigation;
- add appropriate map padding;
- route loading indicator must not block the entire map;
- error messages must be readable and dismissible/retryable where supported;
- marker/card synchronization must work after day switching.

## 6.7 Map states

Test and implement:

- no places;
- one valid place;
- multiple valid places;
- mixed valid and invalid coordinates;
- route loading;
- route failure;
- map API unavailable;
- image load failure;
- long place name;
- selected day switch;
- Example Trip without Firebase writes.

---

# 7. Visual system

The user wants the **layout** shown in the references, with a soft, modern, translucent aesthetic.

However:

- use existing app theme tokens;
- support current dark and light appearance;
- do not hardcode a white-only design;
- do not add a fixed blurred photographic background;
- do not use the reference images in production UI;
- keep contrast WCAG-conscious;
- limit backdrop blur on scroll-heavy elements for mobile performance;
- use clear typography and spacing rather than heavy decoration;
- preserve user-selected appearance settings.

Suggested visual hierarchy:

- trip title: strongest;
- selected day: clearly emphasized;
- time and place name: primary timeline content;
- stay/transit metadata: secondary;
- map route/markers: primary map layer;
- map cards: secondary contextual layer.

---

# 8. Data and repository integrity

The redesign is presentation and interaction work.

Do not change settlement semantics, expense calculations, ticket data, or trip repository contracts unless an existing UI integration requires a minimal typed adapter.

Regular trips:

- continue through the injected Firebase repository;
- E2E uses Firebase Emulator only.

Example trips:

- continue through Local Example Repository and IndexedDB;
- zero Firebase room writes;
- zero Storage writes;
- zero `myTrips` writes;
- zero Offline Trip Cache writes.

No component may call Firebase directly.

---

# 9. Performance requirements

Mobile performance is a release criterion.

- avoid rendering both full mobile and desktop trees when CSS-only hiding causes expensive duplicate maps or DnD trees;
- only one live Google Map instance per page;
- avoid reconstructing marker and route data on every render;
- memoize only measured/stable derived data;
- no map refit loop;
- lazy/defer heavy details not needed in the visible timeline;
- do not decode large place images in the drag clone;
- horizontal sheet scroll must remain smooth;
- timeline scrolling must remain smooth with 20 places;
- avoid full-trip persistence during drag movement;
- no new large dependency.

Record any performance-relevant design decisions in QA documentation.

---

# 10. Accessibility requirements

- semantic buttons for day pills, navigation, cards, sheet controls, and actions;
- visible focus;
- useful `aria-label`s;
- selected day and selected marker/card use `aria-current` or `aria-selected` as appropriate;
- sheet has an accessible name and state;
- map has a text-accessible selected itinerary list;
- keyboard flow remains valid on desktop;
- Escape closes modal/action-sheet states;
- reduced-motion preference limits auto scroll/pan animation;
- controls have approximately 44 × 44 px touch areas;
- information is not communicated by color alone.

---

# 11. Testing

Do not start with the full Playwright suite.

## 11.1 Unit/component tests

Add or update focused tests for:

### Timeline

- selected-day data;
- time/place/stay rendering;
- transit row rendering;
- missing transit data;
- long Chinese title;
- unbroken English title;
- navigation/action event isolation;
- drag clone content and size contract;
- mobile/desktop render strategy;
- empty/loading/error states.

### Map

- marker numbering follows selected-day order;
- invalid coordinates are excluded from markers but retained in the sheet;
- selected marker/card synchronization;
- day switch updates markers/cards;
- image fallback;
- route loading/failure fallback;
- bottom-sheet state;
- map page does not create duplicate map instances.

## 11.2 Playwright E2E

Use existing Firebase Emulator helpers.

Add focused specs or extend existing ones:

```text
e2e/mobile-itinerary-timeline.spec.ts
e2e/mobile-map-itinerary-sheet.spec.ts
```

### Mobile Safari

Test at least:

- 390 × 844;
- 320 px width;
- timeline with 10+ places;
- first-to-last and last-to-first drag;
- normal vertical scroll does not trigger drag;
- lightweight clone remains within 240 × 72 px;
- transit rows align between cards;
- long names do not overflow;
- day switch updates timeline;
- map displays ordered valid markers;
- clicking marker selects card;
- clicking card focuses marker;
- sheet horizontal scroll does not pan map;
- selected day updates map and cards;
- invalid-coordinate item has a clear state;
- bottom navigation does not cover timeline/sheet;
- Example Trip remains local.

### Desktop Chrome

Regression:

- existing desktop itinerary remains usable;
- existing desktop drag remains usable;
- existing map controls and route behavior remain usable;
- no duplicate Google Map;
- no settlement/appearance regression.

Avoid brittle pixel-perfect snapshot tests. Prefer:

- bounding boxes;
- visible item counts;
- semantic role assertions;
- marker/card selection state;
- overflow checks;
- interaction and persistence checks.

A small number of stable screenshots may be recorded as QA evidence if the repository already has a supported screenshot pattern, but must not become fragile blockers.

## 11.3 Execution order

Run:

```text
1. focused unit/component tests
2. focused timeline E2E
3. focused map E2E
4. existing itinerary drag and place-menu E2E
5. lint
6. typecheck
7. build
8. full Vitest
9. full Playwright Desktop Chrome + Mobile Safari
10. git diff --check
```

Record:

```text
Vitest
Playwright Desktop Chrome
Playwright Mobile Safari
Lint
Typecheck
Build
git diff --check
Firebase Emulator project
Production Firebase accessed
Firebase Rules modified
Dependencies changed
Deploy
```

---

# 12. QA documentation

Create:

```text
docs/qa/MOBILE_ITINERARY_MAP_REDESIGN_QA.md
```

Include:

- reference image paths;
- what was adopted from each reference;
- what was deliberately not copied;
- root component map;
- mobile/desktop strategy;
- timeline layout;
- map/marker/sheet interaction;
- route and invalid-coordinate behavior;
- performance considerations;
- repository isolation;
- test matrix and results;
- known limitations;
- manual iPhone Safari checklist;
- production access false;
- deploy false.

If architecture warrants it, create:

```text
docs/decisions/MOBILE_ITINERARY_MAP_COMPOSITION.md
```

Do not claim Gate approval.

---

# 13. Manual QA checklist to include in the Draft PR

## Itinerary

- timeline visually matches the compact reference direction;
- one screen shows multiple itinerary items;
- place cards are not oversized;
- transit rows are readable;
- long names do not overlap;
- navigation remains accessible;
- secondary actions remain usable;
- normal scroll and drag both feel natural;
- edge auto-scroll and persistence work.

## Map

- map remains the dominant surface;
- marker numbering matches itinerary order;
- marker and bottom-card selection stay synchronized;
- route line uses actual existing route behavior;
- horizontal cards scroll smoothly;
- bottom sheet leaves meaningful map context visible;
- day switching updates all map content;
- bottom navigation and safe areas do not overlap content.

## Cross-feature

- appearance themes remain readable;
- FeatureTour targets remain valid;
- settlement and expense functionality unchanged;
- Example Trip remains local;
- no production access.

---

# 14. Git and PR behavior

Use focused commits, for example:

```text
refactor(itinerary): add mobile timeline composition
feat(map): add synchronized mobile itinerary sheet
test(trip): cover mobile timeline and map interactions
docs: add mobile itinerary map redesign evidence
```

Use per-file staging. Do not mix unrelated formatting.

Push:

```text
feat/mobile-itinerary-map-redesign
```

Create a Draft stacked PR with:

```text
base: fix/expense-settlement-theme-mobile-itinerary
head: feat/mobile-itinerary-map-redesign
```

Suggested title:

```text
feat: redesign mobile itinerary timeline and map experience
```

PR body must clearly state:

- stacked on PR #40;
- must not merge before PR #40;
- reference image paths;
- mobile-only versus desktop behavior;
- route/marker/sheet behavior;
- repository isolation;
- tests;
- risks;
- manual QA;
- no production deploy.

Do not mark Ready, auto-merge, or merge.

---

# 15. Completion criteria

Complete only when all are true:

- reference images were inspected;
- separate stacked branch created from the exact PR #40 head;
- itinerary mobile layout is a compact vertical timeline;
- transit rows connect places;
- drag remains handle-only, lightweight, persistent, and smooth;
- map is map-first with ordered markers;
- marker and horizontal sheet cards synchronize;
- selected day synchronizes timeline and map;
- invalid coordinate and route failure states work;
- current Google Maps integration is preserved;
- current action capabilities are preserved;
- no Apple branding or copied proprietary map assets;
- dark/light appearance remains usable;
- 320 and 390 px pass;
- desktop regression passes;
- Example Trip remains local;
- no dependency/rules/config change unless explicitly documented and approved;
- all required tests pass;
- Draft stacked PR is created;
- no merge or deploy occurs.

Only then output:

```text
TRAVEL_MOBILE_ITINERARY_MAP_REDESIGN_READY
```

If blocked or tests fail, do not output the success token.

---

# 16. Final report format

## 目前階段

Branch, implementation, tests, stacked PR.

## 已完成項目

Timeline and map requirements.

## Root cause / architecture findings

Current component/data structure and why extraction was needed.

## 修改內容

Main files and mobile/desktop strategy.

## 測試結果

```text
Vitest:
Playwright Desktop Chrome:
Playwright Mobile Safari:
Lint:
Typecheck:
Build:
git diff --check:
Firebase Emulator project:
Production Firebase accessed:
Firebase Rules modified:
Dependencies changed:
Deploy:
```

## 尚未完成項目

Human iPhone Safari and product review only.

## 風險與回滾

Commits and `git revert` order; no history rewrite.

## 距離最終里程碑

PR #40 dependency, stacked PR retargeting, RC regression, Gate 3.

## 下一個可執行步驟

Exactly one human action.
