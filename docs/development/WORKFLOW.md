# Development Workflow

This project uses short-lived feature branches and targeted local validation. Pull requests run the full regression suite in CI.

## Preflight

Start each task from a clean, current `main`:

```bash
npm run task:preflight
git switch main
git pull --ff-only origin main
git switch -c <branch-name>
```

`task:preflight` reports `PASS`, `WARN`, or `FAIL`. It only inspects state. It does not switch branches, pull, merge, stash, reset, clean, stop processes, or change files.

Useful options:

```bash
npm run task:preflight -- --help
npm run task:preflight -- --skip-fetch
npm run task:preflight -- --allow-feature
```

## One Active Feature Branch

Prefer one active feature branch touching a core area at a time. If the previous PR changed the same core files and is not merged, do not start the next feature unless the user explicitly asks for a stacked PR.

Stacked PR exception:

- State the base branch clearly.
- Keep each branch independently reviewable.
- Rebase or merge `main` only when requested or when needed to resolve CI.

## Normal Flow

1. Run preflight and sync `main`.
2. Create a branch from latest `main`.
3. Read the nearest implementation and tests.
4. Make the smallest scoped change.
5. During development, run only directly related tests.
6. Before commit, run `npm run verify:fast`, related E2E, and `git diff --check`.
7. Push the branch and open a PR.
8. Let CI run full E2E.
9. After merge, update local `main` before starting the next task.

## Confirming a Feature Is in Main

Use targeted search for the feature signal after syncing:

```bash
git switch main
git pull --ff-only origin main
rg "<feature text or test name>" <expected files>
```

If the signal is missing, stop and report instead of layering another feature on top.

## Pushed Branch Without PR

A pushed branch without a PR can be missed during review and follow-up planning. If a task is complete, create or request a PR promptly and include the commit list in the handoff.

## After Merge

After a PR is merged:

```bash
git switch main
git pull --ff-only origin main
```

Then verify the merged feature with `rg` before starting dependent work.
