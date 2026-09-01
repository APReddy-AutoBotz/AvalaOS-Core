import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadPrCContract, runtimeContextMatches, validatePrCRegistryStructure } from './transcriptFlowPrCEvidenceContract.mjs';
import { calculatePrCWorkingTreeDigest, collectChangedPrCFiles, PR_C_BASE_SHA, PR_C_WORKFLOW_PATH } from './transcriptFlowPrCEvidenceScope.mjs';

const root = process.cwd();
const sha256 = value => createHash('sha256').update(value).digest('hex');
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

const markerKey = marker => [marker.commandId, marker.owner, marker.testId, marker.assertionId, marker.fixture].join('|');
const expectedKey = assertion => [assertion.commandId, assertion.owner, assertion.testId, assertion.assertionId, assertion.fixture].join('|');

const parseMarkers = (commandId, output) => output.split(/\r?\n/gu).flatMap(line => {
  const match = line.trim().match(/^(?:#\s*)?PR_C_ASSERTION\s+(\{.*\})$/u);
  if (!match) return [];
  const marker = JSON.parse(match[1]);
  const fields = ['assertionId', 'fixture', 'owner', 'result', 'runtimeContext', 'testId'];
  if (JSON.stringify(Object.keys(marker).sort()) !== JSON.stringify(fields)) throw new Error('PR_C_MARKER_FIELDS');
  if (marker.result !== 'passed') throw new Error(`PR_C_MARKER_RESULT:${marker.testId}`);
  return [{ ...marker, commandId }];
});

const execute = (command, commandId) => {
  for (const required of command.requiredEnvironment || []) {
    if (!process.env[required]) throw new Error(`PR_C_REQUIRED_ENVIRONMENT:${commandId}:${required}`);
  }
  const [executable, ...args] = command.command.split(' ');
  const options = {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, PR_C_EVIDENCE_COMMAND_ID: command.id },
    maxBuffer: 128 * 1024 * 1024,
    windowsHide: true,
  };
  if (process.platform === 'win32' && (executable === 'npm' || executable === 'npm.cmd')) {
    const shell = process.env.ComSpec || 'cmd.exe';
    return spawnSync(shell, ['/d', '/s', '/c', ['npm.cmd', ...args].join(' ')], options);
  }
  return spawnSync(executable, args, options);
};

const { registry, provenance } = loadPrCContract(root);
const contract = validatePrCRegistryStructure(root, registry, provenance);
const exactHead = git(['rev-parse', 'HEAD']);
const expectedHead = process.env.PR_C_EXACT_HEAD_SHA;
if (expectedHead && expectedHead !== exactHead) throw new Error(`PR_C_EXACT_HEAD:${exactHead}`);
const ancestor = spawnSync('git', ['merge-base', '--is-ancestor', PR_C_BASE_SHA, exactHead], { cwd: root });
if (ancestor.status !== 0) throw new Error('PR_C_BASE_NOT_ANCESTOR');

const changedFiles = collectChangedPrCFiles(root);
const workingTreeDigest = calculatePrCWorkingTreeDigest(root, changedFiles);
const attempt = String(process.env.PR_C_RUN_ATTEMPT || 'local-1').replace(/[^a-z0-9._-]/giu, '-');
const evidenceDir = path.join(root, 'output', 'process-lifecycle-pr-c', PR_C_BASE_SHA, workingTreeDigest, attempt);
rmSync(evidenceDir, { recursive: true, force: true });
mkdirSync(evidenceDir, { recursive: true });

const expectedByKey = new Map(registry.assertions.map(assertion => [expectedKey(assertion), assertion]));
const seen = new Map();
const commandRecords = [];
let failed = false;

for (const command of registry.commands) {
  const startedAt = new Date().toISOString();
  const started = performance.now();
  process.stdout.write(`\n[PR C evidence] ${command.id}: ${command.command}\n`);
  const result = execute(command, command.id);
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  const markers = [...parseMarkers(command.id, stdout), ...parseMarkers(command.id, stderr)];
  for (const marker of markers) {
    const key = markerKey(marker);
    const expected = expectedByKey.get(key);
    if (!expected) throw new Error(`PR_C_UNREGISTERED_MARKER:${key}`);
    if (seen.has(key)) throw new Error(`PR_C_DUPLICATE_MARKER:${key}`);
    runtimeContextMatches(marker.runtimeContext, expected.expectedRuntimeContext, key);
    seen.set(key, marker);
  }
  const expectedCount = registry.assertions.filter(assertion => assertion.commandId === command.id).length;
  const status = result.status ?? 1;
  commandRecords.push({
    id: command.id,
    command: command.command,
    environment: command.environment,
    startedAt,
    durationMs: Math.round(performance.now() - started),
    exitCode: status,
    stdoutSha256: sha256(stdout.replace(/\r\n?/gu, '\n')),
    stderrSha256: sha256(stderr.replace(/\r\n?/gu, '\n')),
    assertionCount: markers.length,
    expectedAssertionCount: expectedCount,
    assertions: markers,
  });
  if (status !== 0 || markers.length !== expectedCount) {
    failed = true;
    break;
  }
}

const missing = [...expectedByKey.keys()].filter(key => !seen.has(key));
if (missing.length > 0) failed = true;

const evidenceFiles = [];
for (const [index, [key, marker]] of [...seen.entries()].entries()) {
  const expected = expectedByKey.get(key);
  const command = registry.commands.find(item => item.id === marker.commandId);
  const commandRecord = commandRecords.find(item => item.id === marker.commandId);
  if (!expected || !command || !commandRecord) throw new Error(`PR_C_ASSERTION_BINDING:${key}`);
  const document = {
    contractVersion: 'governed-delivery-monitor-pr-c-assertion-evidence-1',
    result: 'passed',
    acceptedMainBaseline: PR_C_BASE_SHA,
    exactHead,
    workingTreeDigest,
    workflowPath: PR_C_WORKFLOW_PATH,
    command: {
      id: command.id,
      command: command.command,
      environment: command.environment,
      stdoutSha256: commandRecord.stdoutSha256,
      stderrSha256: commandRecord.stderrSha256,
    },
    assertion: {
      owner: expected.owner,
      ownerBinding: registry.owners[expected.owner],
      testId: expected.testId,
      assertionId: expected.assertionId,
      fixture: expected.fixture,
      testName: expected.testName,
      runtimeContext: marker.runtimeContext,
    },
  };
  const name = `${String(index + 1).padStart(3, '0')}-${command.id}-${expected.testId}`
    .replace(/[^a-z0-9._-]/giu, '-')
    .toLowerCase() + '.evidence.json';
  writeFileSync(path.join(evidenceDir, name), `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  evidenceFiles.push(name);
}
for (const boundary of registry.notRun) {
  const document = {
    contractVersion: 'governed-delivery-monitor-pr-c-assertion-evidence-1',
    result: 'not_run',
    acceptedMainBaseline: PR_C_BASE_SHA,
    exactHead,
    workingTreeDigest,
    workflowPath: PR_C_WORKFLOW_PATH,
    command: null,
    assertion: {
      owner: boundary.owner,
      ownerBinding: registry.owners[boundary.owner],
      testId: boundary.testId,
      testName: boundary.testName,
      reason: boundary.reason,
    },
  };
  const name = `not-run-${boundary.testId.toLowerCase()}.evidence.json`;
  writeFileSync(path.join(evidenceDir, name), `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  evidenceFiles.push(name);
}

const commandResults = {
  contractVersion: 'governed-delivery-monitor-pr-c-command-results-1',
  acceptedMainBaseline: PR_C_BASE_SHA,
  exactHead,
  workingTreeDigest,
  commands: commandRecords,
};
const commandResultsText = `${JSON.stringify(commandResults, null, 2)}\n`;
writeFileSync(path.join(evidenceDir, 'command-results.json'), commandResultsText, 'utf8');

const manifest = {
  contractVersion: 'governed-delivery-monitor-pr-c-evidence-1',
  result: failed ? 'failed' : 'passed',
  acceptedMainBaseline: PR_C_BASE_SHA,
  exactHead,
  workflowPath: PR_C_WORKFLOW_PATH,
  workflowRunId: process.env.PR_C_WORKFLOW_RUN_ID || null,
  runAttempt: attempt,
  workingTreeDigest,
  changedFileCount: changedFiles.length,
  changedFiles,
  registryContract: contract,
  commandCount: commandRecords.length,
  assertionCount: seen.size,
  assertionFileCount: evidenceFiles.filter(name => !name.startsWith('not-run-')).length,
  notRunFileCount: evidenceFiles.filter(name => name.startsWith('not-run-')).length,
  evidenceFiles,
  commandResultsFile: 'command-results.json',
  commandResultsSha256: sha256(commandResultsText.replace(/\r\n?/gu, '\n')),
  commands: commandRecords,
  notRun: registry.notRun,
  missingAssertions: missing,
  completedAt: new Date().toISOString(),
};

const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
writeFileSync(path.join(evidenceDir, 'manifest.json'), manifestBytes);
writeFileSync(path.join(evidenceDir, 'manifest.sha256'), `${sha256(manifestBytes)}  manifest.json\n`, 'utf8');
process.stdout.write(`\nPR C evidence directory: ${evidenceDir}\n`);
process.stdout.write(`PR C evidence summary: ${JSON.stringify({ result: manifest.result, commands: manifest.commandCount, assertions: manifest.assertionCount, notRun: manifest.notRun.length })}\n`);

if (failed) throw new Error(`PR_C_EVIDENCE_FAILED:${JSON.stringify({ missing, lastCommand: commandRecords.at(-1)?.id })}`);
