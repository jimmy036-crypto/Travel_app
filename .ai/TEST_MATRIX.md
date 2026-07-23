# Test Matrix

## Test Layers

| Layer | Tool | Purpose | Typical command | Required when |
|---|---|---|---|---|
| Unit | Vitest | Pure models, calculations, storage adapters, and controllers | `npm run test:run -- <files>` | Domain logic or helpers change |
| Component | Vitest + Testing Library | Rendering, callbacks, accessibility, and local interaction | `npm run test:run -- <component tests>` | Components or UI contracts change |
| Integration | Vitest + mocks | App/Trip coordination, persistence ordering, and view exclusion | `npm run test:run -- <integration tests>` | Cross-component state flow changes |
| Browser E2E | Playwright | Real user flows against Firebase Emulator | `npm run test:e2e -- <spec>` | Cross-page, Firebase, realtime, Storage, drag, or mobile flow changes |
| Fast gate | Project verifier | Typecheck, lint, Vitest, and production build | `npm run agent:verify` | Before every implementation commit |
| Full gate | Project verifier | Fast gate plus full Playwright matrix | `npm run agent:verify:all` | Shared E2E/config changes, major release, or explicit task requirement |

## Playwright Projects

### Desktop Chrome

- Primary desktop interaction and layout project.
- Covers keyboard/mouse flows, new windows/anchors without third-party navigation, realtime contexts, and Emulator persistence.

### Mobile Safari

- Mobile viewport and WebKit behavior proxy.
- Covers safe-area layouts, scrolling, touch-sized controls, modal sheets, horizontal overflow, and interaction interception.
- Does not replace physical iPhone/PWA validation.

## Regression Suites

- **Lobby/App Shell:** home, settings, release notes, tour, empty states, skeletons.
- **Trip:** place CRUD, itinerary drag, checklist and realtime room updates.
- **Expenses:** creation, editing, deletion, split conservation, and settlement rendering.
- **Tickets/Storage:** canonical tickets, external-app behavior, attachment lifecycle, validation, failures, and legacy compatibility.
- **Offline/PWA:** awareness, read-only preview, cache lifecycle, install/update behavior.
- **Infrastructure:** Emulator smoke, Firebase namespace, shared helpers, and full multi-project execution.

## Smoke Strategy

Smoke tests prove that the App loads, uses the Emulator namespace, opens the key changed flow, and leaves no unexpected data. They do not substitute for targeted assertions or regression suites.

## Evidence Rules

- Record the exact command, project, pass/fail counts, and commit under test.
- A skipped test is not a passed test; explain conditional skips.
- Do not use `test.only`, force click, arbitrary sleeps, assertion weakening, or production services.
- Preserve failure artifacts only while diagnosing; do not commit reports, traces, screenshots, or coverage output.

## AI Learning Artifact Validation

| Check | Evidence | Required behavior |
|---|---|---|
| Schema parsing | JSON parse gate for all `.ai/schemas/*.json` | Draft 2020-12 schemas remain valid JSON |
| Semantic validation | `npm run ai:artifacts:validate` | Required fields, exact five-question quiz, evidence IDs, line ranges, refs, and safe paths pass |
| Security escaping | `npm run ai:artifacts:test` | Artifact text is escaped and cannot create script, event handler, iframe, object, embed, or remote resource execution |
| Deterministic rendering | `npm run ai:artifacts:test` | Identical validated JSON produces byte-identical HTML using `generatedAt` only |
| Stale artifact detection | `npm run ai:artifacts:check` | Missing or outdated rendered HTML fails without rewriting files |
| Offline HTML | Node tests plus local browser inspection | No CDN, remote font/image, fetch, storage write, or network dependency |
| Quiz behavior | Node tests plus local browser inspection | Exactly five questions can be scored; explanations display without persistence |

## AI Agent Adapter Validation

| Check | Evidence | Required behavior |
|---|---|---|
| Canonical hash freshness | `npm run ai:adapters:check` | Manifest SHA-256 values match canonical skill bytes |
| Thin-adapter validation | Adapter Node tests and check | Line limits, required metadata, canonical references, and duplication limits pass |
| Agent discovery layout | Adapter check | Shared, Claude, and Gemini entry files exist as regular files at declared paths |
| Gemini command safety | Adapter Node tests | TOML has only description/prompt and rejects shell or file injection forms |
| Invocation schema | Schema parse plus `npm run ai:invocations:validate` | All examples remain additional-property-free, plan-only documents |
| Argument sanitization | Adapter Node tests | Empty topics and unsafe Git refs fail before an argv preview is produced |
| Read-only permission planning | Adapter Node tests | Filesystem is read-only; network, production Firebase, Git writes, deploy, and execution are false |
| CLI doctor redaction | Injected-spawn Node tests | Missing CLIs are non-fatal and output contains no environment, credential, or auth paths |
| Deterministic invocation plans | Adapter Node tests | Identical inputs produce identical structured argv arrays and output paths |

