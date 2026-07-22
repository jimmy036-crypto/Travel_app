# Agent Entry Point

The `.ai/` directory is the sole source of truth for AI-assisted project work.

Before acting, read these files in order:

1. [Project status](.ai/PROJECT_STATUS.md)
2. [Architecture](.ai/ARCHITECTURE.md)
3. [Decisions](.ai/DECISIONS.md)
4. [Agent rules](.ai/AGENT_RULES.md)
5. [Test matrix](.ai/TEST_MATRIX.md)

Then read the active task under `.ai/tasks/active/` and the applicable role file under `.ai/agents/`. Do not maintain a separate copy of project status or policy in this file.

## Learning skills

Portable understanding skills live under `.ai/skills/`. Read the selected `SKILL.md` before use, conform JSON output to `.ai/schemas/`, and store formal source/rendered documents under `.ai/artifacts/`. Keep skill rules in `.ai/`; provider entry files must not maintain separate versions.

Codex and Gemini discover thin routing adapters under `.agents/skills/`; complete rules remain under `.ai/skills/`. Run `npm run ai:adapters:check` after skill or adapter changes, and never maintain a second complete workflow in an adapter.
