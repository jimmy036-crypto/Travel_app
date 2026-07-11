# App Shell Navigation

## Lobby Actions

- Mobile Lobby header uses a two-level layout: brand and settings on the first row, actions on the second row.
- `建立新旅程` is the primary full-width mobile CTA.
- `匯入旅程` and `自訂外觀` are secondary actions in an equal-width two-column grid.
- Desktop can keep a more horizontal action layout, but action heights and spacing should stay consistent.

## Global Settings Menu

The Lobby and TripDetail share the same settings entry:

- Trigger: `app-settings-trigger`
- Menu: `app-settings-menu`
- Appearance: `app-settings-appearance`
- What's New: `app-settings-release-notes`
- Feature Tour: `app-settings-feature-tour`
- Version: `app-settings-version`

The settings menu closes on outside click, Escape, viewport changes, and route changes. Escape returns focus to the trigger.

## Entry Ownership

- What's New and Feature Tour are opened from the global settings menu.
- The first-run What's New dialog still opens automatically for unseen releases.
- TripDetail keeps its core actions: export, checklist, and collaboration share.
- Lobby keeps direct shortcuts for creating, importing, and appearance customization.

## Itinerary Wheel Rules

- Vertical mouse wheel input must not be converted into horizontal itinerary scrolling.
- Shift + vertical wheel can scroll the itinerary horizontally.
- Dominant horizontal wheel or trackpad input can scroll the itinerary horizontally.
- Mobile touch panning keeps native horizontal itinerary movement and vertical page movement.
- Do not use `scrollLeft += deltaY` or globally block wheel events.
