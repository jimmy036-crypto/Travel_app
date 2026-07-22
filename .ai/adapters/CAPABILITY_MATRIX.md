# Agent Capability Matrix

Capabilities below describe the checked-in routing design. They do not claim that an external CLI prompt was executed during Phase AI-2B.

| Capability | Codex | Claude | Gemini |
|---|---|---|---|
| Skill discovery | `.agents/skills` | `.claude/skills` | `.agents/skills` alias |
| Explicit understand invocation | `$understand <topic>` | `/understand <topic>` | `/understand <topic>` |
| Explicit explain-diff invocation | `$explain-diff <base-ref> <head-ref>` | `/explain-diff <base-ref> <head-ref>` | `/explain-diff <base-ref> <head-ref>` |
| Headless mode | argv preview only | argv preview only | argv preview only |
| JSON output | planned | planned | planned |
| Schema-constrained output | schema path supplied | schema path supplied | schema path supplied |
| Read-only mode | planned sandbox | planned permission mode | planned no-write prompt |
| Current AI-2B execution status | plan-only | plan-only | plan-only |
