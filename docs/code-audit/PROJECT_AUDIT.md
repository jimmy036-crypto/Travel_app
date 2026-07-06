# Travel Project Audit

Date: 2026-07-06
Branch: `refactor/project-audit-cleanup`
Tracked files scanned: 252 (`git ls-files`)

## 1. Project Structure Summary

- `src/`: React/Vite application. Main entry is `src/main.jsx`; `src/App.jsx` handles trip list and room routing; `src/TripDetail.jsx` owns the detailed itinerary, expenses, tickets, storage, realtime sync, export and map flows.
- `src/components/`: shared UI and modal components. `UIComponents.jsx` is the main component collection; `PWAUpdatePrompt.jsx` is injected only in production builds through `vite.config.js`.
- `src/features/expenses/`: pure expense, split, balance and settlement calculations with Vitest coverage.
- `src/features/itinerary/`: pure itinerary ordering and travel-time calculations with Vitest coverage.
- `src/helpers.js`: date, storage, URL, ID, theme, time and coordinate helpers.
- `e2e/`: Playwright suites using Firebase Database and Storage Emulators through `e2e/support/emulator.ts`.
- `scripts/`: agent guardrails, verification wrapper, Firebase CLI version helper and unattended runner.
- `.github/`, `firebase.json`, `database.rules.json`, `storage.rules`, `playwright.config.ts`, `vite.config.js`, `vitest.config.js`, `eslint.config.js`: CI, Firebase, test and build configuration.
- `agent/skills/` and `.agents/skills/`: tracked agent skill copies. They are duplicated, but this audit treats them as maintained project assets until a maintainer decides which path is canonical.

## 2. Main Modules And Responsibilities

- Trip list and routing: `src/App.jsx`, Firebase Database `rooms` metadata, URL query room selection and emulator create helper.
- Trip detail state: `src/TripDetail.jsx`, realtime listeners, local UI state, branch writes for `itinerary`, `expenses`, `tickets`, `checklist`, `settlements` and `meta`.
- Map and place search: `@vis.gl/react-google-maps` in `src/App.jsx`, `src/TripDetail.jsx` and `src/components/UIComponents.jsx`.
- Drag and drop: `@hello-pangea/dnd` in `src/TripDetail.jsx`, with core movement logic isolated in `src/features/itinerary/itineraryCalculations.js`.
- Expenses: modal UI in `UIComponents.jsx`, calculations in `src/features/expenses/expenseCalculations.js`, E2E coverage in `e2e/expense-crud.spec.ts`.
- Storage uploads/deletes: ticket and place resources in `UIComponents.jsx` and `TripDetail.jsx`, with storage E2E coverage.
- PWA: `vite-plugin-pwa`, `src/pwa-update-entry.jsx`, `src/components/PWAUpdatePrompt.jsx`.

## 3. High-Risk Areas

- Firebase and storage data consistency: `src/firebase.js`, `src/TripDetail.jsx`, `src/components/UIComponents.jsx`, `database.rules.json`, `storage.rules`.
- Expense conservation and settlement math: `src/features/expenses/expenseCalculations.js` and related UI writes.
- Realtime sync and conflict handling: `useRoomBranchSync` in `src/TripDetail.jsx`.
- E2E emulator setup: `playwright.config.ts`, `e2e/support/emulator.ts`, `.env.emulator.local` runtime dependency.
- Very large React files: `src/TripDetail.jsx` (3225 lines) and `src/components/UIComponents.jsx` (2975 lines).
- Package and lockfile changes: dependency cleanup affects `package.json` and `package-lock.json`.

## 4. Confirmed Removable Items

Each item below has at least two checks: project-wide reference search plus config/build/test coverage or location-based inclusion checks.

- `src/assets/react.svg`
  - `rg --fixed-strings "react.svg"` returned no references.
  - No import from `src/assets` exists in `src/`, `index.html`, Vite config, tests or scripts.
- `public/vite.svg`
  - `rg --fixed-strings "vite.svg"` returned no references.
  - `index.html` and `vite.config.js` reference the real favicon/PWA icons instead.
