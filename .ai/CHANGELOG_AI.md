# AI Project Changelog

Record important AI-governance changes and decisions. Product release notes remain in the product release system.

## 2026-07-22 — AI Project OS Foundation

- Established `.ai/` as the single source of truth for project status, architecture, roadmap, ADRs, risks, roles, test strategy, active tasks, and machine-readable schemas.
- Added six bounded agent roles with explicit permissions and handoff expectations.
- Recorded the existing Demo, Offline Preview, Clone Flow, and FeatureTour decisions as ADRs.
- Added shared schemas for agent responses, tasks, and decisions without adding SDKs, MCP configuration, CI, or production code.
- Kept provider-specific root files as navigation only so they cannot drift into separate project histories.

## Phase AI-1.1 — AI Project OS Alignment

- The original AI Project OS branch was based on `main`.
- A clean integration worktree was created from `feature/first-run-guided-demo`.
- The AI Project OS foundation commit was cherry-picked.
- Existing untracked files in the original worktree were left untouched.
- No production source code changed.
- No product behavior changed.
- No deployment was performed.
- No branch history was rewritten.

## Phase AI-2A — Understanding Skills

- Added a tool-agnostic Understand Skill.
- Added a tool-agnostic Explain Diff Skill.
- Added structured understanding-guide and explain-diff schemas.
- Added a deterministic, self-contained offline HTML renderer using only Node.js built-ins.
- Added quiz behavior, semantic validation, security escaping, and stale-artifact detection.
- Added the first real First-run Welcome understanding and diff artifacts.
- No product behavior changed.
- No deployment was performed.

## Phase AI-2B - Agent Adapters and Invocation Workflow

- Added shared Codex/Gemini skill adapters.
- Added Claude project skill adapters.
- Added Gemini slash-command adapters.
- Added an adapter manifest with computed canonical hashes.
- Added an invocation schema and six plan-only examples.
- Added a deterministic plan-only invocation generator.
- Added a redacted CLI availability doctor.
- No external Agent prompt was executed.
- No product behavior changed.
- No deployment was performed.
