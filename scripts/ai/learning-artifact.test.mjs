import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  checkArtifacts,
  loadArtifact,
  renderArtifact,
  validateArtifact,
} from './learning-artifact-lib.mjs';

const understandPath = path.resolve('.ai/artifacts/source/understand-first-run-welcome.json');
const diffPath = path.resolve('.ai/artifacts/source/explain-diff-first-run-welcome.json');

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const clone = (value) => structuredClone(value);

test('valid understand artifact passes', () => {
  assert.equal(validateArtifact(readJson(understandPath)).artifactType, 'understanding-guide');
});

test('valid explain-diff artifact passes', () => {
  assert.equal(validateArtifact(readJson(diffPath)).artifactType, 'explain-diff');
});

test('missing evidence fails', () => {
  const artifact = readJson(understandPath);
  delete artifact.evidence;
  assert.throws(() => validateArtifact(artifact), /evidence/);
});

test('quiz with fewer than five questions fails', () => {
  const artifact = readJson(understandPath);
  artifact.quiz.pop();
  assert.throws(() => validateArtifact(artifact), /at least 5/);
});

test('quiz with more than five questions fails', () => {
  const artifact = readJson(understandPath);
  artifact.quiz.push(clone(artifact.quiz[4]));
  assert.throws(() => validateArtifact(artifact), /no more than 5/);
});

test('invalid correctOption fails', () => {
  const artifact = readJson(understandPath);
  artifact.quiz[0].correctOption = artifact.quiz[0].options.length;
  assert.throws(() => validateArtifact(artifact), /existing option/);
});

test('absolute evidence path fails', () => {
  const artifact = readJson(understandPath);
  artifact.evidence[0].path = 'C:\\private\\secret.txt';
  assert.throws(() => validateArtifact(artifact), /repository-relative path/);
});

test('path traversal fails', () => {
  const artifact = readJson(diffPath);
  artifact.evidence[0].path = '../outside.txt';
  assert.throws(() => validateArtifact(artifact), /without traversal/);
});

test('CLI returns a non-zero exit code with a clear validation error', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'travel-learning-cli-'));
  const invalid = path.join(root, 'invalid.json');
  const artifact = readJson(understandPath);
  artifact.evidence = [];
  writeFileSync(invalid, JSON.stringify(artifact), 'utf8');

  try {
    const result = spawnSync(process.execPath, [
      path.resolve('scripts/ai/learning-artifact.mjs'),
      'validate',
      invalid,
    ], { cwd: process.cwd(), encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Learning artifact validation failed/);
    assert.match(result.stderr, /evidence/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('renderer escapes script-like artifact text', () => {
  const artifact = readJson(understandPath);
  artifact.overview.oneSentence = '<script>alert("artifact")</script>';
  const html = renderArtifact(artifact);
  assert.match(html, /&lt;script&gt;alert\(&quot;artifact&quot;\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert\("artifact"\)<\/script>/);
});

test('renderer escapes event-handler-like artifact text', () => {
  const artifact = readJson(understandPath);
  artifact.overview.purpose = '<img src=x onerror="alert(1)">';
  const html = renderArtifact(artifact);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.doesNotMatch(html, /<img src=x onerror=/);
});

test('renderer never emits iframe, object, or embed elements', () => {
  const artifact = readJson(understandPath);
  artifact.overview.purpose = '<iframe src="bad"></iframe><object></object><embed>';
  const html = renderArtifact(artifact);
  assert.doesNotMatch(html, /<(iframe|object|embed)(\s|>)/i);
});

test('renderer does not include remote resource requests', () => {
  const html = renderArtifact(readJson(understandPath));
  assert.doesNotMatch(html, /(?:src|href)=["']https?:/i);
  assert.doesNotMatch(html, /@import|url\(\s*["']?https?:/i);
  assert.match(html, /connect-src 'none'/);
});

test('renderer output is deterministic', () => {
  const artifact = readJson(understandPath);
  assert.equal(renderArtifact(artifact), renderArtifact(clone(artifact)));
});

test('check detects stale HTML without rewriting it', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'travel-learning-artifact-'));
  const sourceDir = path.join(root, 'source');
  const renderedDir = path.join(root, 'rendered');
  mkdirSync(sourceDir);
  mkdirSync(renderedDir);
  const source = path.join(sourceDir, 'guide.json');
  const rendered = path.join(renderedDir, 'guide.html');
  writeFileSync(source, JSON.stringify(readJson(understandPath)), 'utf8');
  writeFileSync(rendered, 'stale-html', 'utf8');

  try {
    const result = checkArtifacts({ sourceDir, renderedDir });
    assert.deepEqual(result.stale, [rendered]);
    assert.equal(readFileSync(rendered, 'utf8'), 'stale-html');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rendered HTML contains interactive quiz controls', () => {
  const html = renderArtifact(readJson(understandPath));
  assert.match(html, /id="learning-quiz"/);
  assert.match(html, /id="check-quiz"/);
  assert.match(html, /id="quiz-result"/);
  assert.equal((html.match(/class="quiz-question"/g) || []).length, 5);
});

test('rendered HTML contains evidence', () => {
  const html = renderArtifact(readJson(understandPath));
  assert.match(html, /<h2>Evidence<\/h2>/);
  assert.match(html, /src\/features\/onboarding\/onboardingState\.js:1-5/);
});

test('rendered HTML contains source refs', () => {
  const understandHtml = renderArtifact(loadArtifact(understandPath));
  const diffHtml = renderArtifact(loadArtifact(diffPath));
  assert.match(understandHtml, /c847650e6ea2fc58d6bee7b60f72a290e4fc3b21/);
  assert.match(diffHtml, /92ef883fb237ecf942baaf946e28ab7d4e50c556/);
  assert.match(diffHtml, /c847650e6ea2fc58d6bee7b60f72a290e4fc3b21/);
});

test('generated HTML is self-contained for offline use', () => {
  const html = renderArtifact(readJson(diffPath));
  const executableScripts = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g), (match) => match[1]).join('\n');
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<style>/);
  assert.match(html, /<script>/);
  assert.doesNotMatch(html, /<link\b|<img\b|<video\b|<audio\b/i);
  assert.doesNotMatch(executableScripts, /fetch\(|XMLHttpRequest|WebSocket|localStorage/i);
});
