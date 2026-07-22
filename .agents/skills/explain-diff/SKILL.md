---
name: explain-diff
description: Route an explicit request to explain two Travel App Git refs to the canonical, evidence-backed Explain Diff skill.
---

# Explain Diff adapter

Read `.ai/skills/explain-diff/SKILL.md` before doing any analysis. Stop if it is missing; do not reconstruct or guess its workflow.

Read `.ai/skills/explain-diff/OUTPUT_CONTRACT.md` and follow the canonical skill completely. The current user request must supply a base ref and a head ref; stop if either is absent.

Return JSON conforming to `.ai/schemas/explain-diff.schema.json`. This adapter is routing metadata only and does not authorize commit, push, deploy, credential access, or production access.
