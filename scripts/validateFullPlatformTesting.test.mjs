import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fileSha256,
  expectedRunBindings,
  loadCampaignDefinition,
  validateCampaignDefinition,
  validateRunEvidence,
} from './validateFullPlatformTesting.mjs';

const clone = value => structuredClone(value);

const createValidRun = (definition, testId = 'SAFETY-005') => {
  const testCase = definition.catalog.cases.find(item => item.testId === testId);
  const bindings = expectedRunBindings(testId, definition.bindings);
  return {
    schemaVersion: 'avalaos-full-platform-run-evidence/v1',
    campaignId: definition.campaign.campaignId,
    runId: 'synthetic-validation-001',
    status: 'blocked',
    executionIdentity: {
      headSha: 'a'.repeat(40),
      workflowPath: '.github/workflows/exhaustive-acceptance.yml',
      runId: '123456',
      runAttempt: 1,
      latestRunAttempt: 1,
      environment: 'disposable_ci',
      organizationId: '97000000-0000-4000-8000-000000000010',
      workspaceId: '97000000-0000-4000-8000-000000000011',
    },
    coverage: {
      catalogCases: definition.catalog.cases.length,
      recordedTestIds: 1,
      complete: false,
    },
    testResults: [{
      testId,
      bindingResults: bindings.map(binding => ({
        bindingKind: binding.bindingKind,
        ownerId: binding.ownerId,
        canonicalCommand: [...binding.canonicalCommand],
        suiteExitCode: 0,
        assertionOutcomes: binding.assertionIds.map(assertionId => ({ assertionId, outcome: 'passed' })),
      })),
      sourceProof: testCase.sourceReference.map(sourcePath => ({ path: sourcePath, sha256: fileSha256(sourcePath) })),
      status: 'executed evidence',
    }],
    browserSession: {
      testIds: ['SANDBOX-003', 'SANDBOX-004', 'SANDBOX-006', 'SANDBOX-007', 'SANDBOX-008', 'SANDBOX-009'],
      personasCompleted: definition.personas.personas.map(item => item.label),
      observer: {
        startedBeforeEntry: true,
        endedAfterSignOutQuietWindow: true,
        quietWindowRestartedOnLateRequest: true,
        postObserverProviderRequests: [],
      },
      routeAssertions: [
        { pathClass: 'sandbox_descendant', classification: 'accepted_synthetic' },
        { pathClass: 'authenticated_entry', classification: 'separate_authenticated_entry' },
      ],
    },
    sanitization: {
      rawSecrets: false,
      rawPrompts: false,
      rawResponses: false,
      rawLogs: false,
      signedUrls: false,
      customerData: false,
      realProviderIdentifiers: false,
      productionIdentifiers: false,
    },
  };
};

const expectError = (errors, expected) => assert.ok(errors.some(error => error === expected || error.startsWith(`${expected}:`)), `expected ${expected}; received ${errors.join(', ')}`);

test('tracked campaign covers exact canonical source, view, persona, relationship, and synthetic-scope contracts', () => {
  const definition = loadCampaignDefinition();
  assert.deepEqual(validateCampaignDefinition(definition), []);
});

test('campaign rejects a missing canonical acceptance case', () => {
  const definition = clone(loadCampaignDefinition());
  definition.groups[0].testIds.pop();
  expectError(validateCampaignDefinition(definition), 'case-group-catalog-coverage');
});

test('campaign rejects self-declared source-backed execution status', () => {
  const definition = clone(loadCampaignDefinition());
  definition.groups[0].coverageStatus = 'SOURCE_BACKED';
  expectError(validateCampaignDefinition(definition), 'case-group-evidence-claim');
});

test('campaign rejects generated evidence routed under tracked definitions', () => {
  const definition = clone(loadCampaignDefinition());
  definition.campaign.outputRoot = 'testing/full-platform/output';
  expectError(validateCampaignDefinition(definition), 'campaign-outputRoot');
  expectError(validateCampaignDefinition(definition), 'generated-output-inside-tracked-definition');
});

test('campaign rejects a live provider gate without exact model and numeric ceilings', () => {
  const definition = clone(loadCampaignDefinition());
  definition.providerPolicy.liveCallsEnabled = true;
  expectError(validateCampaignDefinition(definition), 'provider-live-ceiling');
  expectError(validateCampaignDefinition(definition), 'provider-live-model');
});

test('campaign rejects a widened local provider diagnostic ceiling', () => {
  const definition = clone(loadCampaignDefinition());
  definition.providerPolicy.localDiagnosticGate.hardCeilings.campaignRequests = 3;
  expectError(validateCampaignDefinition(definition), 'provider-diagnostic-ceilings');
});

test('canonical sanitized partial evidence validates only as a blocked campaign', () => {
  const definition = loadCampaignDefinition();
  assert.deepEqual(validateRunEvidence(createValidRun(definition), definition), []);
});

