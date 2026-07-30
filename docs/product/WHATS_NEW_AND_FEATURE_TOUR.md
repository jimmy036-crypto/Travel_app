# What's New and Feature Tour

## Current Release

- Version: `2026.07-trip-management-redesign`
- Title: `行程規劃、地圖與記帳全面升級`
- Published at: `2026-07-30`
- Local storage key: `travel-app-seen-release-2026.07-trip-management-redesign`
- Pending tour session key: `travel-app-pending-feature-tour-2026.07-trip-management-redesign`
- Source of truth: `src/config/releaseNotes.js`
- Release notes document: `docs/releases/2026-07-trip-management-redesign.md`

Older release keys are never deleted, so a user who has seen a previous release still sees this one once.

## Update Items

Six user-facing highlights, in display order:

1. `responsive-planner` — 手機與桌面規劃介面重整.
2. `map-itinerary` — 地圖與行程保持同步.
3. `settlement-transfer` — 記錄旅伴是否已完成轉帳.
4. `place-details` — 景點資料集中管理.
5. `appearance-tools` — 外觀與旅程工具整合.
6. `guided-example` — 可編輯範例旅程與新版指引.

Copy rules for this list: stay user-facing, do not claim full offline editing, and do not claim flawless iOS behaviour. Icons stay single simple glyphs so no icon dependency is required.

## Display Rules

- If the local storage key is missing, the app shows the What's New dialog after opening the app or a trip.
- Users can reopen What's New from the global settings menu in the Lobby or TripDetail.
- Feature Tour also starts from the same settings menu; the first-run automatic release dialog behavior is unchanged.
- `開始導覽` marks the release as seen, closes the dialog, and starts the feature tour.
- `不再顯示此版本` marks the release as seen.
- `稍後再看` closes the dialog for the current runtime only; a reload or new session can show it again.
- Manual entry points can reopen the dialog even after the release is marked as seen.
- If localStorage is unavailable, the app continues to work and treats the release as unseen for that session.

The seen state is intentionally stored only in localStorage. It is a per-device product hint, not shared trip data, so it should not be written to Firebase or added to the trip schema.

## Context-Aware Tour Start

- TripDetail CTA: the primary button is `開始導覽`; it starts only after the current trip has loaded and no potentially unsaved editor is open.
- Lobby with saved trips: the primary button is `選擇旅程並開始導覽`; it marks the release as seen and stores a session-only pending tour intent.
- Lobby with one saved trip: the app may route directly into that trip, then waits for TripDetail readiness before showing the tour.
- Lobby with multiple saved trips: the app shows `選擇要用來導覽的旅程` and uses the existing saved trip list as the source of truth.
- Lobby with no trips: the primary button is `建立第一個旅程`; it opens the existing create-trip flow and does not create fake trip data.
- Pending intent is stored in sessionStorage using `travel-app-pending-feature-tour-2026.07-trip-management-redesign`, with App state as the runtime fallback.
- Pending intent is cleared after the tour starts, when trip selection is canceled, when the selected trip fails to load, or when the user navigates back to the Lobby.
- If TripDetail reports a load failure, the app clears pending state and can show `無法開啟此旅程，請選擇其他旅程。`.
- If an editing form may contain unsaved changes, the app shows `先完成目前編輯` and does not close the form or discard input.
- If the user leaves TripDetail while the tour is active, the tour closes and runtime state is cleared.

## Adding The Next Release

1. Update `CURRENT_RELEASE_VERSION` in `src/config/releaseNotes.js`.
2. Update `CURRENT_RELEASE_NOTES.title`, `publishedAt`, and `highlights`.
3. Keep copy user-facing. Do not mention implementation details such as Firebase, E2E, browser contexts, schemas, listeners, commits, or tests.
4. Update the E2E helper constants in `e2e/support/releaseNotes.ts` and `e2e/support/tickets.ts`.
5. Update the default Playwright `storageState` key in `playwright.config.ts`.
6. Add a release document under `docs/releases/`.
7. Update this document.

## Feature Tour Steps

The tour resolves its own target per layout, because the merged trip view renders different DOM for mobile and desktop. Breakpoint: `window.innerWidth < 768` counts as mobile.

| # | Step id | Mobile target | Desktop target |
| --- | --- | --- | --- |
| 1 | `sync-status` | `mobile-trip-sync-status` → `sync-status-indicator` | `sync-status-indicator` |
| 2 | `current-day-planning` | `mobile-day-switcher` | first in-viewport `itinerary-day-card` → `day-theme-row` |
| 3 | `place-details` | `place-card[data-mobile-layout="timeline"]` → `place-card-title` | `place-info-trigger` |
| 4 | `map-itinerary` | `mobile-nav-map` | `map-panel` |
| 5 | `expense-settlement` | `expense-tab-button[data-layout="mobile"]` | `expense-tab-button[data-layout="desktop"]` |
| 6 | `trip-tools` | `app-settings-trigger` | `app-settings-trigger` |
| 7 | `done` | none (centered card) | none (centered card) |

Rules enforced by `FeatureTour.jsx`:

- The tour never teaches the desktop `...` place action menu or a desktop direct-navigation button. Those controls do not exist or are hidden by the `md` breakpoint on desktop, and hidden responsive DOM is never spotlighted.
- Targets are only accepted when they render with a non-zero box. Candidates already inside the viewport win, so a horizontally scrolled desktop planner spotlights the day the user is looking at.
- The tour never activates a tab, clicks a target, or creates data. When a step's target is not on screen, the step renders instructional `noTargetTitle`/`noTargetDescription` copy with no spotlight and is marked with `data-instructional="true"` plus a `feature-tour-instructional-step` marker.
- The local example trip has no cloud sync, so step 1 falls back to instructional copy explaining that.
- The current step id is exposed as `data-step-id` on `feature-tour-step` so tests assert the step, not the copy.
- Escape closes the tour, focus returns to the launching control, and `resize`, `orientationchange` and capture-phase `scroll` all re-resolve the target for the current layout.
- No tour or positioning dependency is used.

For trips whose planner surface is visible but has no place cards, step 3 is replaced by one fallback step, `empty-place-fallback` (`新增景點後解鎖景點資訊`). A hidden planner is not treated as an empty trip: the step is kept and falls back to instructional copy instead.

Future tour steps should declare `mobileSelectors`, `desktopSelectors` and no-target copy in `FeatureTour.jsx`. Prefer combining related steps or writing honest instructional copy over repeating generic missing-target messages.

## E2E Helper

Use `e2e/support/releaseNotes.ts`:

- `clearCurrentReleaseSeen(page)` makes the next navigation test the unseen release path.
- `markCurrentReleaseSeen(page)` marks the release as seen before navigation.
- `dismissCurrentReleaseNotes(page)` closes the dialog when a test intentionally allows it to appear.

Playwright config marks the current release as seen by default so existing E2E tests are not blocked by the dialog. Only `e2e/whats-new-tour.spec.ts` clears the key to test first-run behavior.

## Known Limits

- Release seen state is per browser/device.
- The tour highlights the first visible matching target for repeated UI elements; it does not mark them all.
- On pages without trip content, some tour steps fall back to a centered instructional card.
- The tour uses lightweight fixed positioning instead of a full tooltip engine.
- Real routes need valid Google Maps configuration; the map step teaches the surface, not a guarantee of live routing.
