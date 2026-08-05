# Post-release Trip UX corrections

## Example Trip lifecycle and template update

The lobby visibility preference is device-local (`travel-app-example-trip-visibility-v1`).
Removing the Example Trip clears only its IndexedDB trip record and local attachments, then hides
the lobby card. Restoring it initializes the current immutable template. Neither action writes a
Firebase room, Storage object, `myTrips`, or Offline Trip Cache entry.

Template `2.0.0` uses a non-destructive migration from `1.0.0`. The migration:

- adds only missing canonical coordinate fields to matching demo places;
- changes only the canonical demo route legs from the former `DEMO` mode to `AUTO`;
- appends missing canonical pre-trip example expenses;
- preserves edited fields, user-created items, and user deletions.

Unknown but structurally valid template versions are preserved and reported as update-available
instead of being overwritten.

The static route coordinates used by Day 2 are sourced from the corresponding Wikidata entities:

- Meiji Jingu: <https://www.wikidata.org/wiki/Q287165>
- Harajuku Station: <https://www.wikidata.org/wiki/Q800894>
- Shibuya Crossing: <https://www.wikidata.org/wiki/Q21083961>
- Tokyo Tower: <https://www.wikidata.org/wiki/Q183536>

The example intentionally keeps fixed endpoints and places the middle stops in a non-optimal order.
The existing Google Routes optimizer remains responsible for verified duration, distance, and
waypoint order. The app does not fabricate these results when Maps is unavailable.

## Scoped settlement compatibility

New paid settlement records carry `scope: "pretrip"` or `scope: "intrip"`. Scope is included in the
exact transfer key, so equal payer, recipient, currency, and amount values in the two scopes do not
collide. `all` is presentation-only and is never persisted.

Existing unscoped records remain readable without a destructive migration. A legacy record affects
a remaining balance only when its payer, recipient, currency, and amount exactly match one and only
one current scoped suggestion. A record matching both scopes or neither scope remains visible as
legacy history and does not reduce either scope. If expenses later change, the old completed record
is retained for audit but no longer completes the newly calculated amount.

Remaining balances are calculated from original expense balances minus only current, exact, scoped
paid records. The original expense-derived balances remain available under `原始分帳結果`.
Pre-trip and in-trip balances are summed for the `全部` summary but are never netted against each
other.

## Destination autocomplete evidence

The focused event diagnostic recorded:

1. option pointer start;
2. input blur;
3. option click;
4. Places `getDetails` start;
5. the single text-and-coordinate update;
6. `getDetails` callback completion.

Automation did not reproduce a swallowed first click, so selection remains on semantic `click`
instead of moving to `pointerdown`. The control now supplies combobox/listbox semantics, keyboard
selection, visible loading and recoverable error feedback, duplicate-selection protection, and
stale callback rejection. A physical Mobile Safari first-tap check remains required because the
reported device-only cause was not reproduced in automation.

## Remaining UI corrections

- Trip appearance now opens the shared accessible appearance dialog and persists through the
  existing trip metadata repository branch.
- Desktop day navigation is independent of the horizontally scrolling day-card viewport and uses
  nearest-card scrolling.
- Generated print previews keep `window.opener = null` and include a non-printing return control.
  The return URL is HTML-attribute escaped, close is attempted first, and the preview navigates back
  only if the browser refuses to close it.
