# Firebase Security Foundation

## 1. Current State

- Firebase products currently used:
  - Realtime Database: confirmed by `firebase/database` imports in `src/App.jsx`, `src/TripDetail.jsx`, `src/services/placesService.js`, and expense/place action modules.
  - Cloud Storage: confirmed by `firebase/storage` imports in `src/TripDetail.jsx`, `src/components/UIComponents.jsx`, and `src/features/places/usePlaceActions.js`.
  - Authentication: foundation is introduced in this phase through `src/firebase.js`, but no sign-in flow is implemented yet.
- Current authentication state: the app does not create or observe Firebase Auth users. There is no anonymous login, Google login, account page, or auth state listener.
- Current Database rules state: temporary time-limited public read/write rules.
- Current Storage rules state: temporary time-limited public read/write rules.
- Temporary rule expiry date: 2026-09-01, based on `database.rules.json` timestamp and `storage.rules` `timestamp.date(2026, 9, 1)`.
- Current user identity model: there is no server-trusted user identity in product data. Client-side member names are trip participants, not authenticated principals.
- Current room sharing mechanism: a room is reachable by `roomId` or a URL containing `?room=...`; possession of a room ID currently enables access while temporary rules allow it.
- Current localStorage identity assumptions:
  - `google-travel-my-trips` stores local lobby shortcuts and is not authoritative.
  - `google-travel-offline-trip-cache-v1` stores local offline preview snapshots.
  - `travel-checklist-actor-{roomId}` stores the currently selected checklist actor by room.
  - `google-travel-custom-bg` stores a local appearance preference.
  - `travel-app-seen-release-*` and `travel-app-pending-feature-tour-*` store release/tour state.

## 2. Realtime Database Path Inventory

| Path pattern | Operations | Source files | Current trust assumption | Target authorization |
|---|---|---|---|---|
| `rooms/{roomId}` | `set` creates a full room; `onValue` listens to an active room; `update` writes branches such as `meta`, `itinerary`, `expenses`, `settlements`, and `tickets`. | `src/App.jsx`, `src/TripDetail.jsx`, `src/services/placesService.js`, `src/features/expenses/useExpenseActions.js`, `src/features/places/usePlaceActions.js` | `roomId` from generated ID, URL query, import input, or local shortcut is trusted by temporary public rules. | Read: owner/editor/viewer members only. Write: owner/editor for allowed child data. Whole-room create requires authenticated user and creates owner membership. |
| `rooms/{roomId}/meta` | `get` for import, `update` for trip metadata edits, read through `rooms/{roomId}` listener. | `src/App.jsx`, `src/TripDetail.jsx` | Any client with room ID can read/write while public rules allow it. | Read: room members. Write: owner/editor for normal fields. Only owner can manage protected fields such as `ownerUid` and member roles. |
| `rooms/{roomId}/itinerary` | `update` through full room branch update and `persistItinerary`. | `src/TripDetail.jsx`, `src/services/placesService.js`, `src/features/places/usePlaceActions.js` | Client state is trusted after room ID validation. | Read: room members. Write: owner/editor only. Viewer cannot write. |
| `rooms/{roomId}/expenses` | `update` entire expense array on create/edit/delete and through branch sync. | `src/TripDetail.jsx`, `src/features/expenses/useExpenseActions.js` | Client supplies array and room ID. | Read: room members. Write: owner/editor only. Viewer cannot write. |
| `rooms/{roomId}/settlements` | `update` entire settlements branch through branch sync. | `src/TripDetail.jsx` | Client supplies array and room ID. | Read: room members. Write: owner/editor only. Viewer cannot write. |
| `rooms/{roomId}/tickets` | `update` entire ticket array through branch sync; ticket deletion updates local branch after optional Storage delete. | `src/TripDetail.jsx`, `src/components/UIComponents.jsx` | Client supplies ticket records, download URLs, and storage paths. | Read: room members. Write: owner/editor only. Viewer cannot write. Storage path must belong to same room. |
| `rooms/{roomId}/checklist/{itemId}` | multi-child `update` patch for checklist item create/update/complete/delete-like changes. | `src/TripDetail.jsx` | Client supplies checklist item patch and actor name. | Read: room members. Write: owner/editor; viewer write policy needs product decision for personal checklist items. |

Observed cross-node or multi-location updates:

- Product code mainly updates single room branches. It does not currently update a separate user index.
- `update(dbRef(db, rooms/{roomId}), { branch: value })` is a multi-child update within one room node.
- No product source currently deletes an entire `rooms/{roomId}` node. Lobby removal only deletes the local shortcut.

Untrusted `roomId` inputs:

- URL query via `?room=...`.
- Import input that may contain a raw room ID or URL.
- Local `google-travel-my-trips` shortcut.
- Offline cache keys and snapshots.

## 3. Storage Path Inventory

