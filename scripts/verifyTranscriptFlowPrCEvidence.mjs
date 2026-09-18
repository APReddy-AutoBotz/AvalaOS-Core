import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  applicablePrCNotRun,
  buildPrCAssertionSourceRecord,
  buildPrCNotRunSourceRecord,
  canonicalPrCJson,
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
} from './transcriptFlowPrCEvidenceContract.mjs';
import {
  assertPrCCanonicalEvidenceDirectory,
  derivePrCExecutionIdentity,
  prCExecutionProof,
  resolvePrCCanonicalEvidenceDirectory,
} from './transcriptFlowPrCExecutionIdentity.mjs';
import { calculatePrCWorkingTreeDigest, collectChangedPrCFiles } from './transcriptFlowPrCEvidenceScope.mjs';

const assert = (condition, code) => { if (!condition) throw new Error(code); };
const markerKey = marker => [marker.commandId, marker.owner, marker.testId, marker.assertionId, marker.fixture].join('|');
const expectedKey = assertion => [assertion.commandId, assertion.owner, assertion.testId, assertion.assertionId, assertion.fixture].join('|');
const same = (actual, expected, code) => assert(canonicalPrCJson(actual) === canonicalPrCJson(expected), code);
const notApplicable = { applicability: 'not_applicable', value: null };
const exactKeys = (value, keys, code) => {
  assert(value && typeof value === 'object' && !Array.isArray(value), code);
  assert(canonicalPrCJson(Object.keys(value).sort()) === canonicalPrCJson([...keys].sort()), code);
};

