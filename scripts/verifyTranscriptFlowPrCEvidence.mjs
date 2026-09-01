import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { loadPrCContract, runtimeContextMatches, validatePrCRegistryStructure } from './transcriptFlowPrCEvidenceContract.mjs';
import { calculatePrCWorkingTreeDigest, collectChangedPrCFiles, PR_C_BASE_SHA, PR_C_WORKFLOW_PATH } from './transcriptFlowPrCEvidenceScope.mjs';

const root = process.cwd();
const sha256 = value => createHash('sha256').update(value).digest('hex');
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const assert = (condition, code) => { if (!condition) throw new Error(code); };
const markerKey = marker => [marker.commandId, marker.owner, marker.testId, marker.assertionId, marker.fixture].join('|');
const expectedKey = assertion => [assertion.commandId, assertion.owner, assertion.testId, assertion.assertionId, assertion.fixture].join('|');

const { registry, provenance } = loadPrCContract(root);
validatePrCRegistryStructure(root, registry, provenance);
const exactHead = git(['rev-parse', 'HEAD']);
const changedFiles = collectChangedPrCFiles(root);
const workingTreeDigest = calculatePrCWorkingTreeDigest(root, changedFiles);
const attempt = String(process.env.PR_C_RUN_ATTEMPT || 'local-1').replace(/[^a-z0-9._-]/giu, '-');
const evidenceDir = process.env.PR_C_EVIDENCE_DIR || path.join(root, 'output', 'process-lifecycle-pr-c', PR_C_BASE_SHA, workingTreeDigest, attempt);
const manifestPath = path.join(evidenceDir, 'manifest.json');
assert(existsSync(manifestPath), 'PR_C_EVIDENCE_MANIFEST_MISSING');
const manifestBytes = readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes.toString('utf8'));

assert(manifest.contractVersion === 'governed-delivery-monitor-pr-c-evidence-1', 'PR_C_EVIDENCE_VERSION');
assert(manifest.result === 'passed', 'PR_C_EVIDENCE_RESULT');
assert(manifest.acceptedMainBaseline === PR_C_BASE_SHA, 'PR_C_EVIDENCE_BASE');
assert(manifest.exactHead === exactHead, 'PR_C_EVIDENCE_HEAD');
assert(manifest.workflowPath === PR_C_WORKFLOW_PATH, 'PR_C_EVIDENCE_WORKFLOW');
assert(manifest.workingTreeDigest === workingTreeDigest, 'PR_C_EVIDENCE_TREE');
assert(JSON.stringify(manifest.changedFiles) === JSON.stringify(changedFiles), 'PR_C_EVIDENCE_FILE_SET');
assert(manifest.commandCount === registry.commands.length, 'PR_C_EVIDENCE_COMMAND_COUNT');
assert(manifest.assertionCount === registry.assertions.length, 'PR_C_EVIDENCE_ASSERTION_COUNT');
assert(manifest.assertionFileCount === registry.assertions.length, 'PR_C_EVIDENCE_ASSERTION_FILE_COUNT');
assert(manifest.notRunFileCount === registry.notRun.length, 'PR_C_EVIDENCE_NOT_RUN_FILE_COUNT');
assert(Array.isArray(manifest.evidenceFiles) && manifest.evidenceFiles.length === registry.assertions.length + registry.notRun.length, 'PR_C_EVIDENCE_FILE_COUNT');
assert(new Set(manifest.evidenceFiles).size === manifest.evidenceFiles.length, 'PR_C_EVIDENCE_FILE_DUPLICATE');
assert(Array.isArray(manifest.missingAssertions) && manifest.missingAssertions.length === 0, 'PR_C_EVIDENCE_MISSING');
assert(JSON.stringify(manifest.notRun) === JSON.stringify(registry.notRun), 'PR_C_EVIDENCE_NOT_RUN');

const commandById = new Map(registry.commands.map(command => [command.id, command]));
const seen = new Map();
for (const record of manifest.commands) {
  const expectedCommand = commandById.get(record.id);
  assert(expectedCommand, `PR_C_EVIDENCE_COMMAND_UNKNOWN:${record.id}`);
  assert(record.command === expectedCommand.command, `PR_C_EVIDENCE_COMMAND_SUBSTITUTED:${record.id}`);
  assert(record.environment === expectedCommand.environment, `PR_C_EVIDENCE_ENVIRONMENT:${record.id}`);
  assert(record.exitCode === 0, `PR_C_EVIDENCE_EXIT:${record.id}`);
  assert(/^[0-9a-f]{64}$/u.test(record.stdoutSha256) && /^[0-9a-f]{64}$/u.test(record.stderrSha256), `PR_C_EVIDENCE_OUTPUT_DIGEST:${record.id}`);
  assert(record.assertionCount === record.expectedAssertionCount, `PR_C_EVIDENCE_COMMAND_ASSERTIONS:${record.id}`);
  for (const marker of record.assertions) {
    assert(marker.result === 'passed', `PR_C_EVIDENCE_ASSERTION_RESULT:${record.id}`);
    const key = markerKey(marker);
    assert(!seen.has(key), `PR_C_EVIDENCE_ASSERTION_DUPLICATE:${key}`);
    seen.set(key, marker);
  }
}