- `travel-e2e-debug-current.zip`
  - `rg --fixed-strings "travel-e2e-debug-current.zip"` returned no references.
  - It is a generated E2E debug artifact (`*.zip`) and not part of source, config, tests or build inputs.
- `expense-engine-backup-20260703-142137/`
  - `rg --fixed-strings "expense-engine-backup-20260703-142137"` returned no references.
  - Directory name and contents indicate a dated backup copy outside `src/`; it is not in `tsconfig.json` include and is not imported by application or tests.
  - Not removed in this pass because deleting it would create a 6000+ line non-test diff, which exceeds the task's conservative diff boundary.
- ESLint missing ignore for `.tmp/**`
  - Baseline `npm run lint` failed only because ESLint scanned `.tmp/firebase-home/.../index-*.js`.
  - `npx eslint . --ignore-pattern ".tmp/**"` passed, confirming the failure is an ignore-scope mismatch.

## 5. Suspected Removable But Evidence Insufficient

- `framer-motion`: only appears in `package.json` and `package-lock.json`; no source imports found. Leave for maintainer decision because package removal changes the lockfile and may relate to planned UI work.
- `leaflet` and `react-leaflet`: only appear in package files; current map implementation uses Google Maps. Leave for maintainer decision because map provider changes are product-facing.
- `concurrently`: only appears in package files; no scripts use it. Safe candidate, but package cleanup should be reviewed with other dependency removals.
- `@testing-library/user-event`: only appears in package files; current tests use `fireEvent`/queries. Safe candidate, but keep until test authoring plans are confirmed.
- `autoprefixer` and `postcss`: only appear as direct dev dependencies and transitive Tailwind tooling; no PostCSS config exists. Do not remove in this pass because CSS tooling expectations can be implicit.
- `.codex/config.toml`: tracked local agent config. Do not inspect or modify because task explicitly excludes personal Codex settings.
- `agent/skills/` versus `.agents/skills/`: duplicated skill trees. Do not delete without a maintainer decision on the canonical agent path.
- `public/icon-1024x1024.png`: not referenced by app config, but may be used for store/native packaging. Do not remove.

## 6. Duplicate Code

- `agent/skills/` and `.agents/skills/` duplicate the same Firebase/Xcode skill documentation. This is repository-level duplication, but cleanup requires ownership decision.
- `src/TripDetail.jsx` and `src/components/UIComponents.jsx` both contain place resource type helpers. Extraction is possible, but storage/resource behavior is high-risk and should be tested in a focused follow-up.
- `src/features/expenses/expenseCalculations.js` and `src/features/itinerary/itineraryCalculations.js` each define a local `toFiniteNumber`. Duplication is small and acceptable until more shared numeric utilities exist.
- Several E2E specs repeat trip creation/navigation setup. A shared fixture could reduce maintenance, but current explicit setup keeps flows readable.

## 7. Overlong Or Overcomplex Files

- `src/TripDetail.jsx`: 3225 lines. Mixed responsibilities include realtime sync, itinerary rendering, export HTML, map details, storage delete cleanup, DnD, optimization preview and emulator hooks.
- `src/components/UIComponents.jsx`: 2975 lines. Contains many modal components plus file upload validation/serialization helpers.
- `e2e/place-storage.spec.ts`: 501 lines. Covers valuable high-risk flows, but shared setup helpers could reduce repetition.
- `e2e/support/emulator.ts`: 388 lines. Centralized and important; keep as-is unless adding targeted tests.

## 8. Type And Error Handling Issues

- TypeScript runs with `allowJs: true` and `checkJs: false`, so most `src/**/*.jsx` errors are not type-checked.
- Runtime Firebase env handling in `src/firebase.js` returns `null` DB/storage when required config is missing. Current tests mock Firebase, but production error state coverage is limited.
- `vite.config.js` and some docs contain mojibake in comments/text. Build succeeds, but documentation quality and future edits are risky.
- Vitest emits `Could not parse CSS stylesheet` after all tests pass. This appears to be a jsdom/Tailwind parsing warning, not a failed assertion.

## 9. Test Gaps

