#!/usr/bin/env node

import path from 'node:path';
import { ArtifactValidationError, checkArtifacts, loadArtifact, renderAllArtifacts, renderArtifactFile, validateAllArtifacts } from './learning-artifact-lib.mjs';

function usage() {
  return `Usage:
  node scripts/ai/learning-artifact.mjs validate <json-file>
  node scripts/ai/learning-artifact.mjs validate-all
  node scripts/ai/learning-artifact.mjs render <json-file> <html-file>
  node scripts/ai/learning-artifact.mjs render-all
  node scripts/ai/learning-artifact.mjs check`;
}

function relative(file) { return path.relative(process.cwd(), file) || path.basename(file); }
function requireArgs(values, count) { if (values.length !== count) throw new Error(usage()); }

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'validate') {
    requireArgs(args, 1);
    const artifact = loadArtifact(args[0]);
    console.log(`Valid ${artifact.artifactType}: ${args[0]}`);
    return;
  }
  if (command === 'validate-all') {
    requireArgs(args, 0);
    const files = validateAllArtifacts();
    console.log(`Validated ${files.length} learning artifact(s).`);
    return;
  }
  if (command === 'render') {
    requireArgs(args, 2);
    renderArtifactFile(args[0], args[1]);
    console.log(`Rendered ${args[0]} -> ${args[1]}`);
    return;
  }
  if (command === 'render-all') {
    requireArgs(args, 0);
    const files = renderAllArtifacts();
    files.forEach(({ rendered }) => console.log(`Rendered ${relative(rendered)}`));
    console.log(`Rendered ${files.length} learning artifact(s).`);
    return;
  }
  if (command === 'check') {
    requireArgs(args, 0);
    const { files, stale } = checkArtifacts();
    if (stale.length) {
      stale.forEach((file) => console.error(`Stale learning artifact: ${relative(file)}`));
      process.exitCode = 1;
      return;
    }
    console.log(`Checked ${files.length} learning artifact(s); all rendered HTML is current.`);
    return;
  }
  throw new Error(usage());
}

try { main(); } catch (error) {
  console.error(error instanceof ArtifactValidationError ? error.message : (error.message || error));
  process.exitCode = 1;
}
