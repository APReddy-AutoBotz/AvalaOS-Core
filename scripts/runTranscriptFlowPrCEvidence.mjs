import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  applicablePrCNotRun,
  buildPrCAssertionSourceRecord,
  buildPrCNotRunSourceRecord,
  loadPrCContract,
  loadPrCEvidenceBindingCatalog,
  PR_C_COMMAND_RESULTS_VERSION,
  PR_C_EVIDENCE_VERSION,
  PR_C_MANIFEST_VERSION,
  prCCanonicalDigest,
  prCCommandRecordDigest,
  prCSha256,
  runtimeContextMatches,
  validatePrCRegistryStructure,
  validatePrCSanitized,
} from './transcriptFlowPrCEvidenceContract.mjs';
import {
  assertPrCCanonicalEvidenceDirectory,
  derivePrCExecutionIdentity,
  prCExecutionProof,
  resolvePrCCanonicalEvidenceDirectory,
} from './transcriptFlowPrCExecutionIdentity.mjs';
import { calculatePrCWorkingTreeDigest, collectChangedPrCFiles, PR_C_BASE_SHA } from './transcriptFlowPrCEvidenceScope.mjs';
import { runPrCEvidenceCommand } from './prCEvidenceCommandRunner.mjs';

const root = process.cwd();
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
  return runPrCEvidenceCommand({
    command: command.command,
    commandId: command.id,
    cwd: root,
  });
};

const { registry, provenance } = loadPrCContract(root);
const contract = validatePrCRegistryStructure(root, registry, provenance);
const exactHead = git(['rev-parse', 'HEAD']);
const ancestor = spawnSync('git', ['merge-base', '--is-ancestor', PR_C_BASE_SHA, exactHead], { cwd: root });
if (ancestor.status !== 0) throw new Error('PR_C_BASE_NOT_ANCESTOR');

const changedFiles = collectChangedPrCFiles(root);
const workingTreeDigest = calculatePrCWorkingTreeDigest(root, changedFiles);
const identity = derivePrCExecutionIdentity({ exactHead, workingTreeDigest });
const evidenceDir = resolvePrCCanonicalEvidenceDirectory(root, identity);
assertPrCCanonicalEvidenceDirectory(root, identity, evidenceDir);
if (existsSync(evidenceDir)) throw new Error('PR_C_EVIDENCE_PATH_ALREADY_EXISTS');
mkdirSync(evidenceDir, { recursive: true });

const bindingCatalog = loadPrCEvidenceBindingCatalog(root, registry);
const expectedByKey = new Map(registry.assertions.map(assertion => [expectedKey(assertion), assertion]));
const seen = new Map();
const commandRecords = [];
let failed = false;

for (const command of registry.commands) {
  const startedAt = new Date().toISOString();
  const started = performance.now();
  process.stdout.write(`\n[PR C evidence] ${command.id}: ${command.command}\n`);
  const result = await execute(command, command.id);
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
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
  const record = {
    identity,
    id: command.id,
    command: command.command,
    environment: command.environment,
    requiredEnvironment: command.requiredEnvironment || [],
    startedAt,
    durationMs: Math.round(performance.now() - started),
    exitCode: status,
    stdoutSha256: prCSha256(stdout.replace(/\r\n?/gu, '\n')),
    stderrSha256: prCSha256(stderr.replace(/\r\n?/gu, '\n')),
    assertionCount: markers.length,
    expectedAssertionCount: expectedCount,
    assertions: markers,
  };
  record.commandRecordDigest = prCCommandRecordDigest(record);
  validatePrCSanitized(record);
  commandRecords.push(record);
  if (status !== 0 || markers.length !== expectedCount) {
    failed = true;
    break;
  }
}

const finalChangedFiles = collectChangedPrCFiles(root);
const finalWorkingTreeDigest = calculatePrCWorkingTreeDigest(root, finalChangedFiles);
if (JSON.stringify(finalChangedFiles) !== JSON.stringify(changedFiles) || finalWorkingTreeDigest !== workingTreeDigest) {
  throw new Error('PR_C_SCOPED_TREE_CHANGED_DURING_RUN');
}

const missing = [...expectedByKey.keys()].filter(key => !seen.has(key));
if (missing.length > 0) failed = true;