test('a partial result set cannot claim full executed campaign evidence', () => {
  const definition = loadCampaignDefinition();
  const run = createValidRun(definition);
  run.status = 'executed evidence';
  expectError(validateRunEvidence(run, definition), 'partial-campaign-executed-claim');
});

test('duplicate Test-ID results cannot inflate campaign coverage', () => {
  const definition = loadCampaignDefinition();
  const run = createValidRun(definition);
  run.testResults.push(clone(run.testResults[0]));
  expectError(validateRunEvidence(run, definition), 'duplicate-test-results');
});

test('a substituted suite owner is rejected even when its command is canonical', () => {
  const definition = loadCampaignDefinition();
  const run = createValidRun(definition);
  run.testResults[0].bindingResults[0].ownerId = 'substituted-suite';
  expectError(validateRunEvidence(run, definition), 'canonical-binding-set');
});

test('green suite exit cannot hide a skipped exact assertion', () => {
  const definition = loadCampaignDefinition();
  const run = createValidRun(definition);
  run.testResults[0].bindingResults[0].assertionOutcomes[0].outcome = 'skipped';
  const errors = validateRunEvidence(run, definition);
  expectError(errors, 'green-suite-skipped-assertion');
  expectError(errors, 'assertion-not-passed');
});

test('wrong tenant/workspace execution binding fails closed', () => {
  const definition = loadCampaignDefinition();
  const run = createValidRun(definition);
  run.executionIdentity.workspaceId = '98000000-0000-4000-8000-000000000011';
  expectError(validateRunEvidence(run, definition), 'execution-scope-mismatch');
});

test('stale workflow run attempt is rejected', () => {
  const definition = loadCampaignDefinition();
  const run = createValidRun(definition);
  run.executionIdentity.latestRunAttempt = 2;
  expectError(validateRunEvidence(run, definition), 'stale-run-attempt');
});

test('substituted command is rejected', () => {
  const definition = loadCampaignDefinition();
  const run = createValidRun(definition);
  run.testResults[0].bindingResults[0].canonicalCommand = ['npm', 'run', 'test'];
  expectError(validateRunEvidence(run, definition), 'canonical-command');
});

test('hosted-only result binds both exact device assertions to the canonical hosted command', () => {
  const definition = loadCampaignDefinition();
  const run = createValidRun(definition, 'SANDBOX-001');
  assert.deepEqual(validateRunEvidence(run, definition), []);
  assert.equal(run.testResults[0].bindingResults[0].bindingKind, 'hosted-scenario');
  assert.equal(run.testResults[0].bindingResults[0].assertionOutcomes.length, 2);
});

test('oracle-only result binds the canonical scenario assertion and execution command', () => {
  const definition = loadCampaignDefinition();
  const run = createValidRun(definition, 'ASSESS-005');
  assert.deepEqual(validateRunEvidence(run, definition), []);
  assert.equal(run.testResults[0].bindingResults[0].bindingKind, 'oracle-scenario');
});

test('composite evidence rejects an omitted hosted or server component', () => {
  const definition = loadCampaignDefinition();
  const composite = definition.bindings.serverTests.find(server => definition.bindings.hostedTests.some(hosted => hosted.testId === server.testId));
  assert.ok(composite, 'canonical bindings must retain at least one composite case');
  const run = createValidRun(definition, composite.testId);
  assert.equal(run.testResults[0].bindingResults.length, 2);
  run.testResults[0].bindingResults.pop();
  expectError(validateRunEvidence(run, definition), 'composite-binding-incomplete');
});

test('fake source proof is rejected', () => {
  const definition = loadCampaignDefinition();
  const run = createValidRun(definition);
  run.testResults[0].sourceProof[0].sha256 = `sha256:${'0'.repeat(64)}`;
  expectError(validateRunEvidence(run, definition), 'source-proof-digest');
});

test('partial persona coverage is rejected', () => {
  const definition = loadCampaignDefinition();
  const run = createValidRun(definition);
  run.browserSession.personasCompleted.pop();
  expectError(validateRunEvidence(run, definition), 'browser-partial-persona-coverage');
});

test('post-observer provider traffic is rejected', () => {
  const definition = loadCampaignDefinition();
  const run = createValidRun(definition);
  run.browserSession.observer.postObserverProviderRequests.push('sanitized-provider-request');
  expectError(validateRunEvidence(run, definition), 'post-observer-provider-traffic');
});

test('accepted Sandbox descendant cannot be relabeled as denied', () => {
  const definition = loadCampaignDefinition();
  const run = createValidRun(definition);
  run.browserSession.routeAssertions[0].classification = 'separate_authenticated_entry';
  expectError(validateRunEvidence(run, definition), 'accepted-denied-route-confusion');
});
