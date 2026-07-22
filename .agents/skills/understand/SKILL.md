---
name: understand
description: Route an explicit request to explain an existing Travel App feature to the canonical, evidence-backed Understand skill.
---

# Understand adapter

Read `.ai/skills/understand/SKILL.md` before doing any analysis. Stop if it is missing; do not reconstruct or guess its workflow.

Read `.ai/skills/understand/OUTPUT_CONTRACT.md` and follow the canonical skill completely. Treat the topic in the current user request as the skill input.

Return JSON conforming to `.ai/schemas/understanding-guide.schema.json`. This adapter is routing metadata only and does not authorize commit, push, deploy, credential access, or production access.
