# Agent Invocation Plans

Files under `examples/` are deterministic, non-executing plans for the supported agents and canonical skills. Every plan is schema-validated, read-only, network-disabled, production-disabled, Git-write-disabled, deploy-disabled, and has `execution.enabled` set to `false`.

Generate a plan with `node scripts/ai/agent-adapter.mjs plan <agent> <skill> <arguments>`. The command prints JSON only; it never invokes an agent. Validate all checked-in examples with `npm run ai:invocations:validate`.
