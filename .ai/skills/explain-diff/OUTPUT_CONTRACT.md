# Explain Diff Output Contract

The authoritative structure is `.ai/schemas/explain-diff.schema.json`.

The source artifact must:

- use `schemaVersion: "1.0"` and `artifactType: "explain-diff"`;
- record exact base/head refs and generation metadata;
- explain intent, Before, After, behavioral changes, and concept groups;
- list changed files with responsibility and reason;
- cover state/data changes, compatibility, risks, actual test evidence, rollback, and unknowns;
- include at least one evidence record and exactly five quiz questions;
- use valid evidence references, repository-relative paths, and positive inclusive line ranges.

Validate before rendering:

```text
node scripts/ai/learning-artifact.mjs validate <json-file>
node scripts/ai/learning-artifact.mjs render <json-file> <html-file>
node scripts/ai/learning-artifact.mjs check
```

HTML is deterministic derived output and must not be edited directly.
