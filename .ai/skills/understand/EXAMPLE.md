# Understand Example

Invocation:

```text
/understand First Run Welcome
```

Workflow:

1. Resolve and inspect the current source ref.
2. Read `App.jsx`, onboarding state/dialog modules, release configuration, tests, ADRs, and architecture evidence.
3. Write `.ai/artifacts/source/understand-first-run-welcome.json`.
4. Validate and render it to `.ai/artifacts/rendered/understand-first-run-welcome.html`.
5. Run the stale-artifact check.

The guide should explain eligibility, deferred deep links, completion actions, release priority, persistence boundaries, and protected non-effects rather than narrating files from top to bottom.
