# Example Invocation

1. A human creates and validates an import-only session.
2. The CLI emits a deterministic Round 1 packet: `node scripts/ai/discussion.mjs packet <session> round-1 codex-engineer`.
3. The user explicitly invokes `/discuss <packet-path>` in an available agent and saves only its JSON response.
4. The CLI validates and imports the response without overwriting an existing contribution.
5. Round 2 and the Architect proposal repeat the same explicit, read-only process.
6. A human separately records approve, reject, or request-changes. Approval can expose execution-disabled assignment plans; it never starts them.

The checked-in Demo persistence fixture is synthetic test data, not an external Agent execution record.
