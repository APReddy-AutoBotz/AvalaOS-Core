import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildPrCAssertionSourceRecord,
  buildPrCNotRunSourceRecord,
  loadPrCEvidenceBindingCatalog,
  PR_C_COMMAND_RESULTS_VERSION,
  PR_C_EVIDENCE_VERSION,
  PR_C_MANIFEST_VERSION,
  prCCanonicalDigest,
  prCCommandRecordDigest,
  prCSha256,
} from './transcriptFlowPrCEvidenceContract.mjs';
import {
  derivePrCExecutionIdentity,
  prCExecutionProof,
  resolvePrCCanonicalEvidenceDirectory,
} from './transcriptFlowPrCExecutionIdentity.mjs';
import { PR_C_BASE_SHA, PR_C_WORKFLOW_PATH } from './transcriptFlowPrCEvidenceScope.mjs';
import { verifyPrCEvidenceDirectory } from './verifyTranscriptFlowPrCEvidence.mjs';

const head = 'a'.repeat(40);
const tree = 'b'.repeat(64);
const notApplicable = { applicability: 'not_applicable', value: null };
const localEnv = attempt => ({
  GITHUB_ACTIONS: 'false',
  PR_C_EXECUTION_CLASSIFICATION: 'local_candidate',
  PR_C_BASE_SHA: PR_C_BASE_SHA,
  PR_C_EXACT_HEAD_SHA: head,
  PR_C_WORKFLOW_PATH: PR_C_WORKFLOW_PATH,
  PR_C_LOCAL_RUN_ID: 'local-verifier',
  PR_C_LOCAL_RUN_ATTEMPT: attempt,
});

const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');