## Structured Discussion Protocol Validation

| Check | Evidence | Required behavior |
|---|---|---|
| Round isolation | Discussion Node tests | Round 1 packets contain no other contribution; Round 2 contains no peer Round 2 output |
| Contribution identity | Validator and state tests | IDs are unique and participant agent/role match the session |
| Cross-review references | State-machine tests | Every reviewed ID resolves to an immutable Round 1 contribution |
| State transition validation | Discussion check | Later rounds cannot open until required earlier contributions exist |
| Human approval gate | Approval/assignment tests | Only a human action can permit assignment planning |
| Assignment path ownership | Assignment-set tests | Concurrent implementation plans cannot own overlapping paths |
| Prompt injection boundary | Packet and adapter tests | Quoted responses are untrusted and Gemini injection syntax is rejected |
| Immutable response ingest | Temporary-session tests | Existing response IDs/files cannot be overwritten and writes remain under responses |
| Synthetic fixture labelling | Fixture check | Every fixture JSON declares `fixture: true` and `source: synthetic-test-fixture` |
| Deterministic packets | Repeated generation tests | Identical session state produces byte-equivalent packet/audit data |
| Execution-disabled enforcement | Schema, packet, invocation, and assignment tests | External Agent execution and all write/deploy permissions remain false |
| Human-reviewed ingest | Candidate/source comparison, Session status, and deterministic audit checks | Explicit reviewed-ingest scope records the unchanged contribution, advances only Round 1, and creates no Decision, decision approval, or Assignment |
| Round-specific participation | Session validation, state-machine, ingest, packet, and status tests | Optional per-round participant sets remain backward compatible, isolate Round completion, exclude the final approver, and preserve disabled execution |
| Human Round 2 reviewed ingest | Critique source/target comparison, Session status, immutable Round 1/packet hashes, and deterministic audit checks | Explicit approval records the unchanged critique, advances only Round 2, and creates no Decision, decision-level action, or Assignment |
| Architect Decision proposal | Proposal/schema validation, deterministic packet/audit checks, exact Session tests, and immutable reviewed-round hashes | Proposed-only synthesis quotes both rounds as untrusted, remains pending Human Approval, creates no Assignment, and keeps execution disabled |

## Controlled Live Runner Validation

| Check | Evidence | Required behavior |
|---|---|---|
| Disabled policy | Runner schemas, examples, and check | Committed execution stays false; only Codex is allowlisted |
| Plan and approval binding | Runner Node tests | Stable plan IDs, content hashes, exact phrases, expiry, and single use are enforced |
| Nested execution guard | Runner Node tests | Known Codex, Claude, and Gemini managed environments block execute without bypass |
| Capability detection | Injected doctor tests | Required Codex flags are detected; Claude and Gemini remain ineligible |
| Subprocess boundary | Mock subprocess tests | `spawn`, `shell:false`, separate argv/stdin, timeouts, byte limits, and stdout/stderr isolation |
| Secret handling | Redaction and output-scan tests | Secret-named environment entries are removed without values; suspicious output blocks import eligibility |
| Result review | Result and inspect tests | Structured candidates are validated and remain `not-reviewed`; no automatic ingest occurs |
| Local-only artifacts | Prepare/approval/run tests | Plans, approvals, used markers, and raw output remain under ignored local directories |
| Two-phase Approval lifecycle | Runner claim/spawn/concurrency tests | `wx` permits one claim; used marker appears only after `spawn`; disabled/nested execution creates no claim |
| Durable launch attempts | Runner launch-failure/timeout/truncation tests | Run skeleton exists before spawn and every terminal outcome retains inspectable local artifacts |
| Deterministic retry identity | Runner attempt tests | Same packet/attempt is deterministic; a different valid attempt label changes Plan ID and SHA-256 |
| Read-only recovery status | Runner status tests | Status reports approvals, claims, complete/incomplete runs, legacy orphan state, and a bounded next action without writes |
| Read-only failure diagnosis | Runner diagnose tests | JSONL counts and structured error evidence are summarized without writes, raw output, sensitive values, or automatic actions |
| Exit-1 classification | Runner classification tests | Schema, authentication, quota, provider, repository-trust, and unknown failures map only from explicit evidence to bounded next actions |
| Codex schema compatibility | Recursive Runner schema tests and `ai:runner:check` | Transport schemas reject lookaround, backreferences, remote/unresolved refs, unsupported formats/keywords, and incomplete strict object declarations before a live run |
| Transport/canonical boundary | Plan/hash and candidate tests | Plans bind both schema layers; Codex receives the transport schema while every candidate still passes canonical Discussion and repository-path validation |
| Codex JSONL Candidate recovery | Runner extraction and recovery tests | Only terminal final-agent-message text is eligible; offline recovery preserves the source Run, validates canonical identity, separates secret scopes, never ingests, and refuses overwrite |

