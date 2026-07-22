---
name: understand
description: Explicitly invoke the canonical Travel App Understand skill for an evidence-backed feature guide.
argument-hint: <topic>
disable-model-invocation: true
---

# Understand adapter

Treat `$ARGUMENTS` as the user-supplied topic. Read `${CLAUDE_PROJECT_DIR}/.ai/skills/understand/SKILL.md` and `${CLAUDE_PROJECT_DIR}/.ai/skills/understand/OUTPUT_CONTRACT.md`; stop if either file is missing.

Follow the canonical skill and return JSON conforming to `${CLAUDE_PROJECT_DIR}/.ai/schemas/understanding-guide.schema.json`.

This adapter grants no deploy, network, credential, production, commit, or push authority. It is not a copy of the canonical workflow.
