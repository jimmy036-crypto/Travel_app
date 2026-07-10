# What's New and Feature Tour

## Current Release

- Version: `2026.07-mobile-collaboration`
- Local storage key: `travel-app-seen-release-2026.07-mobile-collaboration`
- Pending tour session key: `travel-app-pending-feature-tour-2026.07-mobile-collaboration`
- Source of truth: `src/config/releaseNotes.js`

## Update Items

- Realtime sync status: users can see connection, syncing, saved, and remote update states on the trip page.
- Mobile day switching: larger day buttons reduce accidental taps while switching itinerary days.
- Mobile place action menu: edit, nearby search, copy, and delete are grouped under the `...` menu.
- Clearer place information entry: `景點資訊` opens address, location, attachments, and notes; `查看周邊` switches to map exploration nearby.
- Collaboration improvements: places, itinerary order, expenses, and ticket attachments update across devices.

## Display Rules

- If the local storage key is missing, the app shows the What's New dialog after opening the app or a trip.
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
- Pending intent is stored in sessionStorage using `travel-app-pending-feature-tour-2026.07-mobile-collaboration`, with App state as the runtime fallback.
- Pending intent is cleared after the tour starts, when trip selection is canceled, when the selected trip fails to load, or when the user navigates back to the Lobby.
- If TripDetail reports a load failure, the app clears pending state and can show `無法開啟此旅程，請選擇其他旅程。`.
- If an editing form may contain unsaved changes, the app shows `先完成目前編輯` and does not close the form or discard input.
- If the user leaves TripDetail while the tour is active, the tour closes and runtime state is cleared.

## Adding The Next Release

1. Update `CURRENT_RELEASE_VERSION` in `src/config/releaseNotes.js`.
2. Update `CURRENT_RELEASE_NOTES.title`, `publishedAt`, and `highlights`.
3. Keep copy user-facing. Do not mention implementation details such as Firebase, E2E, browser contexts, schemas, listeners, commits, or tests.
4. Update the E2E helper constant in `e2e/support/releaseNotes.ts`.
5. Update the default Playwright `storageState` key in `playwright.config.ts`.
6. Update this document.

## Feature Tour Steps

1. Sync status: focuses `sync-status-indicator`.
2. Mobile day switching: focuses `mobile-day-switcher`.
3. Place action menu: focuses `place-action-menu-trigger`.
4. Place information: focuses `place-info-trigger`.
5. Completion: centered final card.

If a target is not present, the tour shows a centered explanation card and lets the user continue. It does not create data, switch to dangerous actions, or depend on a positioning library.

For trips with no places, the place action and place information steps are combined into one fallback step: `新增景點後解鎖更多功能`. Future tour steps should define their prerequisites in `FeatureTour.jsx`; when prerequisites are missing, prefer skipping or combining related steps instead of repeating generic missing-target messages.

## E2E Helper

Use `e2e/support/releaseNotes.ts`:

- `clearCurrentReleaseSeen(page)` makes the next navigation test the unseen release path.
- `markCurrentReleaseSeen(page)` marks the release as seen before navigation.
- `dismissCurrentReleaseNotes(page)` closes the dialog when a test intentionally allows it to appear.

Playwright config marks the current release as seen by default so existing E2E tests are not blocked by the dialog. Only `e2e/whats-new-tour.spec.ts` clears the key to test first-run behavior.

## Known Limits

- Release seen state is per browser/device.
- The tour highlights the first matching target for repeated UI elements.
- On pages without trip content, some tour steps fall back to a centered explanation.
- The tour uses lightweight fixed positioning instead of a full tooltip engine.
