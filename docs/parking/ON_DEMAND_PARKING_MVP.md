# On-demand parking MVP

## Baseline and product decisions

- Current integration base: `origin/main` at PR #55 merge commit `c070d9e98611798bb9d2dc4d9925b809f654fe76`.
- PR #44 remains the original UI baseline; this branch is now integrated with the Google Auth, membership, and complete trip-deletion architecture from PR #55.
- Decision 1A: parking is a contextual branch inside the shared `探索附近` panel, not a separate floating map tool. `這站停車` is enabled only when the user has selected a destination with valid coordinates; opening Explore or Parking never starts a provider request.
- Decision 2A: Google Maps supplies global parking positions. TDX augments Taiwan results with official tariff/availability/update data. Missing detailed providers show `費率資料未提供`.
- Decision 3B: the selected parking facility is an optional `parkingPlan` field on the destination place, never a route stop.
- Decision 4A: raw official tariff text is always retained. Hourly equivalents, qualified maximums, and estimates appear only when the narrow parser proves they are safe.
- Decision 5A: the MVP supports cars only.
- Decision 6A: formal trips persist through the Firebase Trip Repository, Example Trip through the Local Example Repository/IndexedDB, and offline preview remains read-only.
- Decision 7A: Google Places remains a browser-side provider. TDX runs only behind the authenticated `searchParking` Firebase Callable; the former public Vercel API is removed.
- Decision 8A: the Callable accepts only `roomId`, `dayId`, `placeId`, and an allow-listed radius. It resolves the destination's canonical coordinates from RTDB after checking membership, so it is not an arbitrary-coordinate proxy.

## Mandatory discovery record

- `TripDetail.jsx` owns the trip snapshot, Explore lifecycle, selected Explore result, repository and realtime subscription. Desktop `<Map id="main-map">` is rendered directly in its map panel.
- `MobileTripMapView.jsx` owns mobile map-place selection; it is now controllable by `TripDetail` so Explore and Parking share one selected destination anchor across layouts.
- `MapItinerarySheet` renders the mobile destination cards. It is hidden while Explore or Parking results are active; after a save, its `管理停車` action replaces the itinerary cards with the saved-plan actions inside the same sheet. Mobile therefore keeps navigation, `更新或更換`, and remove without stacking a floating `SavedParkingCard` over the map. Desktop may still show that saved-plan card while no map tool is open.
- Explore uses `exploreQuery`, `exploreResults`, explicit map/place scope, and `handleExploreSearch`. `MapExploreControls` provides the single `探索附近` entry, category searches, and the anchored `這站停車` handoff. A shared `mapMode` keeps Explore and Parking mutually exclusive.
- Itinerary edits ultimately call `repository.updateItinerary`. The parking flow uses the same method and never writes Firebase directly.
- `firebaseTripRepository` subscribes to `rooms/{tripId}` with `onValue` and delegates itinerary writes to `persistItinerary`. `localExampleTripRepository` stores the same normalized itinerary branch in its local record store.
- Existing two-context collaboration coverage is in `e2e/realtime-sync.spec.ts`; parking stays on the same itinerary listener/last-write behavior and creates no top-level branch.
- Existing place navigation helpers in `TripDetail.jsx` create Google Maps HTTPS search/direction URLs. Parking navigation permits only Google Maps HTTPS URLs (and the TDX HTTPS source URL).
- Parking results make `導航到停車場` the primary action. `設為此景點停車場` remains a secondary editable action and persists the existing optional `parkingPlan` on that destination.
- Actual transport values are `meta.transport` strings such as `汽車 🚗`, and `nextLeg.mode` values `AUTO`, `FLIGHT`, `TRAIN`, `TRANSIT`, and `WALK`. `isDrivingContext` is the only parking helper that interprets them.
- Firebase Functions already owns the trusted Google Auth and room-membership boundary. `searchParking` reuses that boundary, validates canonical `roomAccess`, applies a per-UID quota, and reads TDX credentials from Secret Manager.

## Provider endpoints and policies

Google Nearby Search (New):

