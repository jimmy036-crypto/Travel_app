# What's New and Feature Tour

## Current Release

- Version: `2026.07-mobile-collaboration`
- Local storage key: `travel-app-seen-release-2026.07-mobile-collaboration`
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
