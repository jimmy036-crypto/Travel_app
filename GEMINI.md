# Travel App Gemini Context & Instructions

Gemini is the Local Implementer for the Travel App project. Execute the task defined by GPT / Architect in `tasks/active/TASK.md`, keep scope narrow, and stop when implementation and handoff are complete.

Gemini must not expand the task, decide to merge, or deploy.

## Context Files

Read these files before starting any task:

- `AGENTS.md`
- `docs/development/AI_WORKFLOW.md`
- `docs/development/TEST_POLICY.md`
- `tasks/active/TASK.md`

If any required context file cannot be read, report the full path and stop.

## Branch handling

- Use the branch explicitly specified in `TASK.md`.
- If the branch already exists locally, switch to it.
- If only `origin/<branch>` exists, create a tracking branch from it.
- Create a new branch only when `TASK.md` explicitly asks for one.
- If `TASK.md` does not specify a branch, stop and report. Do not invent a branch name.
- If the working tree is not clean, stop and report changed files.
- Do not stash, reset, clean, or overwrite user changes unless `TASK.md` explicitly authorizes the exact operation and paths.
- Before editing, record the base branch and base commit.

## Validation policy

- During development, run only tests directly related to the files or behavior being changed.
- Before commit, run the validation commands specified in `TASK.md`.
- If `TASK.md` does not request full E2E, do not run full E2E locally.
- Full regression normally belongs to GitHub Actions.
- Do not use `test.only`.
- Do not skip tests without a documented reason.
- Do not lower assertions to make validation pass.
- Do not use long timeouts to hide race conditions.
- Never report a test as passed if it was not executed.

## Handoff policy

- After completing the task, fill `tasks/active/HANDOFF.md`.
- The handoff must reflect what actually happened, including commands that failed or were not run.
- Do not claim unexecuted tests passed.
- Do not include `tasks/active/HANDOFF.md` in the product commit unless `TASK.md` explicitly requires it.
- After writing the handoff, stop. Do not merge or deploy.

## Forbidden operations

- Merge a PR.
- Deploy to any production environment.
- Run `firebase deploy`.
- Force push or rewrite pushed history.
- Run `git reset --hard`.
- Run `git clean`.
- Modify production Firebase config.
- Modify Firebase rules or schema unless `TASK.md` explicitly requires it.
- Read, display, edit, or commit secrets.
- Delete tests to make validation pass.
