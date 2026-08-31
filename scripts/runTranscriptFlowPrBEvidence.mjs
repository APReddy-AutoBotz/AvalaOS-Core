import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  assertSanitized,
  buildAssertionEvidence,
  buildNotRunEvidence,
  canonicalJson,
  COMMAND_RESULTS_VERSION,
  EVIDENCE_VERSION,
  loadEvidenceContract,
  MANIFEST_VERSION,
  parseExactMarkers,
  sha256,
  validateCommandMarkers,
  validateEvidenceContract,
} from './transcriptFlowPrBEvidenceContract.mjs';
import {
  calculatePrBWorkingTreeDigest,
  validatePrBProvenance,
} from './transcriptFlowPrBEvidenceScope.mjs';
import {
  cleanupPrBEvidenceCompilerOutput,
  PR_B_EVIDENCE_COMPILER_OUTPUTS,
} from './runTranscriptFlowPrBEvidenceTempCleanup.mjs';

const root = process.cwd();
const commandTempDir = path.resolve(tmpdir());
const commandTempRelativeToRoot = path.relative(root, commandTempDir);
if (commandTempRelativeToRoot === ''
  || (!commandTempRelativeToRoot.startsWith('..') && !path.isAbsolute(commandTempRelativeToRoot))) {
  throw new Error('PR_B_COMMAND_TEMP_INSIDE_REPOSITORY');
}
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const cleanupCompilerOutput = () => {
  const tracked = git(['ls-files', '--', ...PR_B_EVIDENCE_COMPILER_OUTPUTS]);
  cleanupPrBEvidenceCompilerOutput(root, tracked ? tracked.split(/\r?\n/gu).filter(Boolean) : []);
};
cleanupCompilerOutput();
const checkedOutGitSha = git(['rev-parse', 'HEAD']);
const baseGitSha = process.env.PR_B_BASE_SHA || '11e670003a73b0ab5a28650b70afac4b267760f4';
const headGitSha = process.env.PR_B_EXACT_HEAD_SHA || checkedOutGitSha;
if (!/^[0-9a-f]{40}$/u.test(baseGitSha) || !/^[0-9a-f]{40}$/u.test(headGitSha)) throw new Error('PR_B_GIT_IDENTITY_INVALID');
if (headGitSha !== checkedOutGitSha) throw new Error('PR_B_EXACT_HEAD_MISMATCH');
if (process.env.CI && (!process.env.GITHUB_RUN_ID || !process.env.GITHUB_RUN_ATTEMPT || !process.env.PR_B_BASE_SHA || !process.env.PR_B_EXACT_HEAD_SHA)) {
  throw new Error('PR_B_CI_RUN_IDENTITY_INCOMPLETE');
}

const validated = validateEvidenceContract(root, loadEvidenceContract(root), { baseGitSha });
const changedFiles = validatePrBProvenance(root, baseGitSha, validated.registry, validated.provenance);
const workingTreeDigest = calculatePrBWorkingTreeDigest(root, changedFiles);
const runAttempt = process.env.GITHUB_RUN_ATTEMPT || `local-${new Date().toISOString().replace(/[:.]/gu, '-')}`;
const workflow = {
  path: validated.registry.workflowPath,
  runId: process.env.GITHUB_RUN_ID || 'local',
  runAttempt,
  exactHeadGitSha: headGitSha,
};
const outputDir = path.join(root, 'output', 'process-lifecycle-pr-b', baseGitSha, workingTreeDigest, runAttempt);

const execute = (canonical, commandId) => {
  const env = {
    ...process.env,
    TEMP: commandTempDir,
    TMP: commandTempDir,
    TMPDIR: commandTempDir,
    PR_B_COMMAND_ID: commandId,
  };
  const tokens = canonical.split(' ');
  if (tokens[0] === 'git') {
    return spawnSync('git', tokens.slice(1), { cwd: root, encoding: 'utf8', env, maxBuffer: 64 * 1024 * 1024 });
  }
  if (tokens[0] !== 'npm') throw new Error(`PR_B_COMMAND_EXECUTABLE:${commandId}`);
  if (process.platform === 'win32') {
    const executable = process.env.ComSpec || 'cmd.exe';
    const commandLine = ['npm.cmd', ...tokens.slice(1)].join(' ');
    return spawnSync(executable, ['/d', '/s', '/c', commandLine], {
      cwd: root,
      encoding: 'utf8',
      env,
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    });
  }
  return spawnSync('npm', tokens.slice(1), { cwd: root, encoding: 'utf8', env, maxBuffer: 64 * 1024 * 1024 });
};

