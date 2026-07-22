# Explain Diff Example

Invocation:

```text
/explain-diff 92ef883 c847650
```

Workflow:

1. Verify both refs exactly.
2. Inspect diff stat, name status, relevant patch, base architecture, and complete head implementation.
3. Write `.ai/artifacts/source/explain-diff-first-run-welcome.json`.
4. Validate and render it to `.ai/artifacts/rendered/explain-diff-first-run-welcome.html`.
5. Run the stale-artifact check.

The explanation should group eligibility, dialog, App coordination, persistence, release priority, and test coverage as concepts rather than repeat each changed line.
