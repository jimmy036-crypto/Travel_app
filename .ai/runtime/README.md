# Controlled Live Runner Runtime

The committed policy is always disabled. It describes immutable provider, skill, permission, timeout, output, and import boundaries; it is not execution authorization.

A future live run requires a human to create `.ai/runtime/local/policy.json` from the template in an ordinary PowerShell session and explicitly enable that local-only policy. Local policies, plans, approvals, raw model output, and `.ai/runs/` results never enter Git. Approvals expire, bind to one plan hash, and do not authorize repository modification.

The runner never reads credential files. An installed CLI may use its existing login state, but packets must contain no secrets and runtime logs must not record environment values. A result is only a review candidate: a human must inspect it before any separate Discussion ingest. Never launch live execution from Codex, Claude, Gemini, or another Agent-managed session.

Committed examples are synthetic, disabled teaching artifacts. They are not evidence that a live Agent ran.
