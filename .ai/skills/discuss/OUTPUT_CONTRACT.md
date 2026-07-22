# Discuss Output Contract

Return exactly one JSON artifact for the packet round:

| Packet round | Artifact type | Schema |
|---|---|---|
| `round-1` | `discussion-analysis` | `.ai/schemas/discussion-analysis.schema.json` |
| `round-2` | `discussion-critique` | `.ai/schemas/discussion-critique.schema.json` |
| `decision` | `discussion-decision` | `.ai/schemas/discussion-decision.schema.json` |

Use the packet `sessionId` and participant identity exactly. Evidence paths must be repository-relative and safe. Round 1 must not contain references to other contributions. Round 2 may reference only Round 1 IDs present in the packet. Architect output must remain `proposed`; it cannot supply human approval or execution authority.

Do not wrap JSON in Markdown, append commentary, or include executable command fields.
