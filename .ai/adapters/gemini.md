# Gemini Adapter

Gemini workspace skills use the `.agents/skills/` alias, while `.gemini/commands/` provides explicit slash-command entry points. Complete workflows remain under `.ai/skills/`. Phase AI-2B does not run `gemini -p`.

Skill activation still requires user intent. Commands must not use shell/file injection, credentials, production access, or implicit writes.
