#!/usr/bin/env node
import { approveLiveRun, checkRunner, doctorAgents, executeLiveRun, inspectRun, loadRunnerArtifact, prepareLiveRun, validateAllRunnerArtifacts } from './agent-runner-lib.mjs';

function usage() {
  console.error('Usage: agent-runner <doctor [--json]|validate <json>|validate-all|check|prepare codex <skill> <input>|approve <plan> --phrase <exact>|inspect <run-dir>|execute <plan> <approval>>');
  process.exitCode = 2;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'doctor') {
    const result = doctorAgents();
    if (args[0] === '--json') console.log(JSON.stringify(result, null, 2));
    else for (const item of result) console.log(`${item.agent}: installed=${item.installed ? 'yes' : 'no'} eligible=${item.liveExecutionEligible ? 'yes' : 'no'} version=${item.version ?? 'unavailable'} reason=${item.reason}`);
  } else if (command === 'validate' && args.length === 1) {
    const artifact = loadRunnerArtifact(args[0]); console.log(`Valid ${artifact.artifactType}: ${args[0]}`);
  } else if (command === 'validate-all' && args.length === 0) {
    console.log(`Validated ${validateAllRunnerArtifacts().length} live runner artifact(s).`);
  } else if (command === 'check' && args.length === 0) {
    const result = checkRunner(); console.log(`Checked ${result.files.length} disabled live runner artifact(s).`);
  } else if (command === 'prepare' && args.length === 3) {
    const capabilities = doctorAgents().find((item) => item.agent === args[0]);
    const result = prepareLiveRun(args[0], args[1], args[2], { capabilities });
    console.log(JSON.stringify({ planPath: result.planPath, planId: result.plan.planId, planSha256: result.plan.planSha256, executionEnabled: result.plan.execution.enabled, argv: result.plan.argv, approvalPhrase: result.approvalPhrase }, null, 2));
  } else if (command === 'approve' && args.length >= 3 && args[1] === '--phrase') {
    const result = approveLiveRun(args[0], args.slice(2).join(' ')); console.log(JSON.stringify({ approvalPath: result.approvalPath, planId: result.approval.planId, expiresAt: result.approval.expiresAt }, null, 2));
  } else if (command === 'inspect' && args.length === 1) {
    console.log(JSON.stringify(inspectRun(args[0]), null, 2));
  } else if (command === 'execute' && args.length === 2) {
    const result = await executeLiveRun(args[0], args[1]); console.log(JSON.stringify({ runDirectory: result.runDirectory, importStatus: result.result.importStatus }, null, 2));
  } else usage();
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