## Phase AI-3B2B-R2I Evidence

- The active Session is `decision-proposed`; both rounds remain complete with their sole unchanged contributions, Decision is `proposed`, Human Approval is pending, Assignments are empty, and execution is disabled.
- `clone-demo-architecture-proposal` validates as a proposed-only `discussion-decision` by `codex-architect`, requires Human Approval, and has no proposed Assignments.
- The deterministic Architect packet includes one Round 1 and one Round 2 contribution, each marked untrusted with instruction execution disabled; filesystem writes, network, production Firebase, Git writes, deployment, and execution are all disabled.
- Repeated `buildAudit` output is deterministic and matches `audit.json` with `round-1-recorded`, `round-2-recorded`, and `decision-proposed` in order.
- Three exact active-Session expectations were updated for the Proposal state, proposal path, Architect identity, empty proposed Assignments, and three-event audit; no test was skipped or weakened.
- `npm run ai:discussion:test`: 77 passed; check and validate passed for 21 artifacts, 1 synthetic fixture, and 1 active Session.
- `npm run ai:runner:test`: 165 passed; Runner check and validate passed for 4 disabled artifacts.
- `npm run ai:adapters:test`: 40 passed; adapter check passed and 9 invocation examples validated.
- `npm run ai:artifacts:test`: 19 passed; 2 rendered artifacts checked and 2 source artifacts validated.
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm run agent:guardrails`, and `npm run agent:verify`: passed; verify included 43 Vitest files / 652 tests.
- `git diff --check` passed and `package-lock.json` is unchanged. Playwright and Firebase Emulator were not run, as required.
- Round 1, Round 2, all review records, and the Human Round 2 packet remained unchanged. No live nested Agent executed, no product code or Firebase Rules changed, no production Firebase was accessed, and no deployment occurred.

## Phase AI-3B2B-R2H Evidence

- Human explicitly approved `批准 Round 2 critique` for `human-clone-flow-critique` ingest only; no product, implementation, Decision, decision-level action, Assignment, Firebase, or deployment approval was granted.
- The local source validated as `discussion-critique` for `clone-demo-architecture-pilot` / `human-reviewer`, reviewing only `codex-clone-flow-analysis`, with confidence `0.9`.
- Source and tracked target SHA-256 are `be8f454f53da948fdee5ba9b2dc765b40c1d526c0f92c1de0c9acd1c44edf9b9`. Parsed JSON and all required Critique collections are exactly equal.
- Session validation reports `round-2-complete`, exactly one contribution in each Round, `not-proposed` Decision, pending decision-level human approval, empty Assignments, and execution disabled.
- Repeated `buildAudit` output is deterministic and matches `audit.json` with only `round-1-recorded` followed by `round-2-recorded`.
- Exactly two legacy active-Session assertions were updated from `round-2-ready`/single-event expectations to the exact R2H state; no test logic was skipped or weakened.
- `npm run ai:discussion:test`: 77 passed; check and validate passed for 20 artifacts, 1 synthetic fixture, and 1 active Session.
- `npm run ai:runner:test`: 165 passed; Runner check and validate passed for 4 disabled artifacts.
- `npm run ai:adapters:test`: 40 passed; adapter check passed and 9 invocation examples validated.
- `npm run ai:artifacts:test`: 19 passed; 2 rendered artifacts checked and 2 source artifacts validated.
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm run agent:guardrails`, and `npm run agent:verify`: passed; verify included 43 Vitest files / 652 tests.
- `git diff --check` passed and `package-lock.json` is unchanged. Playwright was not run, as required.
- Round 1, its review record, the Round 2 reviewer-selection record, and Round 2 packet hashes remained unchanged. No live Agent executed, no product code or Firebase Rules changed, no production Firebase was accessed, and no deployment occurred.