export const verifyPrCEvidenceDirectory = ({ root, evidenceDir, identity, registry, changedFiles }) => {
  assertPrCCanonicalEvidenceDirectory(root, identity, evidenceDir);
  const manifestPath = path.join(evidenceDir, 'manifest.json');
  assert(existsSync(manifestPath), 'PR_C_EVIDENCE_MANIFEST_MISSING');
  const manifestBytes = readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const effectiveNotRun = applicablePrCNotRun(registry, identity.executionClassification);

  exactKeys(manifest, [
    'assertionCount', 'assertionFileCount', 'changedFileCount', 'changedFiles', 'commandCount', 'commandResultsFile',
    'commandResultsSha256', 'commands', 'completedAt', 'contractVersion', 'evidenceFiles', 'identity', 'missingAssertions',
    'notRun', 'notRunFileCount', 'registryContract', 'result', 'verification',
  ], 'PR_C_EVIDENCE_MANIFEST_FIELDS');
  assert(manifest.contractVersion === PR_C_MANIFEST_VERSION, 'PR_C_EVIDENCE_VERSION');
  assert(manifest.result === 'passed', 'PR_C_EVIDENCE_RESULT');
  same(manifest.identity, identity, 'PR_C_EVIDENCE_IDENTITY');
  same(manifest.verification, prCExecutionProof(identity), 'PR_C_EVIDENCE_PROOF_CLASSIFICATION');
  assert(manifest.changedFileCount === changedFiles.length, 'PR_C_EVIDENCE_CHANGED_FILE_COUNT');
  same(manifest.changedFiles, changedFiles, 'PR_C_EVIDENCE_FILE_SET');
  assert(manifest.commandCount === registry.commands.length, 'PR_C_EVIDENCE_COMMAND_COUNT');
  assert(manifest.assertionCount === registry.assertions.length, 'PR_C_EVIDENCE_ASSERTION_COUNT');
  assert(manifest.assertionFileCount === registry.assertions.length, 'PR_C_EVIDENCE_ASSERTION_FILE_COUNT');
  assert(manifest.notRunFileCount === effectiveNotRun.length, 'PR_C_EVIDENCE_NOT_RUN_FILE_COUNT');
  assert(Array.isArray(manifest.evidenceFiles) && manifest.evidenceFiles.length === registry.assertions.length + effectiveNotRun.length, 'PR_C_EVIDENCE_FILE_COUNT');
  assert(new Set(manifest.evidenceFiles).size === manifest.evidenceFiles.length, 'PR_C_EVIDENCE_FILE_DUPLICATE');
  assert(Array.isArray(manifest.missingAssertions) && manifest.missingAssertions.length === 0, 'PR_C_EVIDENCE_MISSING');
  same(manifest.notRun, effectiveNotRun, 'PR_C_EVIDENCE_NOT_RUN');
  assert(manifest.commandResultsFile === 'command-results.json', 'PR_C_COMMAND_RESULTS_FILE');
  const personaCatalog = JSON.parse(readFileSync(path.join(root, registry.personasRegistryPath), 'utf8'));
  same(manifest.registryContract, {
    commandCount: registry.commands.length,
    assertionCount: registry.assertions.length,
    ownerCount: Object.keys(registry.owners).length,
    notRunCount: registry.notRun.length,
    personaCount: personaCatalog.personas.length,
    requiredPersonaCount: personaCatalog.personas.filter(persona => persona.evidenceRequired).length,
  }, 'PR_C_EVIDENCE_REGISTRY_CONTRACT');

  assert(Array.isArray(manifest.commands) && manifest.commands.length === registry.commands.length, 'PR_C_EVIDENCE_COMMAND_RECORD_COUNT');
  const commandRecordsById = new Map();
  const seen = new Map();
  for (const [index, record] of manifest.commands.entries()) {
    const expectedCommand = registry.commands[index];
    exactKeys(record, [
      'assertionCount', 'assertions', 'command', 'commandRecordDigest', 'durationMs', 'environment', 'exitCode',
      'expectedAssertionCount', 'id', 'identity', 'requiredEnvironment', 'startedAt', 'stderrSha256', 'stdoutSha256',
    ], `PR_C_EVIDENCE_COMMAND_FIELDS:${record.id}`);
    assert(record.id === expectedCommand.id, `PR_C_EVIDENCE_COMMAND_ORDER:${record.id}`);
    assert(!commandRecordsById.has(record.id), `PR_C_EVIDENCE_COMMAND_DUPLICATE:${record.id}`);
    same(record.identity, identity, `PR_C_EVIDENCE_COMMAND_IDENTITY:${record.id}`);
    assert(record.command === expectedCommand.command, `PR_C_EVIDENCE_COMMAND_SUBSTITUTED:${record.id}`);
    assert(record.environment === expectedCommand.environment, `PR_C_EVIDENCE_ENVIRONMENT:${record.id}`);
    same(record.requiredEnvironment, expectedCommand.requiredEnvironment || [], `PR_C_EVIDENCE_REQUIRED_ENVIRONMENT:${record.id}`);
    assert(record.exitCode === 0, `PR_C_EVIDENCE_EXIT:${record.id}`);
    assert(/^[0-9a-f]{64}$/u.test(record.stdoutSha256) && /^[0-9a-f]{64}$/u.test(record.stderrSha256), `PR_C_EVIDENCE_OUTPUT_DIGEST:${record.id}`);
    assert(record.commandRecordDigest === prCCommandRecordDigest(record), `PR_C_EVIDENCE_COMMAND_RECORD_DIGEST:${record.id}`);
    const expectedCount = registry.assertions.filter(assertion => assertion.commandId === record.id).length;
    assert(record.expectedAssertionCount === expectedCount && record.assertionCount === expectedCount, `PR_C_EVIDENCE_COMMAND_ASSERTIONS:${record.id}`);
    assert(Array.isArray(record.assertions) && record.assertions.length === expectedCount, `PR_C_EVIDENCE_COMMAND_MARKERS:${record.id}`);
    for (const marker of record.assertions) {
      exactKeys(marker, ['assertionId', 'commandId', 'fixture', 'owner', 'result', 'runtimeContext', 'testId'], `PR_C_EVIDENCE_MARKER_FIELDS:${record.id}`);
      assert(marker.result === 'passed', `PR_C_EVIDENCE_ASSERTION_RESULT:${record.id}`);
      const key = markerKey(marker);
      assert(!seen.has(key), `PR_C_EVIDENCE_ASSERTION_DUPLICATE:${key}`);
      seen.set(key, marker);
    }
    commandRecordsById.set(record.id, record);
  }

  for (const assertion of registry.assertions) {
    const key = expectedKey(assertion);
    const marker = seen.get(key);
    assert(marker, `PR_C_EVIDENCE_ASSERTION_MISSING:${key}`);
    runtimeContextMatches(marker.runtimeContext, assertion.expectedRuntimeContext, key);
  }
  assert(seen.size === registry.assertions.length, 'PR_C_EVIDENCE_ASSERTION_EXTRA');

  const bindingCatalog = loadPrCEvidenceBindingCatalog(root, registry);
  const evidenceByKey = new Map();
  const notRunById = new Map();
  const diskEvidenceFiles = readdirSync(evidenceDir).filter(name => name.endsWith('.evidence.json')).sort();
  same([...manifest.evidenceFiles].sort(), diskEvidenceFiles, 'PR_C_EVIDENCE_DISK_FILE_SET');
  for (const name of manifest.evidenceFiles) {
    assert(path.basename(name) === name && /^[a-z0-9._-]+\.evidence\.json$/u.test(name), `PR_C_EVIDENCE_FILE_NAME:${name}`);
    const document = JSON.parse(readFileSync(path.join(evidenceDir, name), 'utf8'));
    exactKeys(document, ['assertion', 'command', 'contractVersion', 'identity', 'result', 'sourceRecord', 'sourceRecordDigest'], `PR_C_ASSERTION_FILE_FIELDS:${name}`);
    assert(document.contractVersion === PR_C_EVIDENCE_VERSION, `PR_C_ASSERTION_FILE_VERSION:${name}`);
    same(document.identity, identity, `PR_C_ASSERTION_FILE_IDENTITY:${name}`);
    assert(document.sourceRecordDigest === prCCanonicalDigest(document.sourceRecord), `PR_C_ASSERTION_SOURCE_DIGEST:${name}`);
    if (document.result === 'passed') {
      const key = [document.command?.id, document.assertion?.owner, document.assertion?.testId, document.assertion?.assertionId, document.assertion?.fixture].join('|');
      assert(!evidenceByKey.has(key), `PR_C_ASSERTION_FILE_DUPLICATE:${key}`);
      evidenceByKey.set(key, document);
    } else {
      assert(document.result === 'not_run', `PR_C_ASSERTION_FILE_RESULT:${name}`);
      same(document.command, notApplicable, `PR_C_NOT_RUN_COMMAND:${name}`);
      assert(name === `not-run-${document.assertion?.testId?.toLowerCase()}.evidence.json`, `PR_C_NOT_RUN_FILE_NAME:${name}`);
      assert(!notRunById.has(document.assertion?.testId), `PR_C_NOT_RUN_FILE_DUPLICATE:${name}`);
      notRunById.set(document.assertion?.testId, document);
    }
  }

  for (const assertion of registry.assertions) {
    const key = expectedKey(assertion);
    const document = evidenceByKey.get(key);
    const marker = seen.get(key);
    const command = registry.commands.find(item => item.id === assertion.commandId);
    const commandRecord = commandRecordsById.get(assertion.commandId);
    assert(document && command && commandRecord, `PR_C_ASSERTION_FILE_MISSING:${key}`);
    same(document.command, {
      id: command.id,
      command: command.command,
      environment: command.environment,
      requiredEnvironment: command.requiredEnvironment || [],
      commandRecordDigest: commandRecord.commandRecordDigest,
    }, `PR_C_ASSERTION_FILE_COMMAND:${key}`);
    same(document.assertion, {
      owner: assertion.owner,
      ownerBinding: registry.owners[assertion.owner],
      testId: assertion.testId,
      assertionId: assertion.assertionId,
      fixture: assertion.fixture,
      testName: assertion.testName,
      runtimeContext: marker.runtimeContext,
    }, `PR_C_ASSERTION_FILE_SUBSTITUTED:${key}`);
    runtimeContextMatches(document.assertion.runtimeContext, assertion.expectedRuntimeContext, `file:${key}`);
    const expectedSourceRecord = buildPrCAssertionSourceRecord({
      registry,
      bindingCatalog,
      assertion,
      observedRuntimeContext: marker.runtimeContext,
      commandRecordDigest: commandRecord.commandRecordDigest,
    });
    same(document.sourceRecord, expectedSourceRecord, `PR_C_ASSERTION_SOURCE_SUBSTITUTED:${key}`);
  }

  for (const boundary of effectiveNotRun) {
    const document = notRunById.get(boundary.testId);
    assert(document, `PR_C_NOT_RUN_FILE_MISSING:${boundary.testId}`);
    same(document.assertion, {
      owner: boundary.owner,
      ownerBinding: registry.owners[boundary.owner],
      testId: boundary.testId,
      assertionId: notApplicable,
      fixture: notApplicable,
      persona: notApplicable,
      runtimeContext: notApplicable,
      testName: boundary.testName,
      reason: boundary.reason,
    }, `PR_C_NOT_RUN_FILE_SUBSTITUTED:${boundary.testId}`);
    same(document.sourceRecord, buildPrCNotRunSourceRecord({ registry, boundary }), `PR_C_NOT_RUN_SOURCE_SUBSTITUTED:${boundary.testId}`);
  }
  assert(evidenceByKey.size === registry.assertions.length, 'PR_C_ASSERTION_FILE_EXTRA');
  assert(notRunById.size === effectiveNotRun.length, 'PR_C_NOT_RUN_FILE_EXTRA');

  const commandResultsPath = path.join(evidenceDir, manifest.commandResultsFile);
  assert(existsSync(commandResultsPath), 'PR_C_COMMAND_RESULTS_MISSING');
  const commandResultsText = readFileSync(commandResultsPath, 'utf8');
  assert(prCSha256(commandResultsText) === manifest.commandResultsSha256, 'PR_C_COMMAND_RESULTS_DIGEST');
  const commandResults = JSON.parse(commandResultsText);
  exactKeys(commandResults, ['commands', 'contractVersion', 'identity'], 'PR_C_COMMAND_RESULTS_FIELDS');
  assert(commandResults.contractVersion === PR_C_COMMAND_RESULTS_VERSION, 'PR_C_COMMAND_RESULTS_VERSION');
  same(commandResults.identity, identity, 'PR_C_COMMAND_RESULTS_IDENTITY');
  same(commandResults.commands, manifest.commands, 'PR_C_COMMAND_RESULTS_SUBSTITUTED');

  const digestPath = path.join(evidenceDir, 'manifest.sha256');
  assert(existsSync(digestPath), 'PR_C_EVIDENCE_DIGEST_MISSING');
  const expectedDigest = readFileSync(digestPath, 'utf8').trim().split(/\s+/u)[0];
  assert(expectedDigest === prCSha256(manifestBytes), 'PR_C_EVIDENCE_DIGEST');
  return { manifest, commandResults, results: [...evidenceByKey.values(), ...notRunById.values()] };
};

const main = () => {
  const root = process.cwd();
  const { registry, provenance } = loadPrCContract(root);
  validatePrCRegistryStructure(root, registry, provenance);
  const exactHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const changedFiles = collectChangedPrCFiles(root);
  const workingTreeDigest = calculatePrCWorkingTreeDigest(root, changedFiles);
  const identity = derivePrCExecutionIdentity({ exactHead, workingTreeDigest });
  const canonicalEvidenceDir = resolvePrCCanonicalEvidenceDirectory(root, identity);
  const evidenceDir = process.env.PR_C_EVIDENCE_DIR ? path.resolve(process.env.PR_C_EVIDENCE_DIR) : canonicalEvidenceDir;
  assertPrCCanonicalEvidenceDirectory(root, identity, evidenceDir);
  const verified = verifyPrCEvidenceDirectory({ root, evidenceDir, identity, registry, changedFiles });
  console.log(`PR C evidence verified: ${JSON.stringify({ identity, commands: verified.manifest.commandCount, assertions: verified.manifest.assertionCount, notRun: verified.manifest.notRun.length })}`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
