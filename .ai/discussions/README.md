# Structured Discussions

Discussions use a fixed, human-controlled sequence: Human Brief, isolated Round 1 analysis, Round 2 cross-review, Architect proposal, Human Approval, then execution-disabled work assignment planning.

Recommended active-session layout:

```text
.ai/discussions/active/<session-id>/
  session.json
  brief/context.json
  packets/round-1/ packets/round-2/ packets/decision/
  responses/round-1/ responses/round-2/
  decision/proposal.json decision/human-approval.json
  assignments/
  audit.json
```

Round 1 packets are isolated and contain no other Agent answer. Round 2 receives immutable Round 1 copies marked as untrusted quoted material and never rewrites them. Architect output is only a proposed decision. Human Approval is a mandatory gate; an assignment after approval is still a non-executing plan, not execution authorization.

Do not place secrets, credentials, production data, or executable instructions in a packet. Never directly trust or execute an Agent response: validate and review it before import. `examples/` contains synthetic fixtures only; `templates/` contains non-operational shapes. No real active session is checked in.