for (const assertion of registry.assertions) {
  const key = expectedKey(assertion);
  const marker = seen.get(key);
  assert(marker, `PR_C_EVIDENCE_ASSERTION_MISSING:${key}`);
  runtimeContextMatches(marker.runtimeContext, assertion.expectedRuntimeContext, key);
}
assert(seen.size === registry.assertions.length, 'PR_C_EVIDENCE_ASSERTION_EXTRA');

const evidenceByKey = new Map();
const notRunById = new Map();
for (const name of manifest.evidenceFiles) {
  assert(/^[a-z0-9._-]+\.evidence\.json$/u.test(name), `PR_C_EVIDENCE_FILE_NAME:${name}`);
  const document = JSON.parse(readFileSync(path.join(evidenceDir, name), 'utf8'));
  assert(document.contractVersion === 'governed-delivery-monitor-pr-c-assertion-evidence-1', `PR_C_ASSERTION_FILE_VERSION:${name}`);
  assert(document.acceptedMainBaseline === PR_C_BASE_SHA && document.exactHead === exactHead && document.workingTreeDigest === workingTreeDigest, `PR_C_ASSERTION_FILE_IDENTITY:${name}`);
  assert(document.workflowPath === PR_C_WORKFLOW_PATH, `PR_C_ASSERTION_FILE_WORKFLOW:${name}`);
  if (document.result === 'passed') {
    const key = [document.command?.id, document.assertion?.owner, document.assertion?.testId, document.assertion?.assertionId, document.assertion?.fixture].join('|');
    assert(!evidenceByKey.has(key), `PR_C_ASSERTION_FILE_DUPLICATE:${key}`);
    evidenceByKey.set(key, document);
  } else {
    assert(document.result === 'not_run' && document.command === null, `PR_C_ASSERTION_FILE_RESULT:${name}`);
    assert(!notRunById.has(document.assertion?.testId), `PR_C_NOT_RUN_FILE_DUPLICATE:${name}`);
    notRunById.set(document.assertion?.testId, document);
  }
}
for (const assertion of registry.assertions) {
  const key = expectedKey(assertion);
  const document = evidenceByKey.get(key);
  assert(document, `PR_C_ASSERTION_FILE_MISSING:${key}`);
  assert(JSON.stringify(document.assertion.ownerBinding) === JSON.stringify(registry.owners[assertion.owner]), `PR_C_ASSERTION_FILE_OWNER:${key}`);
  assert(document.assertion.testName === assertion.testName, `PR_C_ASSERTION_FILE_TEST_NAME:${key}`);
  runtimeContextMatches(document.assertion.runtimeContext, assertion.expectedRuntimeContext, `file:${key}`);
}
for (const boundary of registry.notRun) {
  const document = notRunById.get(boundary.testId);
  assert(document, `PR_C_NOT_RUN_FILE_MISSING:${boundary.testId}`);
  assert(document.assertion.reason === boundary.reason && document.assertion.testName === boundary.testName, `PR_C_NOT_RUN_FILE_SUBSTITUTED:${boundary.testId}`);
  assert(JSON.stringify(document.assertion.ownerBinding) === JSON.stringify(registry.owners[boundary.owner]), `PR_C_NOT_RUN_FILE_OWNER:${boundary.testId}`);
}

const commandResultsPath = path.join(evidenceDir, manifest.commandResultsFile);
assert(existsSync(commandResultsPath), 'PR_C_COMMAND_RESULTS_MISSING');
const commandResultsText = readFileSync(commandResultsPath, 'utf8').replace(/\r\n?/gu, '\n');
assert(sha256(commandResultsText) === manifest.commandResultsSha256, 'PR_C_COMMAND_RESULTS_DIGEST');
const commandResults = JSON.parse(commandResultsText);
assert(commandResults.exactHead === exactHead && commandResults.workingTreeDigest === workingTreeDigest, 'PR_C_COMMAND_RESULTS_IDENTITY');
assert(JSON.stringify(commandResults.commands) === JSON.stringify(manifest.commands), 'PR_C_COMMAND_RESULTS_SUBSTITUTED');

const digestPath = path.join(evidenceDir, 'manifest.sha256');
assert(existsSync(digestPath), 'PR_C_EVIDENCE_DIGEST_MISSING');
const expectedDigest = readFileSync(digestPath, 'utf8').trim().split(/\s+/u)[0];
assert(expectedDigest === sha256(manifestBytes), 'PR_C_EVIDENCE_DIGEST');

console.log(`PR C evidence verified: ${JSON.stringify({ exactHead, commands: manifest.commandCount, assertions: manifest.assertionCount, notRun: manifest.notRun.length, workingTreeDigest })}`);
