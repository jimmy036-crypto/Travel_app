# AI Project Changelog

Record important AI-governance changes and decisions. Product release notes remain in the product release system.

## 2026-07-22 — AI Project OS Foundation

- Established `.ai/` as the single source of truth for project status, architecture, roadmap, ADRs, risks, roles, test strategy, active tasks, and machine-readable schemas.
- Added six bounded agent roles with explicit permissions and handoff expectations.
- Recorded the existing Demo, Offline Preview, Clone Flow, and FeatureTour decisions as ADRs.
- Added shared schemas for agent responses, tasks, and decisions without adding SDKs, MCP configuration, CI, or production code.
- Kept provider-specific root files as navigation only so they cannot drift into separate project histories.