- Endpoint documented by Google: `POST https://places.googleapis.com/v1/places:searchNearby`.
- The implementation uses the equivalent Maps JavaScript `Place.searchNearby` on the already loaded Places library.
- Requested fields only: `id`, `displayName`, `formattedAddress`, `location`, `businessStatus`, `regularOpeningHours`, `utcOffsetMinutes`, `googleMapsURI`.
- Search type: `parking`; maximum results: 8; rank: distance. No wildcard, `parkingOptions`, reviews, rating, price level, or price range.
- `regularOpeningHours` raises the search to the Enterprise field tier. It is requested because the approved result UI needs an honest open/closed/unknown state. `parkingOptions` is Enterprise + Atmosphere and is intentionally excluded.
- Official references: [Nearby Search (New)](https://developers.google.com/maps/documentation/places/web-service/nearby-search), [Places policies and attribution](https://developers.google.com/maps/documentation/places/web-service/policies), and [Place ID storage](https://developers.google.com/maps/documentation/places/web-service/place-id).
- Storage conclusion: Google Places content is session-only. Only Place ID and parking-selection timestamps/provider identifiers persist. Google-only names, addresses, coordinates, opening data and navigation URLs do not persist. A confidently merged TDX record persists TDX identity/snapshots, not Google identity fields. Google Maps attribution remains visible with results.

TDX:

- OAS 3.0.4 source: `https://tdx.transportdata.tw/webapi/File/Swagger/V3/945f57da-f29d-4dfd-94ec-c35d9f62be7d`.
- Static: `GET https://tdx.transportdata.tw/api/basic/v1/Parking/OffStreet/CarPark/City/{City}`.
- Tariff: `GET https://tdx.transportdata.tw/api/basic/v1/Parking/OffStreet/ParkingRate/City/{City}`.
- Availability: `GET https://tdx.transportdata.tw/api/basic/v1/Parking/OffStreet/ParkingAvailability/City/{City}`.
- Auth: `POST https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token` with server-only Secret Manager values `TDX_CLIENT_ID` and `TDX_CLIENT_SECRET`.
- Official references: [TDX parking Swagger](https://tdx.transportdata.tw/api-service/swagger/basic/945f57da-f29d-4dfd-94ec-c35d9f62be7d) and [TDX platform/data licensing overview](https://tdx.transportdata.tw/about/tdx).
- Storage conclusion: TDX states its standardized platform data is supplied under Taiwan's Government Data Open License 1.0 for value-added use. Official snapshots are retained with source/update timestamps. Static response cache is capped at six hours; availability at three minutes. All server and browser caches have fixed entry limits.

## Tariff parser scope

Supported narrow forms include `每小時 60 元`, `每 30 分鐘 30 元`, a single explicit time band such as `08:00–22:00 每 30 分鐘 50 元`, `當日最高 300 元`, and `入場後 12 小時最高 1,500 日圓`. The parser always retains `rawText`.

It deliberately refuses a single hourly equivalent or estimate for first-hour/progressive, day/night, weekday/holiday, grace-period, event, or otherwise unparsed conditions. Estimates require positive `stayTime`, a destination arrival time, exactly one unbanded linear rule, and only a clearly applicable daily cap.

## Request and persistence boundaries

- Initial map load, selected-place changes, map drag/zoom, date changes, opening `探索附近`, opening `這站停車`, and rendering the driving-context hint issue zero parking requests.
- The standard parking-discovery entry is `探索附近` → `這站停車` and requires a selected destination with valid coordinates. An existing desktop saved-plan card may also reopen Parking for refresh/replacement, but it uses the same destination anchor and does not search automatically. A request occurs only when the user presses `搜尋／重新搜尋` inside the anchored parking panel. Changing radius does not request until that button is pressed again.
- Google Nearby Search is a billable request on each uncached explicit search. TDX is called through Firebase Callable by the same explicit action but can independently degrade. The room/day/place/radius result is cached for two minutes in the browser session.
- The TDX Callable requires a Google-authenticated active owner/editor, a `ready` room, and a canonical itinerary destination. It enforces per-UID minute and hourly limits before contacting TDX.
- Example Trip never invokes the Callable and uses Google Maps positions only. A missing TDX secret, quota limit, timeout, or provider outage does not block the itinerary or Google parking results.
- Switching day/place keeps the Google Map mounted, but resets the parking session, aborts pending work, clears results, and closes Parking. Opening Explore closes Parking; entering Parking clears Explore results while retaining the same selected destination anchor.
- Formal and Example Trip saves both call the injected Trip Repository. Offline Preview has no repository and all save/remove buttons remain disabled.

## Bundle record

After integrating the latest `main` but before the authenticated Callable hardening, `npm run build` produced:

- TripDetail: 589.34 kB (165.89 kB gzip)
- Main index: 793.53 kB (240.92 kB gzip)

The final protected-provider build produces:

- TripDetail: 591.04 kB (166.46 kB gzip)
- Main index: 793.54 kB (240.93 kB gzip)
- CSS: 120.24 kB (18.22 kB gzip)

The Firebase Callable client stays inside the already lazy TripDetail chunk. The authenticated boundary adds about 0.56 kB gzip to TripDetail and 0.01 kB gzip to the home entry relative to the post-merge pre-hardening build.

## Deployment configuration

The TDX credentials are Firebase Function secrets, not Vercel environment variables and never `VITE_*` values:

```bash
npx -y firebase-tools@latest functions:secrets:set TDX_CLIENT_ID --project travel-app-923ef
npx -y firebase-tools@latest functions:secrets:set TDX_CLIENT_SECRET --project travel-app-923ef
```

After the updated Function and frontend are deployed and verified, remove the obsolete `TDX_CLIENT_ID` and `TDX_CLIENT_SECRET` values from Vercel. Do not enable `enforceAppCheck` until Firebase App Check has a separate tested rollout; Google identity, canonical room access, canonical coordinates, and quota enforcement are the current release boundary.