const createBundle = () => {
  const root = mkdtempSync(path.join(tmpdir(), 'avalaos-pr-c-evidence-verifier-'));
  const fixtureRegistryPath = 'testing/process-lifecycle/fixtures/delivery-monitor-pr-c/fixture-registry.json';
  const personasRegistryPath = 'testing/process-lifecycle/fixtures/delivery-monitor-pr-c/personas.json';
  mkdirSync(path.join(root, path.dirname(fixtureRegistryPath)), { recursive: true });
  writeJson(path.join(root, fixtureRegistryPath), {
    schemaVersion: 'delivery-monitor-pr-c-fixtures-1',
    fixtures: [{ id: 'FIXTURE-1', covers: ['DELIVERY-TR-001'], oracle: 'Synthetic verifier fixture with exact causal ownership.', sourcePaths: ['source.ts'] }],
  });
  writeJson(path.join(root, personasRegistryPath), { schemaVersion: 'delivery-monitor-pr-c-personas-1', personas: [] });

  const command = { id: 'focused', command: 'node scripts/focused.mjs', environment: 'controlled-node-22' };
  const runtimeContext = {
    persona: { id: '10000000-0000-4000-8000-000000000001', state: 'active', capabilities: ['delivery.read'] },
    organizationId: '20000000-0000-4000-8000-000000000001',
    workspaceId: '30000000-0000-4000-8000-000000000001',
  };
  const assertion = {
    commandId: command.id,
    owner: 'domain',
    testId: 'DELIVERY-TR-001',
    assertionId: 'exact-source-binding',
    fixture: 'FIXTURE-1',
    testName: 'Exact source binding',
    expectedRuntimeContext: runtimeContext,
  };
  const notRun = [
    {
      testId: 'EXACT-HEAD-GITHUB-CI', owner: 'boundary', testName: 'Exact-head GitHub CI', command: null,
      reason: 'Local verifier evidence cannot establish GitHub Actions execution.',
      applicableExecutionClassifications: ['local_candidate'],
    },
    {
      testId: 'NETLIFY-HOSTED-PREVIEW', owner: 'boundary', testName: 'Netlify hosted preview', command: null,
      reason: 'This synthetic candidate does not execute a hosted preview.',
      applicableExecutionClassifications: ['github_candidate', 'local_candidate'],
    },
  ];
  const registry = {
    fixtureRegistryPath,
    personasRegistryPath,
    commands: [command],
    owners: {
      domain: { path: 'source.ts', sha256: 'c'.repeat(64) },
      boundary: { path: 'boundary.md', sha256: 'd'.repeat(64) },
    },
    assertions: [assertion],
    notRun,
  };
  const identity = derivePrCExecutionIdentity({ env: localEnv('30'), exactHead: head, workingTreeDigest: tree });
  const evidenceDir = resolvePrCCanonicalEvidenceDirectory(root, identity);
  mkdirSync(evidenceDir, { recursive: true });
  const marker = { ...runtimeContext };
  const record = {
    identity,
    id: command.id,
    command: command.command,
    environment: command.environment,
    requiredEnvironment: [],
    startedAt: '2026-09-03T00:00:00.000Z',
    durationMs: 1,
    exitCode: 0,
    stdoutSha256: 'e'.repeat(64),
    stderrSha256: 'f'.repeat(64),
    assertionCount: 1,
    expectedAssertionCount: 1,
    assertions: [{
      commandId: command.id,
      owner: assertion.owner,
      testId: assertion.testId,
      assertionId: assertion.assertionId,
      fixture: assertion.fixture,
      result: 'passed',
      runtimeContext: marker,
    }],
  };
  record.commandRecordDigest = prCCommandRecordDigest(record);
  const bindingCatalog = loadPrCEvidenceBindingCatalog(root, registry);
  const sourceRecord = buildPrCAssertionSourceRecord({
    registry, bindingCatalog, assertion, observedRuntimeContext: marker, commandRecordDigest: record.commandRecordDigest,
  });
  const passedName = '001-focused-delivery-tr-001.evidence.json';
  writeJson(path.join(evidenceDir, passedName), {
    contractVersion: PR_C_EVIDENCE_VERSION,
    result: 'passed',
    identity,
    command: { ...command, requiredEnvironment: [], commandRecordDigest: record.commandRecordDigest },
    assertion: {
      owner: assertion.owner,
      ownerBinding: registry.owners[assertion.owner],
      testId: assertion.testId,
      assertionId: assertion.assertionId,
      fixture: assertion.fixture,
      testName: assertion.testName,
      runtimeContext: marker,
    },
    sourceRecord,
    sourceRecordDigest: prCCanonicalDigest(sourceRecord),
  });
  const notRunNames = [];
  for (const boundary of notRun) {
    const notRunSource = buildPrCNotRunSourceRecord({ registry, boundary });
    const name = `not-run-${boundary.testId.toLowerCase()}.evidence.json`;
    writeJson(path.join(evidenceDir, name), {
      contractVersion: PR_C_EVIDENCE_VERSION,
      result: 'not_run',
      identity,
      command: notApplicable,
      assertion: {
        owner: boundary.owner,
        ownerBinding: registry.owners[boundary.owner],
        testId: boundary.testId,
        assertionId: notApplicable,
        fixture: notApplicable,
        persona: notApplicable,
        runtimeContext: notApplicable,
        testName: boundary.testName,
        reason: boundary.reason,
      },
      sourceRecord: notRunSource,
      sourceRecordDigest: prCCanonicalDigest(notRunSource),
    });
    notRunNames.push(name);
  }
  const commandResults = { contractVersion: PR_C_COMMAND_RESULTS_VERSION, identity, commands: [record] };
  const commandResultsText = `${JSON.stringify(commandResults, null, 2)}\n`;
  writeFileSync(path.join(evidenceDir, 'command-results.json'), commandResultsText, 'utf8');
  const evidenceFiles = [passedName, ...notRunNames];
  const manifest = {
    contractVersion: PR_C_MANIFEST_VERSION,
    result: 'passed',
    identity,
    verification: prCExecutionProof(identity),
    changedFileCount: 1,
    changedFiles: ['source.ts'],
    registryContract: { commandCount: 1, assertionCount: 1, ownerCount: 2, notRunCount: 2, personaCount: 0, requiredPersonaCount: 0 },
    commandCount: 1,
    assertionCount: 1,
    assertionFileCount: 1,
    notRunFileCount: notRun.length,
    evidenceFiles,
    commandResultsFile: 'command-results.json',
    commandResultsSha256: prCSha256(commandResultsText),
    commands: [record],
    notRun,
    missingAssertions: [],
    completedAt: '2026-09-03T00:00:01.000Z',
  };
  writeJson(path.join(evidenceDir, 'manifest.json'), manifest);
  const manifestBytes = readFileSync(path.join(evidenceDir, 'manifest.json'));
  writeFileSync(path.join(evidenceDir, 'manifest.sha256'), `${prCSha256(manifestBytes)}  manifest.json\n`, 'utf8');
  return { root, evidenceDir, identity, registry, changedFiles: ['source.ts'], passedName, notRunNames };
};

