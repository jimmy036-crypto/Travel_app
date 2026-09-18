# T5C Manual QA: only non-automatable PWA checks

Use a disposable synthetic trip in an approved test environment. Do not use
production Firebase, a real trip, a real ticket, or personal data.

## iPhone Safari installed PWA

| Environment | Steps | Expected evidence |
| --- | --- | --- |
| Physical iPhone Safari | Open the approved test build, use Safari Share → Add to Home Screen, then launch the installed app. | Screenshot/video showing the installed app opens, the four-entry navigation remains usable, and no update prompt prevents the initial install flow. |
| Physical iPhone, installed app | With an already cached synthetic trip, turn on Airplane Mode, reopen it, then return online. | Record whether cached content is clearly identified and read-only restrictions remain honest; record any error, rather than calling it synced. |
| Two distinct approved test builds on the same device | Install build A; deploy neither from this task. When an authorized owner supplies build B, revisit build A and accept the update prompt. | Version/build IDs before and after, plus whether the app updates only after the explicit action and does not interrupt an active edit. |

These checks are intentionally not represented by Playwright WebKit emulation.
They do not re-request T5A's already accepted soft-keyboard, select, VoiceOver,
safe-area, or rotation review unless an authorized PWA-flow change is made.
