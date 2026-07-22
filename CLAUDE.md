# Claude Repository Guide

Use `.ai/` as the only authoritative source for project context and coordination.

Read, in order:

1. [.ai/PROJECT_STATUS.md](.ai/PROJECT_STATUS.md)
2. [.ai/ARCHITECTURE.md](.ai/ARCHITECTURE.md)
3. [.ai/DECISIONS.md](.ai/DECISIONS.md)
4. [.ai/AGENT_RULES.md](.ai/AGENT_RULES.md)
5. [.ai/TEST_MATRIX.md](.ai/TEST_MATRIX.md)

Continue with the active task and relevant role definition inside `.ai/`. This file intentionally contains no independent project state or rules.

For understanding work, use `.ai/skills/`, read the relevant `SKILL.md`, validate JSON against `.ai/schemas/`, and store formal artifacts in `.ai/artifacts/`. The shared skill rules live only in `.ai/`, not in this file.
