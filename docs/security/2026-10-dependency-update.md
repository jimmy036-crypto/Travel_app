# October 2026 dependency security update

## Scope

Updates only the root and Functions dependency manifests/locks. No application
logic, Firebase rules/configuration, data models, CI workflows, or deployment
settings are changed. This change does not deploy the website, Functions, or iOS
application.

- Pin Capacitor core, iOS and CLI to 8.4.3, the first patched 8.4 release for
  [GHSA-rvm3-566m-v7fv](https://github.com/advisories/GHSA-rvm3-566m-v7fv).
  Keeping the trio on this patch avoids the new vulnerable xcode/uuid dependency
  introduced by CLI 8.5.3. Reassess that dependency before updating this pin.
- Raise Vite and Vitest/coverage minimums to 7.3.7 and 4.1.12 respectively.
- Update Firebase CLI to 15.34.1 and Functions firebase-admin to 14.5.0,
  within their existing major versions. Preserve firebase-functions 7.3.2.
- Refresh compatible vulnerable transitive dependencies, including proxy-addr
  2.0.8, undici, shell-quote, xmldom, brace-expansion and qs.

## Temporary Firestore override

Firebase JS 12.19.0 still requests `@grpc/grpc-js ~1.9.0`. Its available resolution
is affected by GHSA-m9gg-hp2v-232j and GHSA-f596-whhp-79r4. The override is scoped
to `@firebase/firestore` and selects the patched 1.13.6 release, preserving the
same grpc major. It does not override unrelated grpc consumers. Remove it once
the Firebase SDK itself requests a patched grpc version and verify both the
full/production audit and emulator tests again. Do not use the npm audit proposal
to downgrade Firebase to 9.x.

## Remaining development-tool findings

The remaining npm audit findings are in Firebase CLI's development-only graph:

- braces 3.0.3 via chokidar: GHSA-vfj7-8cjw-p6xm. No patched braces release was
  available in the registry at verification time.
- OpenTelemetry core 1.30.1 via Google Cloud Pub/Sub: GHSA-8988-4f7v-96qf.
  A patched core requires leaving the consumer's declared major range.
- uuid 9.0.1 via gaxios: GHSA-w5hq-g745-h8pq. A patched uuid requires leaving
  the consumer's declared major range.

Do not force incompatible overrides or downgrade the Firebase CLI merely to
silence the audit. Keep developer/emulator services local, avoid untrusted
projects/input, and revisit when upstream publishes compatible fixes. These
findings are not claims of an exploitable production web bundle.

## Runtime and release boundaries

Local verification uses Node 22.23.4, patched for the October 21 Node security
release. CI retains its existing floating Node 22 selector; inspect each run's
setup logs rather than assuming the selected patch. Firebase Functions keeps
`engines.node: 22`; its actual managed runtime patch is controlled by the hosting
platform and is not established by a package-lock change. Vercel's build Node
runtime and any active deployment also require separate verification.

An already shipped iOS binary is not repaired by updating npm or redeploying the
website: rebuild/sync the native project and ship a reviewed native release.
This repository does not contain an iOS native project, and Linux verification
cannot replace Xcode/device acceptance.

Human review and merge are required. Production deployment and native release
remain separate approval gates. Roll back by reverting the dependency update
commit; no data migration or data rollback is involved.
