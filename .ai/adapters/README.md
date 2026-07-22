# Agent Adapters

`.ai/skills/` is the only complete source of truth for Understand and Explain Diff workflows. Provider-facing files only route explicit arguments to those canonical skills:

- `.agents/skills/` is the shared Codex and Gemini discovery layer.
- `.claude/skills/` is the Claude project-skill layer.
- `.gemini/commands/` exposes explicit Gemini slash commands.

Adapters must remain thin and must never contain a full skill copy. After changing a canonical skill, regenerate its manifest hash and run `npm run ai:adapters:check` before committing.

Phase AI-2B validates discovery and produces deterministic plan-only invocation documents. It does not execute an external agent.
