# CI Parallelism Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shorten complete CI while retaining test coverage and fail-closed checks.
**Architecture:** Independent browser shard matrices use one composite setup/test action; stable browser gates feed a report-merging total gate.
**Tech Stack:** GitHub Actions, Playwright 1.61.1, Node 22, Java 21, Firebase Emulator, Vitest.
**Spec:** `docs/superpowers/specs/2026-10-23-ci-parallelism.md`

## Global Constraints

Keep one worker, file-level grouping, all existing tests/assertions/timeouts, read-only permissions and both browser check names. No lockfile, dependency or production configuration changes. Work only in the existing feature branch; explicit user authorization covers CI changes and the previously requested integration.

## Review Focus

Missing/duplicate shard results, cancelled jobs appearing green, image/package mismatch, retry artifacts shadowing successful shards, and cache paths accidentally including credentials.

## Task 1: Isolated shards and complete reporting

Files: `.github/workflows/quality-gate.yml`, `.github/actions/playwright-shard/action.yml`, `scripts/verify-playwright-report.mjs`, `src/test/playwrightReport.test.js`, `src/test/ciWorkflow.test.js`, `docs/development/TEST_POLICY.md`.

- [ ] Add failing tests for complete report coverage, missing/duplicate/unexpected identities, incomplete/interrupted results, errors and separate skipped/flaky/retry accounting; test image/lock and matrix consistency.
- [ ] Implement report verification and composite shard setup. Use canonical overwriteable blob names and unique attempt diagnostics.
- [ ] Replace browser jobs with eight-shard matrices and stable fail-closed browser/total gates; remove redundant feature push triggers and unnecessary setup work.
- [ ] Run targeted tests, native collector coverage comparison, real synthetic blob merge and workflow syntax validation. Expected: exact 215 identities/browser, zero duplicates or omissions.
- [ ] Run `npm run verify:fast`, `npm run verify:full`, `git diff --check`; fresh independent whole-branch review. Expected: existing product checks pass, skips/retries disclosed.
- [ ] Commit and push, update PR 79, verify all latest-head CI jobs and measure cold timing. Integrate the previously authorized release only after complete gates pass.
