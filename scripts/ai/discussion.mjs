#!/usr/bin/env node

import path from 'node:path';
import {
  DiscussionValidationError,
  assignmentPlans,
  buildPacket,
  checkDiscussions,
  ingestResponse,
  loadAndValidate,
  recordApproval,
  sessionStatus,
  validateAllDiscussionArtifacts,
} from './discussion-lib.mjs';

function usage() {
  return `Usage:
  node scripts/ai/discussion.mjs validate <json-file>
  node scripts/ai/discussion.mjs validate-all
  node scripts/ai/discussion.mjs check
  node scripts/ai/discussion.mjs status <session-directory>
  node scripts/ai/discussion.mjs packet <session-directory> <round-1|round-2|decision> <participant-id>
  node scripts/ai/discussion.mjs ingest <session-directory> <response-json>
  node scripts/ai/discussion.mjs record-approval <session-directory> <approval-json>
  node scripts/ai/discussion.mjs assignments <session-directory>`;
}

function count(args, expected) { if (args.length !== expected) throw new Error(usage()); }
function print(value) { console.log(JSON.stringify(value, null, 2)); }
function relative(file) { return path.relative(process.cwd(), file).replace(/\\/g, '/'); }

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'validate') {
    count(args, 1); const artifact = loadAndValidate(path.resolve(args[0]));
    console.log(`Valid ${artifact.artifactType}: ${args[0]}`); return;
  }
  if (command === 'validate-all') {
    count(args, 0); const files = validateAllDiscussionArtifacts();
    console.log(`Validated ${files.length} discussion artifact(s).`); return;
  }
  if (command === 'check') {
    count(args, 0); const result = checkDiscussions();
    console.log(`Checked ${result.artifacts.length} artifacts, ${result.examples.length} synthetic fixture(s), and ${result.active.length} active session(s).`); return;
  }
  if (command === 'status') { count(args, 1); print(sessionStatus(path.resolve(args[0]))); return; }
  if (command === 'packet') { count(args, 3); print(buildPacket(path.resolve(args[0]), args[1], args[2])); return; }
  if (command === 'ingest') {
    count(args, 2); const target = ingestResponse(path.resolve(args[0]), path.resolve(args[1]), { onTarget: (file) => console.log(`Target: ${relative(file)}`) });
    console.log(`Ingested: ${relative(target)}`); return;
  }
  if (command === 'record-approval') {
    count(args, 2); const target = recordApproval(path.resolve(args[0]), path.resolve(args[1]), { onTarget: (file) => console.log(`Target: ${relative(file)}`) });
    console.log(`Recorded approval: ${relative(target)}`); return;
  }
  if (command === 'assignments') { count(args, 1); print(assignmentPlans(path.resolve(args[0]))); return; }
  throw new Error(usage());
}

try { main(); } catch (error) {
  console.error(error instanceof DiscussionValidationError ? error.message : (error.message || error));
  process.exitCode = 1;
}