| Object path pattern | Content type | Upload source | Delete source | Target authorization |
|---|---|---|---|---|
| `rooms/{roomId}/tickets/{ticketId}/{fileName}` | Ticket images and PDFs. | `src/components/UIComponents.jsx` ticket modal via `uploadBytesResumable`; metadata includes `roomId` and `ticketId`. | `src/TripDetail.jsx` deletes `ticket.storagePath` before removing ticket record; may allow record-only delete if Storage delete fails. | Read/write/delete only for room owner/editor; viewer read decision should match ticket visibility. Path room ID must match authorized room. |
| `rooms/{roomId}/places/{itemId}/{timestamp}_{fileName}` | Place cover photo image. | `src/components/UIComponents.jsx` place edit modal via `uploadBytesResumable`; metadata includes `roomId` and `itemId`. | `src/components/UIComponents.jsx` deletes previous photo after successful save; `src/features/places/usePlaceActions.js` deletes on place delete. Failed cleanup is logged. | Read/write/delete only for room owner/editor; viewer read allowed if viewer can read room. Path room ID and item ID must match room data. |
| `rooms/{roomId}/places/{itemId}/{timestamp}_{resourceId}_{fileName}` | Place resources such as menu images, PDFs, reservation/article/official/social files. | `src/components/UIComponents.jsx` place resource upload via `uploadBytesResumable`; metadata includes `roomId`, `itemId`, `resourceId`, and `resourceType`. | `src/components/UIComponents.jsx` deletes removed resources after save; deletes newly uploaded resources on save failure; `src/features/places/usePlaceActions.js` deletes on place delete. | Read/write/delete only for room owner/editor; viewer read allowed if viewer can read room. Path room ID and item ID must match room data. |

Storage data model notes:

- Product records store both `url` from `getDownloadURL` and `storagePath` for uploaded files.
- External URL resources may have a `url` with no `storagePath`; these cannot be cleaned up through Storage and should not be treated as Storage objects.
- Offline cache canonicalization strips `imageUrl`, `attachment`, and `storagePath`.
- Cleanup failures are generally logged and do not always block record updates; future rules must not rely on cleanup succeeding.

## 4. Security Invariants

- Unauthenticated users cannot access protected trips.
- Non-members cannot read a trip.
- A viewer cannot write trip data.
- An editor can modify ordinary trip data such as itinerary, expenses, checklist, tickets, and place resources.
- An editor cannot change `ownerUid`.
- An editor cannot delete an entire trip.
- An owner can manage members and roles.
- Storage permissions must match Realtime Database trip permissions.
- Client-provided `uid` fields are not trusted.
- Security Rules must derive identity from `auth.uid`.
- An invite code or room ID alone is not authorization.
- LocalStorage shortcuts and offline cache are convenience data only, never authorization.

## 5. Proposed Authorization Model

Suggested schema additions for later phases:

```text
rooms/{roomId}/meta/ownerUid
rooms/{roomId}/members/{uid}/role
userTrips/{uid}/{roomId}
```

Roles:

- `owner`: full control over room data, membership, roles, and trip deletion.
- `editor`: can modify ordinary trip data but cannot change owner or manage owner-only membership controls.
- `viewer`: can read trip data but cannot write ordinary trip data.

Model details:

- `rooms/{roomId}/members/{uid}/role` should be the canonical membership source for authorization.
- `userTrips/{uid}/{roomId}` should be an index for lobby discovery, not the authorization source.
- `ownerUid` should be immutable after creation except for an explicit owner transfer operation protected by rules.
- Member role changes should require owner authorization.
- Trip deletion should require owner authorization and should account for Storage cleanup lifecycle.
- Invite flow should create membership with server-trusted credentials or a one-time claim mechanism, not by trusting room ID possession.

## 6. Legacy Room Migration

Current legacy rooms do not have `ownerUid` or a UID-keyed member role map.

Migration requirements:

- Do not make the first user who opens a legacy room the owner by default.
- Use an additional non-forgeable claim credential if client-side claim is required. Examples include a one-time claim token distributed out-of-band or a signed server-side claim flow.
- Consider an owner migration window where existing room owners can claim with a temporary credential.
- Add a migration completion marker, for example `rooms/{roomId}/meta/securityMigratedAt`.
- Preserve rollback by leaving old data intact until all room membership and user index entries are verified.
- Define behavior for unclaimed rooms before enforcing rules. Options include read-only archival access for users with a valid legacy claim credential, or requiring manual owner support.
- Ensure `userTrips/{uid}/{roomId}` entries are backfilled from canonical room membership after claim succeeds.

Open migration risks:

- Existing local shortcuts prove only that a browser once knew a room ID; they do not prove ownership.
- Existing member names are display strings, not UIDs.
- Existing download URLs may remain usable independent of Storage rules if long-lived tokens exist; token rotation policy needs review.

## 7. Rollout Plan

- 6D-0 Auth Emulator Foundation: add local Auth emulator, auth instance export, and path/security inventory.
- 6D-1 Anonymous Session Bootstrap: create local anonymous sessions and observe auth state without changing rules.
- 6D-2 Identity-aware Room Schema: add owner/member fields and user trip index on new rooms.
- 6D-3 Rules Emulator Test Matrix: add Database and Storage rules unit tests for owner/editor/viewer/outsider.
- 6D-4 Legacy Room Migration: implement claim flow and migration tooling.
- 6D-5 Enforce Production Rules: deploy auth-based Database and Storage rules after migration readiness.
- 6D-6 Google Account Linking: link anonymous users to Google accounts.
- 6D-7 Security Monitoring and Cleanup: monitor denied operations, cleanup obsolete public URLs/tokens, and remove temporary compatibility paths.

## 8. Open Decisions

- Which sign-in method should be the first production identity: anonymous only, Google only, or anonymous with Google linking?
- Should viewers be allowed to update personal checklist completion, or should viewer be strictly read-only?
- What exact legacy claim credential is acceptable for existing rooms?
- How long should the legacy migration window remain open?
- Should room invites be single-use, expiring, role-specific, or owner-approved?
- Should Storage download tokens be rotated during migration?
- Should trip deletion synchronously delete Storage objects, queue cleanup, or mark deleted first?
- What is the support process for unclaimed legacy rooms after rules enforcement?