const evidenceFiles = [];
for (const [index, [key, marker]] of [...seen.entries()].entries()) {
  const expected = expectedByKey.get(key);
  const command = registry.commands.find(item => item.id === marker.commandId);
  const commandRecord = commandRecords.find(item => item.id === marker.commandId);
  if (!expected || !command || !commandRecord) throw new Error(`PR_C_ASSERTION_BINDING:${key}`);
  const sourceRecord = buildPrCAssertionSourceRecord({
    registry,
    bindingCatalog,
    assertion: expected,
    observedRuntimeContext: marker.runtimeContext,
    commandRecordDigest: commandRecord.commandRecordDigest,
  });
  const document = {
    contractVersion: PR_C_EVIDENCE_VERSION,
    result: 'passed',
    identity,
    command: {
      id: command.id,
      command: command.command,
      environment: command.environment,
      requiredEnvironment: command.requiredEnvironment || [],
      commandRecordDigest: commandRecord.commandRecordDigest,
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
    sourceRecord,
    sourceRecordDigest: prCCanonicalDigest(sourceRecord),
  };
  validatePrCSanitized(document);
  const name = `${String(index + 1).padStart(3, '0')}-${command.id}-${expected.testId}`
    .replace(/[^a-z0-9._-]/giu, '-')
    .toLowerCase() + '.evidence.json';
  writeFileSync(path.join(evidenceDir, name), `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  evidenceFiles.push(name);
}

const effectiveNotRun = applicablePrCNotRun(registry, identity.executionClassification);
for (const boundary of effectiveNotRun) {
  const sourceRecord = buildPrCNotRunSourceRecord({ registry, boundary });
  const document = {
    contractVersion: PR_C_EVIDENCE_VERSION,
    result: 'not_run',
    identity,
    command: { applicability: 'not_applicable', value: null },
    assertion: {
      owner: boundary.owner,
      ownerBinding: registry.owners[boundary.owner],
      testId: boundary.testId,
      assertionId: { applicability: 'not_applicable', value: null },
      fixture: { applicability: 'not_applicable', value: null },
      persona: { applicability: 'not_applicable', value: null },
      runtimeContext: { applicability: 'not_applicable', value: null },
      testName: boundary.testName,
      reason: boundary.reason,
    },
    sourceRecord,
    sourceRecordDigest: prCCanonicalDigest(sourceRecord),
  };
  validatePrCSanitized(document);
  const name = `not-run-${boundary.testId.toLowerCase()}.evidence.json`;
  writeFileSync(path.join(evidenceDir, name), `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  evidenceFiles.push(name);
}

const commandResults = {
  contractVersion: PR_C_COMMAND_RESULTS_VERSION,
  identity,
  commands: commandRecords,
};
validatePrCSanitized(commandResults);
const commandResultsText = `${JSON.stringify(commandResults, null, 2)}\n`;
writeFileSync(path.join(evidenceDir, 'command-results.json'), commandResultsText, 'utf8');

const manifest = {
  contractVersion: PR_C_MANIFEST_VERSION,
  result: failed ? 'failed' : 'passed',
  identity,
  verification: prCExecutionProof(identity),
  changedFileCount: changedFiles.length,
  changedFiles,
  registryContract: contract,
  commandCount: commandRecords.length,
  assertionCount: seen.size,
  assertionFileCount: evidenceFiles.filter(name => !name.startsWith('not-run-')).length,
  notRunFileCount: evidenceFiles.filter(name => name.startsWith('not-run-')).length,
  evidenceFiles,
  commandResultsFile: 'command-results.json',
  commandResultsSha256: prCSha256(commandResultsText),
  commands: commandRecords,
  notRun: effectiveNotRun,
  missingAssertions: missing,
  completedAt: new Date().toISOString(),
};
validatePrCSanitized(manifest);
const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
writeFileSync(path.join(evidenceDir, 'manifest.json'), manifestBytes);
writeFileSync(path.join(evidenceDir, 'manifest.sha256'), `${prCSha256(manifestBytes)}  manifest.json\n`, 'utf8');
process.stdout.write(`\nPR C evidence directory: ${evidenceDir}\n`);
process.stdout.write(`PR C evidence summary: ${JSON.stringify({ result: manifest.result, commands: manifest.commandCount, assertions: manifest.assertionCount, notRun: manifest.notRun.length, identity })}\n`);

if (failed) {
  const lastCommand = commandRecords.at(-1);
  throw new Error(`PR_C_EVIDENCE_FAILED:${JSON.stringify({
    missing,
    lastCommand: lastCommand?.id,
    exitCode: lastCommand?.exitCode,
    stdoutSha256: lastCommand?.stdoutSha256,
    stderrSha256: lastCommand?.stderrSha256,
  })}`);
}