const commandRecords = [];
for (const command of validated.registry.commands) {
  for (const required of command.requiredEnvironment || []) {
    if (!process.env[required]) throw new Error(`PR_B_REQUIRED_ENVIRONMENT_MISSING:${command.id}:${required}`);
  }
  const started = Date.now();
  let result;
  try {
    result = execute(command.command, command.id);
  } finally {
    cleanupCompilerOutput();
  }
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  if (result.error) throw new Error(`PR_B_COMMAND_START_FAILED:${command.id}:${result.error.code || 'unknown'}`);
  if (result.status !== 0) throw new Error(`PR_B_COMMAND_FAILED:${command.id}:${result.status}`);
  const commandOwnsAssertions = validated.registry.assertions.some(item => item.commandId === command.id);
  const markers = commandOwnsAssertions ? parseExactMarkers(`${stdout}\n${stderr}`) : [];
  validateCommandMarkers(validated, command.id, markers);
  const record = {
    id: command.id,
    command: command.command,
    environment: command.environment,
    status: 'passed',
    durationMs: Date.now() - started,
    stdoutDigest: sha256(stdout),
    stderrDigest: sha256(stderr),
    markers,
  };
  assertSanitized(record, `command-record:${command.id}`);
  commandRecords.push(record);
}

cleanupCompilerOutput();
const finalChangedFiles = validatePrBProvenance(root, baseGitSha, validated.registry, validated.provenance);
if (calculatePrBWorkingTreeDigest(root, finalChangedFiles) !== workingTreeDigest) throw new Error('PR_B_SCOPED_TREE_CHANGED_DURING_RUN');
mkdirSync(outputDir, { recursive: true });
const evidenceFiles = [];
for (const record of commandRecords) {
  const command = validated.registry.commands.find(item => item.id === record.id);
  const commandRecordDigest = sha256(canonicalJson(record));
  for (const [index, marker] of record.markers.entries()) {
    const registered = validated.registry.assertions.find(item => item.commandId === record.id
      && item.testId === marker.testId && item.assertionId === marker.assertionId && item.fixture === marker.fixture);
    if (!registered) throw new Error(`PR_B_MARKER_REGISTRY_DRIFT:${record.id}:${marker.testId}`);
    const assertion = buildAssertionEvidence(validated, registered, marker, commandRecordDigest);
    const document = {
      contractVersion: EVIDENCE_VERSION,
      baseGitSha,
      headGitSha,
      workingTreeDigest,
      workflow,
      testId: marker.testId,
      result: 'passed',
      command: { id: record.id, command: command.command, environment: command.environment, commandRecordDigest },
      assertion,
    };
    assertSanitized(document, `assertion:${record.id}:${marker.testId}`);
    const name = `${record.id}-${String(index + 1).padStart(3, '0')}-${marker.testId.toLowerCase()}.evidence.json`;
    writeFileSync(path.join(outputDir, name), `${JSON.stringify(document, null, 2)}\n`);
    evidenceFiles.push(name);
  }
}
for (const item of validated.registry.notRun) {
  const document = {
    contractVersion: EVIDENCE_VERSION,
    baseGitSha,
    headGitSha,
    workingTreeDigest,
    workflow,
    testId: item.testId,
    result: 'not_run',
    reason: item.reason,
    command: null,
    assertion: buildNotRunEvidence(validated, item),
  };
  assertSanitized(document, `not-run:${item.testId}`);
  const name = `not-run-${item.testId.toLowerCase()}.evidence.json`;
  writeFileSync(path.join(outputDir, name), `${JSON.stringify(document, null, 2)}\n`);
  evidenceFiles.push(name);
}

writeFileSync(path.join(outputDir, 'command-results.json'), `${JSON.stringify({
  contractVersion: COMMAND_RESULTS_VERSION,
  baseGitSha,
  headGitSha,
  workingTreeDigest,
  workflow,
  commands: commandRecords,
}, null, 2)}\n`);
writeFileSync(path.join(outputDir, 'manifest.json'), `${JSON.stringify({
  contractVersion: MANIFEST_VERSION,
  baseGitSha,
  headGitSha,
  workingTreeDigest,
  runAttempt,
  workflow,
  generatedAt: new Date().toISOString(),
  evidenceFiles,
  assertionCount: evidenceFiles.length,
  exactHeadCi: process.env.CI ? 'executed' : 'not_run',
  hostedVerification: 'not_run',
  realProviderVerification: 'not_run',
  controlledHumanVerification: 'not_run',
  deploymentVerification: 'not_run',
}, null, 2)}\n`);
console.log(`PR B sanitized evidence written to ${outputDir} (${evidenceFiles.length} per-assertion results).`);
