# Understand Output Contract

The authoritative structure is `.ai/schemas/understanding-guide.schema.json`.

The source artifact must:

- use `schemaVersion: "1.0"` and `artifactType: "understanding-guide"`;
- identify the exact source ref and generation metadata;
- organize explanation by user behavior, modules, flows, state, data, and boundaries;
- distinguish verified evidence from inference and uncertainty;
- include invariants, non-goals, ADRs, risks, tests, glossary, and unknowns;
- include exactly five quiz questions with valid answer indices, explanations, and evidence references;
- use repository-relative evidence paths and positive inclusive line ranges.

Validate before rendering:

```text
node scripts/ai/learning-artifact.mjs validate <json-file>
node scripts/ai/learning-artifact.mjs render <json-file> <html-file>
node scripts/ai/learning-artifact.mjs check
```

HTML is derived output. Never edit it as the source of truth.
