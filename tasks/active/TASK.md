# Task: protected PDF preview MIME

## Scope

Restore allowlisted attachment record MIME (or authenticated Storage metadata when absent) after the SDK's
size-capped Blob download. Preserve private reads, size cap, URL cache, concurrent
read deduplication and disposal. No schema, rules, dependencies or deployments.

## Acceptance criteria

- PDF object URLs use application/pdf and preserve all bytes, including existing attachments.
- Images retain their supported MIME; unsupported MIME cannot become active HTML.
- Failed reads produce no URL and can retry; disposal prevents late URLs.
- Real emulator PDF upload/reload/open/delete works in Desktop Chrome and Mobile Safari.

## Tests

- firebaseTripRepository unit regression (red before fix).
- ticket-storage.spec.ts and place-storage.spec.ts via Firebase Emulator.
- verify:fast and git diff --check before commit.
- Manual: real iPhone Safari/PWA PDF rendering after Preview deployment.

## Rollback

Revert this change; no Firebase data migration or backend deployment.