- No focused unit tests for PWA update prompt behavior.
- No dedicated test for missing Firebase config UI behavior.
- Realtime conflict logic is covered by E2E, but `useRoomBranchSync` itself is embedded in `TripDetail.jsx`, making isolated tests difficult.
- No test asserts that lint ignores generated `.tmp` emulator cache; the direct validation is `npm run lint`.

## 10. Documentation Gaps

- No root `README.md` exists.
- `docs/ai-development/AUTOPILOT.md` and several comments appear mojibake in PowerShell output; verify source encoding before editing.
- `src/update log` has a space in the filename and is not referenced by docs or scripts. It may be historical notes, not runtime code.
- Audit evidence was missing before this file.

## 11. NPM Dependency Inventory

Used by current source/config/tests:

- `react`, `react-dom`, `vite`, `@vitejs/plugin-react`, `typescript`, `vitest`, `jsdom`, Testing Library packages.
- `firebase`, `firebase-tools`, `@playwright/test`.
- `@vis.gl/react-google-maps`, `@hello-pangea/dnd`, `html2canvas-pro`.
- `@tailwindcss/vite`, `tailwindcss`, `vite-plugin-pwa`, ESLint packages and `globals`.
- `@types/google.maps`, `@types/node`, `@types/react`, `@types/react-dom`.
- Capacitor packages are configured by `capacitor.config.json` but no native project was audited in this pass.

Possibly unused direct dependencies:

- `framer-motion`, `leaflet`, `react-leaflet`, `concurrently`, `@testing-library/user-event`, `autoprefixer`, `postcss`.

Node_modules state:

- `npm ls --depth=0` reports `@emnapi/runtime@1.8.1 extraneous`. This is not in `package.json`; it should be fixed by a clean install rather than committed source changes.

## 12. Configuration And CI Issues

- P0/P1: `eslint.config.js` does not ignore `.tmp/**`, so `npm run lint` fails after Firebase Emulator tooling writes UI cache files.
- `tsconfig.json` excludes `.firebase` but not `.tmp`; TypeScript include currently prevents `.tmp` scanning, so no change required for tsc.
- `.gitignore` already ignores `.tmp/`, debug logs, reports, coverage and env-local files.
- `playwright.config.ts` correctly forces Firebase Emulator and Vite E2E mode; baseline E2E passed locally.
- `.firebaserc` points to a production-looking default project, but E2E uses `--project demo-travel-e2e`; do not modify without Firebase project decision.
- Git currently tracks `travel-e2e-debug-current.zip`, a generated artifact that should not be committed.

## 13. Suggested Priority

### P0

- Fix lint scope so generated Firebase Emulator cache cannot break `npm run lint` or `npm run agent:verify`.

### P1

- Remove verified generated or sample artifacts: `travel-e2e-debug-current.zip`, `src/assets/react.svg`, `public/vite.svg`.
- Remove verified dated backup directory: `expense-engine-backup-20260703-142137/`.
- Add explicit ignore patterns for E2E/debug zip artifacts if missing.

### P2

- Split `TripDetail.jsx` into smaller modules in focused, test-backed steps.
- Extract shared place resource helpers after locking storage tests.
- Decide whether duplicated `agent/skills/` and `.agents/skills/` are both required.
- Review possibly unused dependencies in one dedicated lockfile PR.

### P3

- Repair mojibake comments/docs after confirming source encoding.
- Add a concise root README.
- Rename or archive `src/update log` if maintainers still need it.

## Baseline Results

- `git status --short`: clean at start.
- `git branch --show-current`: `refactor/project-audit-cleanup`.
- `node --version`: `v22.22.0`.
- `npm --version`: `10.9.4`.
- `npm run agent:guardrails`: passed, changed files 0, risk low.
- `npx tsc --noEmit`: passed.
- `npm run lint`: failed because ESLint scanned `.tmp/firebase-home/.cache/firebase/emulators/ui-v1.15.0/client/assets/index-*.js`.
- `npm run test:run`: passed, 6 files / 77 tests. jsdom printed CSS parse warnings.
- `npm run build`: passed. Vite warned that some chunks exceed 500 kB.
- `npm run test:e2e`: passed, 42 tests.
- `git diff --check`: passed.
