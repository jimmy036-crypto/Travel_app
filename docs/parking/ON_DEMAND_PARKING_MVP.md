# On-demand parking MVP

## Baseline and product decisions

- Base: `origin/main` at `36fc5daa6b14ae6f341fa54356a849571891f3fc`.
- PR #44 final head: `cc5ae5a18e9c180cc8482e3b8a78ae4c38086e26`.
- PR #44 merge commit: `36fc5daa6b14ae6f341fa54356a849571891f3fc`.
- Decision 1A: parking is a manually opened map layer. Driving context may show a dismissible entry hint but never starts a request.
- Decision 2A: Google Maps supplies global parking positions. TDX augments Taiwan results with official tariff/availability/update data. Missing detailed providers show `費率資料未提供`.
- Decision 3B: the selected parking facility is an optional `parkingPlan` field on the destination place, never a route stop.
- Decision 4A: raw official tariff text is always retained. Hourly equivalents, qualified maximums, and estimates appear only when the narrow parser proves they are safe.
- Decision 5A: the MVP supports cars only.
- Decision 6A: formal trips persist through the Firebase Trip Repository, Example Trip through the Local Example Repository/IndexedDB, and offline preview remains read-only. Parking modules never import Firebase.

## Mandatory discovery record

- `TripDetail.jsx` owns the trip snapshot, Explore lifecycle, selected Explore result, repository and realtime subscription. Desktop `<Map id="main-map">` is rendered directly in its map panel.
- `MobileTripMapView.jsx` owns mobile map-place selection; it is now controllable by `TripDetail` so parking has one selected destination anchor across layouts.
- `MapItinerarySheet` renders the mobile destination cards. It is hidden while the parking result sheet is active, and its cards show an existing saved parking plan.
- Existing Explore uses `exploreQuery`, `exploreResults`, and `handleExploreSearch`; the old search is explicitly invoked and historically used map bounds/center. A shared `mapMode` now makes Explore and Parking mutually exclusive.
- Itinerary edits ultimately call `repository.updateItinerary`. The parking flow uses the same method and never writes Firebase directly.
- `firebaseTripRepository` subscribes to `rooms/{tripId}` with `onValue` and delegates itinerary writes to `persistItinerary`. `localExampleTripRepository` stores the same normalized itinerary branch in its local record store.
- Existing two-context collaboration coverage is in `e2e/realtime-sync.spec.ts`; parking stays on the same itinerary listener/last-write behavior and creates no top-level branch.
- Existing place navigation helpers in `TripDetail.jsx` create Google Maps HTTPS search/direction URLs. Parking navigation permits only Google Maps HTTPS URLs (and the TDX HTTPS source URL).
- Actual transport values are `meta.transport` strings such as `汽車 🚗`, and `nextLeg.mode` values `AUTO`, `FLIGHT`, `TRAIN`, `TRANSIT`, and `WALK`. `isDrivingContext` is the only parking helper that interprets them.
- This Vite project has no prior server functions. Vercel supports file-based Node functions under `/api`; `api/parking/search.js` is isolated from `src/**` and uses native `fetch`.

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
- Auth: `POST https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token` with server-only `TDX_CLIENT_ID` and `TDX_CLIENT_SECRET`.
- Official references: [TDX parking Swagger](https://tdx.transportdata.tw/api-service/swagger/basic/945f57da-f29d-4dfd-94ec-c35d9f62be7d) and [TDX platform/data licensing overview](https://tdx.transportdata.tw/about/tdx).
- Storage conclusion: TDX states its standardized platform data is supplied under Taiwan's Government Data Open License 1.0 for value-added use. Official snapshots are retained with source/update timestamps. Static response cache is capped at six hours; availability at three minutes.

## Tariff parser scope

Supported narrow forms include `每小時 60 元`, `每 30 分鐘 30 元`, a single explicit time band such as `08:00–22:00 每 30 分鐘 50 元`, `當日最高 300 元`, and `入場後 12 小時最高 1,500 日圓`. The parser always retains `rawText`.

It deliberately refuses a single hourly equivalent or estimate for first-hour/progressive, day/night, weekday/holiday, grace-period, event, or otherwise unparsed conditions. Estimates require positive `stayTime`, a destination arrival time, exactly one unbanded linear rule, and only a clearly applicable daily cap.

## Request and persistence boundaries

- Initial map load, selected-place changes, map drag/zoom, date changes, and the driving hint issue zero parking requests.
- A request occurs only after `附近停車` opens the layer and the user then presses `搜尋／重新搜尋`. Changing radius does not request until that button is pressed again.
- Google Nearby Search is a billable request on each uncached explicit search. TDX is called by the same explicit action but can independently degrade. The same anchor/radius is cached for two minutes in the browser session.
- Switching day/place remounts the controller, aborts pending work, clears results, and closes Parking. Opening Explore closes Parking; opening Parking clears Explore.
- Formal and Example Trip saves both call the injected Trip Repository. Offline Preview has no repository and all save/remove buttons remain disabled.

## Bundle baseline

Before the parking change, `npm run build` produced:

- `TripDetail-Dx8_v3Hh.js`: 559.08 kB (156.02 kB gzip)
- `index-BmxFVx7N.js`: 738.17 kB (223.87 kB gzip)
- CSS: 96.40 kB (15.07 kB gzip)

Parking remains inside the already lazy TripDetail chunk and does not increase the home entry chunk through a new top-level import.