const updateManifest = (bundle, mutate) => {
  const file = path.join(bundle.evidenceDir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  mutate(manifest);
  writeJson(file, manifest);
  writeFileSync(path.join(bundle.evidenceDir, 'manifest.sha256'), `${prCSha256(readFileSync(file))}  manifest.json\n`, 'utf8');
};

const withBundle = (t, callback) => {
  const bundle = createBundle();
  t.after(() => rmSync(bundle.root, { recursive: true, force: true }));
  return callback(bundle);
};

test('accepts a fully identity- and source-bound local bundle', t => withBundle(t, bundle => {
  const result = verifyPrCEvidenceDirectory(bundle);
  assert.equal(result.results.length, 3);
}));

test('rejects manifest-only identity substitution and a copied attempt', t => withBundle(t, bundle => {
  updateManifest(bundle, manifest => { manifest.identity.runAttempt = '31'; });
  assert.throws(() => verifyPrCEvidenceDirectory(bundle), /PR_C_EVIDENCE_IDENTITY/u);
  const copiedIdentity = derivePrCExecutionIdentity({ env: localEnv('31'), exactHead: head, workingTreeDigest: tree });
  assert.throws(() => verifyPrCEvidenceDirectory({ ...bundle, identity: copiedIdentity }), /PR_C_EVIDENCE_CANONICAL_PATH/u);
}));

test('rejects command-result identity substitution even with refreshed outer digests', t => withBundle(t, bundle => {
  const file = path.join(bundle.evidenceDir, 'command-results.json');
  const commandResults = JSON.parse(readFileSync(file, 'utf8'));
  commandResults.identity.runId = 'local-substituted';
  const text = `${JSON.stringify(commandResults, null, 2)}\n`;
  writeFileSync(file, text, 'utf8');
  updateManifest(bundle, manifest => { manifest.commandResultsSha256 = prCSha256(text); });
  assert.throws(() => verifyPrCEvidenceDirectory(bundle), /PR_C_COMMAND_RESULTS_IDENTITY/u);
}));

test('rejects per-assertion source substitution after an attacker refreshes its digest', t => withBundle(t, bundle => {
  const file = path.join(bundle.evidenceDir, bundle.passedName);
  const document = JSON.parse(readFileSync(file, 'utf8'));
  document.sourceRecord.test.testName = 'Substituted assertion';
  document.sourceRecordDigest = prCCanonicalDigest(document.sourceRecord);
  writeJson(file, document);
  assert.throws(() => verifyPrCEvidenceDirectory(bundle), /PR_C_ASSERTION_SOURCE_SUBSTITUTED/u);
}));

test('rejects a passed assertion copied from another run attempt', t => withBundle(t, bundle => {
  const file = path.join(bundle.evidenceDir, bundle.passedName);
  const document = JSON.parse(readFileSync(file, 'utf8'));
  document.identity = derivePrCExecutionIdentity({ env: localEnv('31'), exactHead: head, workingTreeDigest: tree });
  writeJson(file, document);
  assert.throws(() => verifyPrCEvidenceDirectory(bundle), /PR_C_ASSERTION_FILE_IDENTITY/u);
}));

test('rejects a not_run record copied from another run attempt', t => withBundle(t, bundle => {
  const file = path.join(bundle.evidenceDir, bundle.notRunNames[0]);
  const document = JSON.parse(readFileSync(file, 'utf8'));
  document.identity = derivePrCExecutionIdentity({ env: localEnv('31'), exactHead: head, workingTreeDigest: tree });
  writeJson(file, document);
  assert.throws(() => verifyPrCEvidenceDirectory(bundle), /PR_C_ASSERTION_FILE_IDENTITY/u);
}));

test('rejects not_run duplication', t => withBundle(t, bundle => {
  updateManifest(bundle, manifest => {
    manifest.evidenceFiles[2] = manifest.evidenceFiles[1];
  });
  assert.throws(() => verifyPrCEvidenceDirectory(bundle), /PR_C_EVIDENCE_FILE_DUPLICATE/u);
}));

test('rejects not_run file swaps even when both documents are otherwise canonical', t => withBundle(t, bundle => {
  const first = path.join(bundle.evidenceDir, bundle.notRunNames[0]);
  const second = path.join(bundle.evidenceDir, bundle.notRunNames[1]);
  const firstText = readFileSync(first, 'utf8');
  const secondText = readFileSync(second, 'utf8');
  writeFileSync(first, secondText, 'utf8');
  writeFileSync(second, firstText, 'utf8');
  assert.throws(() => verifyPrCEvidenceDirectory(bundle), /PR_C_NOT_RUN_FILE_NAME/u);
}));

test('rejects local evidence promotion to GitHub candidate proof', t => withBundle(t, bundle => {
  const githubIdentity = {
    ...bundle.identity,
    executionClassification: 'github_candidate',
    workflowRunId: '31000001234',
    localRunId: null,
    runId: '31000001234',
    runAttempt: '1',
    canonicalEvidencePath: bundle.identity.canonicalEvidencePath,
    artifactName: 'governed-delivery-monitor-pr-c-31000001234-1',
  };
  assert.throws(() => verifyPrCEvidenceDirectory({ ...bundle, identity: githubIdentity }), /PR_C_EVIDENCE_IDENTITY/u);
}));