## Phase AI-3B2B-R2G Evidence

- The optional `roundRequirements` schema and validator preserve legacy Sessions without the field while resolving deterministic, independent Round 1 and Round 2 participant sets when present.
- Validator coverage rejects unknown, duplicate, empty, unavailable, write-enabled, uncovered required, and approver-overlapping Round participants. Completion, ingest, packet generation, and status all use the applicable Round set.
- The active Session is `round-2-ready`: Round 1 remains complete with only unchanged `codex-clone-flow-analysis`; Round 2 requires only `human-reviewer`, is incomplete, and has no contribution.
- `human-reviewer` is distinct from both Round 1 author `codex-engineer` and final decision approver `human-approver`.
- The checked-in Human Round 2 packet deterministically matches `buildPacket`, includes one untrusted/execute-disabled Round 1 contribution, and disables filesystem writes, network, production Firebase, Git writes, deployment, and execution.
- The deterministic audit still contains only `round-1-recorded` for `codex-clone-flow-analysis`; no Round 2 response, Decision, decision approval, or Assignment exists.
- `npm run ai:discussion:test`: 77 passed; Discussion check and validation passed.
- `npm run ai:runner:test`: 165 passed; Runner check and validation passed for disabled local policy artifacts.
- `npm run ai:adapters:test`: 40 passed; adapter check passed and invocation examples validated.
- `npm run ai:artifacts:test`: 19 passed; rendered artifacts checked and source artifacts validated.
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm run agent:guardrails`, and `npm run agent:verify`: passed; verify included 43 Vitest files / 652 tests.
- `git diff --check` passed and `package-lock.json` is unchanged. Playwright was not run, as required.
- Round 1 response and reviewed-ingest record hashes remained unchanged. No live Agent executed, no product code or Firebase Rules changed, no production Firebase was accessed, and no deployment occurred.

## Phase AI-3B2B-R2F Evidence

- Human explicitly approved `APPROVE_FOR_REVIEWED_INGEST` for contribution ingest only; no product, implementation, Decision, Assignment, Firebase, or deployment approval was granted.
- The recovered Candidate validated as `discussion-analysis` for `clone-demo-architecture-pilot` / `codex-clone-flow-analysis`. Parsed source and tracked target JSON are exactly equal, all required content collections retain their source lengths, and confidence remains `0.92`.
- The reviewed-ingest record binds Candidate SHA-256 `96dca94f94139cb99013f039b8bf1a8c68e237e92e47bf3a38a04e8e77db2abc` and Recovery Result SHA-256 `b62da930d1f5afd8cb6042c9ff8b53cacc9d5d60db7ec6cac233d6bcb11ae3d7` without reproducing Candidate or Transcript content.
- Session validation reports `round-1-complete`, exactly one Round 1 contribution, empty Round 2, `not-proposed` Decision, pending decision-level human approval, empty Assignments, and execution disabled. The deterministic audit contains only `round-1-recorded`.
- `npm run ai:discussion:test`: 56 passed; check and validate passed for 19 artifacts, 1 synthetic fixture, and 1 active Session.
- `npm run ai:runner:test`: 165 passed; Runner check and validate passed for 4 disabled artifacts.
- `npm run ai:adapters:test`: 40 passed; adapter check passed and 9 invocation examples validated.
- `npm run ai:artifacts:test`: 19 passed; 2 rendered artifacts checked and 2 source artifacts validated.
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm run agent:guardrails`, and `npm run agent:verify`: passed; verify included 43 Vitest files / 652 tests.
- `git diff --check` passed and `package-lock.json` is unchanged. Playwright was not run, as required.
- The source Run and local recovery artifacts remained unchanged. Candidate content was not edited; no live Agent executed, no product code or Firebase Rules changed, no production Firebase was accessed, and no deployment occurred.

## Phase AI-3B2B-R2E Evidence

