# Claude Adapter

Claude project skills live under `.claude/skills/` and are invoked explicitly by the user with `/understand` or `/explain-diff`. Complete workflows remain under `.ai/skills/`. Phase AI-2B does not run `claude -p`.

Future automation must use plan or read-only permissions. It must not use `dangerously-skip-permissions`, read credentials, or enable production writes.
