import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  assertSanitized, buildAssertionEvidence, buildNotRunEvidence, loadEvidenceContract, parseExactMarkers, sha256,
  validateCommandMarkers, validateEvidenceContract, validateProvenance,
} from './transcriptFlowEvidenceContract.mjs';
import { calculatePrAWorkingTreeDigest } from './transcriptFlowEvidenceScope.mjs';

const root = process.cwd();
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const checkedOutGitSha = git(['rev-parse', 'HEAD']);
const baseGitSha = process.env.PR_A_BASE_SHA || checkedOutGitSha;
const headGitSha = process.env.PR_A_EXACT_HEAD_SHA || checkedOutGitSha;
if (!/^[0-9a-f]{40}$/u.test(baseGitSha) || !/^[0-9a-f]{40}$/u.test(headGitSha)) throw new Error('PR_A_GIT_IDENTITY_INVALID');
if (headGitSha !== checkedOutGitSha) throw new Error('PR_A_EXACT_HEAD_MISMATCH');
if (process.env.CI && (!process.env.GITHUB_RUN_ID || !process.env.GITHUB_RUN_ATTEMPT || !process.env.PR_A_BASE_SHA || !process.env.PR_A_EXACT_HEAD_SHA)) {
  throw new Error('PR_A_CI_RUN_IDENTITY_INCOMPLETE');
}

const validated = validateEvidenceContract(root, loadEvidenceContract(root));
validateProvenance(root, baseGitSha);
const workingTreeDigest = calculatePrAWorkingTreeDigest(root);
const runAttempt = process.env.GITHUB_RUN_ATTEMPT || `local-${new Date().toISOString().replace(/[:.]/gu, '-')}`;
const workflow = {
  path: validated.registry.workflowPath,
  runId: process.env.GITHUB_RUN_ID || 'local',
  runAttempt,
  exactHeadGitSha: headGitSha,
};
const outputDir = path.join(root, 'output', 'process-lifecycle', baseGitSha, workingTreeDigest, runAttempt);

const execute = (canonical, commandId) => {
  const env = { ...process.env, PR_A_COMMAND_ID: commandId };
  if (canonical === 'git diff --check') return spawnSync('git', ['diff', '--check'], { cwd: root, encoding: 'utf8', env, maxBuffer: 64 * 1024 * 1024 });
  const tokens = canonical.split(' ');
  const args = tokens.slice(1);
  if (process.platform === 'win32') {
    const executable = process.env.ComSpec || 'cmd.exe';
    const commandLine = ['npm.cmd', ...args].join(' ');
    return spawnSync(executable, ['/d', '/s', '/c', commandLine], {
      cwd: root, encoding: 'utf8', env, maxBuffer: 64 * 1024 * 1024, windowsHide: true,
    });
  }
  return spawnSync('npm', args, { cwd: root, encoding: 'utf8', env, maxBuffer: 64 * 1024 * 1024 });
};

const commandRecords = [];
for (const command of validated.registry.commands) {
  for (const required of command.requiredEnvironment || []) if (!process.env[required]) throw new Error(`PR_A_REQUIRED_ENVIRONMENT_MISSING:${command.id}:${required}`);
  const started = Date.now();
  const result = execute(command.command, command.id);
  const stdout = result.stdout || ''; const stderr = result.stderr || '';
  if (stdout) process.stdout.write(stdout); if (stderr) process.stderr.write(stderr);
  if (result.error) throw new Error(`PR_A_COMMAND_START_FAILED:${command.id}:${result.error.code || 'unknown'}`);
  if (result.status !== 0) throw new Error(`PR_A_COMMAND_FAILED:${command.id}:${result.status}`);
  const markers = parseExactMarkers(`${stdout}\n${stderr}`);
  validateCommandMarkers(validated, command.id, markers);
  const record = {
    id: command.id, command: command.command, environment: command.environment, status: 'passed',
    durationMs: Date.now() - started, stdoutDigest: sha256(stdout), stderrDigest: sha256(stderr), markers,
  };
  assertSanitized(record, `command-record:${command.id}`); commandRecords.push(record);
}

validateProvenance(root, baseGitSha);
if (calculatePrAWorkingTreeDigest(root) !== workingTreeDigest) throw new Error('PR_A_SCOPED_TREE_CHANGED_DURING_RUN');
mkdirSync(outputDir, { recursive: true });
const evidenceFiles = [];
for (const record of commandRecords) {
  const command = validated.registry.commands.find(item => item.id === record.id);
  const commandRecordDigest = sha256(JSON.stringify(record));
  for (const [index, marker] of record.markers.entries()) {
    const registered = validated.assertions.find(item => item.commandId === record.id
      && item.marker.testId === marker.testId && item.marker.assertionId === marker.assertionId
      && item.marker.fixture === marker.fixture && item.marker.result === marker.result);
    if (!registered) throw new Error(`PR_A_MARKER_REGISTRY_DRIFT:${record.id}:${marker.testId}`);
    const assertion = buildAssertionEvidence(root, validated, registered, marker, commandRecordDigest);
    const document = {
      contractVersion: 'process-lifecycle-pr-a-evidence-3', baseGitSha, headGitSha, workingTreeDigest, workflow,
      testId: marker.testId, result: 'passed',
      command: { id: record.id, command: command.command, environment: command.environment, commandRecordDigest }, assertion,
    };
    assertSanitized(document, `assertion:${record.id}:${marker.testId}`);
    const name = `${record.id}-${String(index + 1).padStart(3, '0')}-${marker.testId.toLowerCase()}.evidence.json`;
    writeFileSync(path.join(outputDir, name), `${JSON.stringify(document, null, 2)}\n`); evidenceFiles.push(name);
  }
}
for (const item of validated.registry.notRun) {
  const document = {
    contractVersion: 'process-lifecycle-pr-a-evidence-3', baseGitSha, headGitSha, workingTreeDigest, workflow,
    testId: item.testId, result: 'not_run', reason: item.reason, command: null,
    assertion: buildNotRunEvidence(root, validated, item),
  };
  assertSanitized(document, `not-run:${item.testId}`);
  const name = `not-run-${item.testId.toLowerCase()}.evidence.json`;
  writeFileSync(path.join(outputDir, name), `${JSON.stringify(document, null, 2)}\n`); evidenceFiles.push(name);
}

writeFileSync(path.join(outputDir, 'command-results.json'), `${JSON.stringify({
  contractVersion: 'process-lifecycle-pr-a-command-results-3', baseGitSha, headGitSha, workingTreeDigest, workflow, commands: commandRecords,
}, null, 2)}\n`);
writeFileSync(path.join(outputDir, 'manifest.json'), `${JSON.stringify({
  contractVersion: 'process-lifecycle-pr-a-manifest-3', baseGitSha, headGitSha, workingTreeDigest, runAttempt, workflow,
  generatedAt: new Date().toISOString(), evidenceFiles, assertionCount: evidenceFiles.length,
  exactHeadCi: process.env.CI ? 'executed' : 'not_run', hostedVerification: 'not_run', realProviderVerification: 'not_run',
}, null, 2)}\n`);
console.log(`PR A sanitized evidence written to ${outputDir} (${evidenceFiles.length} per-assertion results).`);
