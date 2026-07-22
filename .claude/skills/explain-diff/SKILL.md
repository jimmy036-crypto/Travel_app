---
name: explain-diff
description: Explicitly invoke the canonical Travel App Explain Diff skill for two user-supplied Git refs.
argument-hint: <base-ref> <head-ref>
disable-model-invocation: true
---

# Explain Diff adapter

Treat `$ARGUMENTS` as the user-supplied base ref and head ref. Read `${CLAUDE_PROJECT_DIR}/.ai/skills/explain-diff/SKILL.md` and `${CLAUDE_PROJECT_DIR}/.ai/skills/explain-diff/OUTPUT_CONTRACT.md`; stop if either file is missing.

Follow the canonical skill and return JSON conforming to `${CLAUDE_PROJECT_DIR}/.ai/schemas/explain-diff.schema.json`.

This adapter grants no deploy, network, credential, production, commit, or push authority. It is not a copy of the canonical workflow.