- `npm run ai:runner:test`: 165 passed; all external Agent subprocess behavior is mocked, terminal JSONL extraction and offline recovery are covered, and no Codex prompt starts.
- `npm run ai:runner:check` / `npm run ai:runner:validate`: 4 disabled Runner artifacts checked and validated; committed execution policy remains disabled and nested execution guards remain covered.
- `npm run ai:discussion:test`: 56 passed; check and validate passed for 18 artifacts, 1 synthetic fixture, and 1 active Session.
- `npm run ai:adapters:test`: 40 passed; adapter check passed and 9 invocation examples validated.
- `npm run ai:artifacts:test`: 19 passed; 2 rendered artifacts checked and 2 source artifacts validated.
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm run agent:guardrails`, and `npm run agent:verify`: passed; verify included 43 Vitest files / 652 tests.
- `git diff --check` passed and `package-lock.json` is unchanged. Playwright was not run, as required.
- retry-2 completed with exit code `0`, no timeout or truncation. The original parser missed nested terminal `item.completed` / `agent_message` text; offline recovery passed canonical, session, participant, round, and bound-hash validation.
- Candidate findings were empty. Three Transcript `secret-assignment` findings were classified without matched values as 2 likely code examples and 1 likely fixture. The recovered Candidate is eligible for human review.
- The source Run remained immutable; no new Agent prompt ran, no Approval was created, no response was ingested, no product behavior changed, and no deployment occurred.

## Phase AI-3B2B-R2C Evidence

- `npm run ai:runner:test`: 135 passed; all external Agent subprocess behavior is mocked and no Codex prompt starts.
- `npm run ai:runner:check` / `npm run ai:runner:validate`: 4 disabled Runner artifacts checked and validated; the registered Codex transport schema passed compatibility validation.
- `npm run ai:discussion:test`: 56 passed; check and validate passed for 18 artifacts, 1 synthetic fixture, and 1 active Session.
- `npm run ai:adapters:test`: 40 passed; adapter check passed and 9 invocation examples validated.
- `npm run ai:artifacts:test`: 19 passed; 2 rendered artifacts checked and 2 source artifacts validated.
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm run agent:guardrails`, and `npm run agent:verify`: passed; verify included 43 Vitest files / 652 tests.
- `git diff --check`: passed; `package-lock.json` is unchanged. Playwright was not run, as required.
- The preserved retry-1 Run was diagnosed as `OUTPUT_SCHEMA_REJECTED` for unsupported lookaround. Its Approval remains consumed, its candidate was null, and no response was ingested.
- The local retry-2 Plan is execution-disabled and has no Approval, claim, or matching Run. No live Agent was executed.

## Phase AI-3B2B-R2B Evidence

- `npm run ai:runner:test`: 110 passed; all Codex subprocess behavior is mocked and no Agent prompt starts.
- `npm run ai:runner:check` / `npm run ai:runner:validate`: 4 disabled Runner artifacts checked and validated.
- `npm run ai:discussion:test`: 56 passed; check and validate passed for 18 artifacts, 1 synthetic fixture, and 1 active Session.
- `npm run ai:adapters:test`: 40 passed; adapter check passed and 9 invocation examples validated.
- `npm run ai:artifacts:test`: 19 passed; 2 rendered artifacts checked and 2 source artifacts validated.
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm run agent:guardrails`, and `npm run agent:verify`: passed; verify included 43 Vitest files / 652 tests.
- `git diff --check`: passed; `package-lock.json` is unchanged. Playwright was not run, as required.
- The initial Run was diagnosed as `OUTPUT_SCHEMA_REJECTED`; the old Approval and Run remain preserved, no response was ingested, and no live Agent was executed.

## Phase AI-3B2B-R1 Evidence

- `npm run ai:runner:test`: 89 passed; all subprocess behavior is mocked and no Codex prompt starts.
- `npm run ai:runner:check` / `npm run ai:runner:validate`: 4 disabled Runner artifacts checked and validated.
- `npm run ai:discussion:test`: 56 passed; check and validate passed for 18 artifacts, 1 synthetic fixture, and 1 active Session.
- `npm run ai:adapters:test`: 40 passed; adapter check passed and 9 invocation examples validated.
- `npm run ai:artifacts:test`: 19 passed; 2 rendered artifacts checked and 2 source artifacts validated.
- `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run agent:guardrails`: passed.
- `npm run agent:verify`: one complete run passed 43 Vitest files / 652 tests and the production build. Later repetition exposed the existing timing-sensitive `DIALOG-07` focus test; its isolated 12-test file and a standalone full 652-test Vitest rerun both passed. No out-of-scope product/test change was made.
- `git diff --check`: passed; `package-lock.json` is unchanged.
- Playwright was not run, as required by the recovery task.
