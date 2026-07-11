import { describe, expect, it } from 'vitest';

import { evaluatePreflight, parseArgs, summarizeChecks } from '../scripts/task-preflight.mjs';

function baseState(overrides = {}) {
  return {
    isGitRepository: true,
    projectPath: 'C:/repo/travel',
    branch: 'main',
    isDirty: false,
    fetchSkipped: false,
    fetchError: '',
    originMainExists: true,
    mainRelation: { ahead: 0, behind: 0 },
    currentBranchRelation: { ahead: 0, behind: 0 },
    currentBranchUpstreamMissing: false,
    versions: {
      node: 'v22.0.0',
      npm: '10.0.0',
      git: 'git version 2.0.0',
      java: 'openjdk version "21"',
      firebase: '15.0.0',
    },
    gitErrors: [],
    ...overrides,
  };
}

function report(overrides = {}, options = {}) {
  return evaluatePreflight(baseState(overrides), options);
}

function checkById(result, id) {
  return result.checks.find((item) => item.id === id);
}

describe('task preflight evaluation', () => {
  it('passes on clean main that is up to date', () => {
    const result = report();

    expect(result.status).toBe('PASS');
    expect(checkById(result, 'branch')?.status).toBe('PASS');
    expect(checkById(result, 'main-sync')?.message).toContain('up to date');
  });

  it('fails on a dirty worktree', () => {
    const result = report({ isDirty: true });

    expect(result.status).toBe('FAIL');
    expect(checkById(result, 'worktree')?.status).toBe('FAIL');
  });

  it('fails on a feature branch by default', () => {
    const result = report({ branch: 'feature/test' });

    expect(result.status).toBe('FAIL');
    expect(checkById(result, 'branch')?.status).toBe('FAIL');
  });

  it('allows a feature branch with --allow-feature', () => {
    const result = report({ branch: 'feature/test' }, { allowFeature: true });

    expect(result.status).toBe('PASS');
    expect(checkById(result, 'branch')?.status).toBe('PASS');
  });

  it('fails when main is behind origin/main', () => {
    const result = report({ mainRelation: { ahead: 0, behind: 2 } });

    expect(result.status).toBe('FAIL');
    expect(checkById(result, 'main-sync')?.message).toContain('behind');
  });

  it('fails when the current branch has unpushed commits', () => {
    const result = report({ currentBranchRelation: { ahead: 1, behind: 0 } });

    expect(result.status).toBe('FAIL');
    expect(checkById(result, 'unpushed-commits')?.message).toContain('unpushed');
  });

  it('fails when main has diverged from origin/main', () => {
    const result = report({ mainRelation: { ahead: 1, behind: 1 } });

    expect(result.status).toBe('FAIL');
    expect(checkById(result, 'main-sync')?.message).toContain('diverged');
  });

  it('warns when Java or Firebase CLI is unavailable', () => {
    const result = report({
      versions: {
        ...baseState().versions,
        java: '',
        firebase: '',
      },
    });

    expect(result.status).toBe('WARN');
    expect(checkById(result, 'tool-java')?.status).toBe('WARN');
    expect(checkById(result, 'tool-firebase')?.status).toBe('WARN');
  });

  it('reports Git command errors without throwing', () => {
    const result = report({ gitErrors: ['git rev-list failed'] });

    expect(result.status).toBe('FAIL');
    expect(checkById(result, 'git-command-error')?.message).toBe('git rev-list failed');
  });

  it('parses supported CLI flags', () => {
    expect(parseArgs(['--allow-feature', '--skip-fetch'])).toEqual({
      help: false,
      skipFetch: true,
      allowFeature: true,
    });
  });

  it('summarizes warnings below failures', () => {
    expect(summarizeChecks([
      { status: 'PASS' },
      { status: 'WARN' },
      { status: 'FAIL' },
    ])).toBe('FAIL');
  });
});
