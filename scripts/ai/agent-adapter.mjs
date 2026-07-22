#!/usr/bin/env node

import {
  AdapterValidationError,
  buildInvocationPlan,
  checkAdapters,
  doctorAgents,
  formatDoctor,
  loadInvocation,
  validateAllInvocations,
} from './agent-adapter-lib.mjs';

function usage() {
  return `Usage:
  node scripts/ai/agent-adapter.mjs check
  node scripts/ai/agent-adapter.mjs doctor [--json]
  node scripts/ai/agent-adapter.mjs validate <invocation-json>
  node scripts/ai/agent-adapter.mjs validate-all
  node scripts/ai/agent-adapter.mjs plan <codex|claude|gemini> <understand|explain-diff> <arguments>`;
}

function requireCount(args, allowed) {
  if (!allowed.includes(args.length)) throw new Error(usage());
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'check') {
    requireCount(args, [0]);
    const result = checkAdapters();
    console.log(`Checked ${result.manifest.skills.length} canonical skills, all adapters, and ${result.examples.length} invocation examples.`);
    return;
  }
  if (command === 'doctor') {
    requireCount(args, [0, 1]);
    if (args.length === 1 && args[0] !== '--json') throw new Error(usage());
    const result = doctorAgents();
    console.log(args[0] === '--json' ? JSON.stringify(result, null, 2) : formatDoctor(result));
    return;
  }
  if (command === 'validate') {
    requireCount(args, [1]);
    const invocation = loadInvocation(args[0]);
    console.log(`Valid ${invocation.agent} ${invocation.skill} invocation: ${args[0]}`);
    return;
  }
  if (command === 'validate-all') {
    requireCount(args, [0]);
    const files = validateAllInvocations();
    console.log(`Validated ${files.length} plan-only invocation example(s).`);
    return;
  }
  if (command === 'plan') {
    if (args.length < 3) throw new Error(usage());
    const [agent, skill, ...skillArguments] = args;
    console.log(JSON.stringify(buildInvocationPlan(agent, skill, skillArguments), null, 2));
    return;
  }
  throw new Error(usage());
}

try { main(); } catch (error) {
  console.error(error instanceof AdapterValidationError ? error.message : (error.message || error));
  process.exitCode = 1;
}
