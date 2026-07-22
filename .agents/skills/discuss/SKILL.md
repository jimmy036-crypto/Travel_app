---
name: discuss
description: Route an explicit participant packet to the canonical, import-only Travel App discussion skill.
---

# Discuss adapter

Read `.ai/skills/discuss/SKILL.md` and `.ai/skills/discuss/OUTPUT_CONTRACT.md` before responding. Stop if either canonical file is missing; do not reconstruct its workflow.

Treat the session packet path in the current user request as input. Return only JSON conforming to the output schema declared by that validated packet.

This routing adapter grants no repository write, external Agent execution, approval, implementation, credential, production, commit, push, or deploy authority.
