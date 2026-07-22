# Architecture

This document describes the Travel App product line through Phase 7B-3. `PROJECT_STATUS.md` identifies which capabilities are merged to the stable branch and which remain on a feature branch.

## Overall Modules

- `src/App.jsx` owns the application shell, Lobby, room navigation, create/import flows, release experiences, offline preview routing, and first-run/demo routing on the Phase 7B line.
- `src/TripDetail.jsx` coordinates one Firebase room, realtime state, itinerary, checklist, expense, ticket, offline snapshot, and feature-tour integration.
- `src/features/**` contains domain-focused UI, models, calculations, hooks, and local persistence adapters.
- `src/services/**` contains Firebase persistence boundaries for places and tickets.
- `src/components/**` contains shared App Shell, modal, PWA, feedback, and tour components.
- Firebase Realtime Database is the shared trip source of truth; Firebase Storage holds supported attachments.
- Local storage contains device-local trip references, appearance preferences, release/onboarding markers, member display identity, and offline snapshots. These values are not authorization.

## Lobby

The Lobby is rendered by `App.jsx`. It reads `google-travel-my-trips`, presents real room summaries, imports room metadata, and opens a selected room through the `?room=` query. The Lobby never treats its local trip list as authoritative room data. On the Phase 7B line, an empty Lobby offers a built-in Demo entry, while returning users can open the Demo from Settings.

## Trip

`TripDetail.jsx` subscribes to `rooms/{roomId}` with a Realtime Database listener. It normalizes loaded branches into React state and delegates domain interactions to feature components and action hooks. Writes target the room or a room branch, while listener updates reconcile other browser contexts.

Core room branches are:

- `meta`
- `itinerary`
- `expenses`
- `settlements`
- `tickets`
- `checklist`

## Firebase

`src/firebase.js` initializes the SDK and connects local validation to configured emulators. The canonical database root remains `rooms/{roomId}`. Production Firebase, rules, and deployment are outside routine agent validation. Storage attachment metadata is persisted in Database records; Storage object lifecycle must follow the Database ordering documented in domain services and tests.

## Offline

`features/offline/offlineTripCache.js` builds versioned, bounded snapshots for recently opened trips. `OfflineTripPreview.jsx` renders those snapshots without write controls. Offline mode does not provide full editing or background synchronization. Cache identity and content are device-local and never replace Firebase authorization.

## Demo

On the Phase 7B line, onboarding Demo data is a deterministic built-in view model. It does not create a Firebase room, enter `myTrips`, write Offline Trip Cache, or navigate to third-party ticket sites. `DemoTripPreview` is a mutually exclusive App view and is read-only. Creating from the Demo opens the existing blank trip creation flow; Clone Flow remains separate and deferred.

## Feature Tour

`FeatureTour.jsx` renders the existing spotlight experience. Release notes may route users into a compatible trip before starting the tour. Demo and first-run work do not change tour chapters. Tour pending/seen state is device-local presentation state, not trip data.

## Ticket

`features/tickets/ticketModel.js` normalizes legacy and canonical attachment, web-link, and external-app tickets. `TicketEditorModal.jsx` owns form presentation only. `useTicketActions.js` coordinates create/edit/delete behavior through `services/ticketsService.js`. Attachment replacement uploads a new version, persists Database state, updates local state, then cleans the old object; cleanup failure does not roll back a successful record.

## Expense

`features/expenses/ExpenseSection.jsx` renders expense and settlement views. `expenseCalculations.js` performs deterministic totals and allocation calculations. `useExpenseActions.js` coordinates expense mutations while preserving amount conservation and realtime consistency.

## Checklist

Checklist state is normalized and coordinated in `TripDetail.jsx`. Items can be shared or member-scoped. The selected checklist actor is a device-local convenience stored under `travel-checklist-actor-{roomId}` and is not an access-control boundary.

## Data Flow

1. Lobby local references select or import a `roomId`.
2. `App.jsx` routes to `TripDetail` with that ID.
3. `TripDetail` subscribes to `rooms/{roomId}` and normalizes each branch.
4. Feature UI emits user intent to domain hooks or service functions.
5. Services write Database and, where required, Storage in failure-safe order.
6. The realtime listener distributes committed room changes to all active contexts.
7. Eligible online room state may produce a read-only local offline snapshot.

## State Flow

- **Shared state:** Firebase room data observed through realtime listeners.
- **View state:** React state for active room, tab, modal, editor, tour, Demo, and offline preview selection.
- **Device preferences:** localStorage values for Lobby references, appearance, release/onboarding status, and member display identity.
- **Offline state:** versioned local snapshot, explicitly read-only.
- **Ephemeral state:** form drafts, loading/sync indicators, dialog focus, and Demo interactions; discarded when their view closes unless a deliberate persistence action succeeds.
