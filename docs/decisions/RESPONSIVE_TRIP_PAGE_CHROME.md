# Responsive per-tab trip page chrome

Status: implementation decision for this change only. This document does not represent Gate 1, Gate 3, or release approval.

## Context

`MobileTripHeader` (title, date, destination, weather) and `MobileDaySwitcher` were mounted unconditionally for every mobile tab. On a physical iPhone this meant the 票券 (Ticket) and 記帳 (Expense) tabs, which have their own summary content, paid rent on a second trip-summary header, and the 地圖 (Map) tab lost map canvas height to a header whose title/weather/date are redundant with the map's own day context.

## Decision

Mobile chrome is now selected per `activeTab`, not mounted once for the whole page:

- `activeTab === 'plan'`: `MobileTripHeader` (full summary) + `MobileDaySwitcher`, unchanged.
- `activeTab === 'map'`: a new `MobileMapTopBar` (`src/features/map/MobileMapTopBar.jsx`) — a single 44px-safe-area-aware row with Back, an embedded `MobileDaySwitcher` (reused via a new optional `wrapperClassName` prop so it can drop its own border/padding chrome when embedded), and Settings. No title, destination, or weather.
- `activeTab === 'ticket' | 'expense'`: a new `MobileCompactUtilityBar` (`src/components/MobileCompactUtilityBar.jsx`) — Back and Settings only, ~52–60px including safe area, no day switcher, no trip summary.

All three chrome variants share one `AppSettingsMenu` instance built once per render (`mobileSettingsMenu` in `TripDetail.jsx`) and passed as `settingsNode`, so only one Settings trigger ever mounts regardless of tab — there was never a risk of a duplicate trigger since the three chrome components are mutually exclusive by tab, but sharing one JSX element keeps the trip-tools action list (share, checklist, export) defined in exactly one place.

Desktop header, tabs, and toolbar are unchanged; this only affects the `isMobileViewport` render branch already present in `TripDetail.jsx`.

## Why not extend `MobileTripHeader` with a "compact" prop

A single header component with a `variant` prop would still be one component owning three unrelated layouts (full summary / day-switcher-only / back-and-settings-only), fighting itself with conditional rendering internally. Three small, single-purpose components map directly to the three chrome contracts in the task brief and are each independently testable.

## Scope limits

No change to `MobileTripHeader`'s own markup, to desktop chrome, to `AppSettingsMenu`'s content, or to `ExpenseSection`/`TicketWalletSection`. No new dependency.
