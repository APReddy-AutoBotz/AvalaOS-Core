import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  BACKEND_EVIDENCE_SCHEMA,
  BROWSER_EVIDENCE_SCHEMA,
  REQUIRED_BACKEND_GLOBAL_ASSERTIONS,
  REQUIRED_BACKEND_SOURCES,
  REQUIRED_BACKEND_STAGES,
  REQUIRED_BROWSER_ASSERTIONS,
  REQUIRED_BROWSER_PROJECTS,
  REQUIRED_BROWSER_SOURCES,
  REQUIRED_BROWSER_STAGES,
  validateEnterpriseLifecycleEvidence,
  verifyEnterpriseLifecycleManifestFile,
} from './enterpriseLifecycleAcceptanceEvidence.mjs';

const hash = value => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const clone = value => JSON.parse(JSON.stringify(value));

const makeFixture = root => {
  const headSha = 'a'.repeat(40);
  const commonExecution = {
    headSha,
    runId: '123456',
    runAttempt: '2',
    startedAt: '2026-10-09T10:00:00.000Z',
    completedAt: '2026-10-09T10:01:00.000Z',
  };
  const backendExecution = { ...commonExecution, executionId: hash('backend execution') };
  const browserExecution = { ...commonExecution, executionId: hash('browser execution') };
  for (const relative of [...REQUIRED_BACKEND_SOURCES, ...REQUIRED_BROWSER_SOURCES]) {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), `// ${relative}\n`);
  }
  const sourceDigest = relative => ({ path: relative, sha256: hash(fs.readFileSync(path.join(root, relative))) });
  const binding = execution => hash(JSON.stringify({
    executionId: execution.executionId,
    runId: execution.runId,
    headSha: execution.headSha,
    logicalJourney: 'assess-govern-studio-v1',
  }));
  const backendBinding = binding(backendExecution);
  const browserBinding = binding(browserExecution);
  const assertions = Object.fromEntries(REQUIRED_BACKEND_GLOBAL_ASSERTIONS.map(id => [id, true]));
  const denied = new Set(['assess.feature-disabled', 'govern.separation-denied']);
  const deltasByStage = {
    'assess.create': [2, 2, 2, 0], 'assess.finalize': [1, 1, 1, 0], 'assess.feature-disabled': [0, 0, 0, 0],
    'govern.assign': [1, 1, 1, 0], 'govern.attest': [2, 2, 2, 0], 'govern.changes-requested': [1, 1, 1, 0],
    'govern.revise': [1, 1, 1, 0], 'govern.resubmit': [2, 2, 2, 0], 'govern.approve': [4, 4, 4, 0],
    'govern.reject': [5, 5, 5, 0], 'govern.separation-denied': [0, 0, 0, 0], 'govern.resolve': [1, 1, 1, 0],
    'studio.handoff': [2, 1, 1, 0], 'studio.consume': [6, 4, 4, 0], 'studio.generate': [1, 1, 2, 1],
    'studio.provider-failure': [1, 1, 2, 0],
  };
  const stages = REQUIRED_BACKEND_STAGES.map(id => {
    const outcome = id === 'studio.generate' ? 'generation_completed'
      : id === 'studio.provider-failure' ? 'generation_failed'
        : denied.has(id) ? 'denied' : 'committed';
    const persists = !denied.has(id);
    const hasTerminalAudit = ['studio.generate', 'studio.provider-failure'].includes(id);
    const [mutationDelta, receiptDelta, auditDelta, effectDelta] = deltasByStage[id];
    const assertionIds = [`${id}.handler`, `${id}.state`];
    if (outcome === 'denied') assertionIds.push(`${id}.zero-effects`, `${id}.error-code`);
    else assertionIds.push(`${id}.receipt`, `${id}.audit`);
    if (id === 'studio.generate') assertionIds.push('studio.generate.artifact-version', 'studio.generate.provider-synthetic');
    if (id === 'studio.provider-failure') assertionIds.push('studio.provider-failure.no-artifact-version', 'studio.provider-failure.failure-code');
    if (id === 'govern.separation-denied') assertionIds.push('govern.separation-denied.final-reviewer');
    if (id === 'govern.resolve') assertionIds.push('govern.resolve.actions-bound');
    for (const assertionId of assertionIds) assertions[assertionId] = true;
    return {
      id,
      outcome,
      mutationDelta,
      receiptDelta,
      auditDelta,
      effectDelta,
      errorCode: id === 'assess.feature-disabled' ? 'FEATURE_DISABLED'
        : id === 'govern.separation-denied' ? 'INVALID_COMMAND'
          : id === 'studio.provider-failure' ? 'PROVIDER_REQUEST_FAILED' : null,
      assertionIds,
      ...(persists ? {
        persistence: {
          receiptCount: receiptDelta,
          auditCount: auditDelta,
          bindings: Array.from({ length: receiptDelta }, () => ({
            tenantBound: true,
            actorBound: true,
            requestBound: true,
            commandBound: true,
            resourceBound: true,
            terminalBound: true,
            terminalAuditRequired: hasTerminalAudit,
            terminalAuditBound: true,
            duplicateFree: true,
          })),
        },
      } : {}),
    };
  });
  const backend = {
    schemaVersion: BACKEND_EVIDENCE_SCHEMA,
    status: 'passed',
    execution: backendExecution,
    journeyBinding: backendBinding,
    scope: { organizationHash: hash('backend org'), workspaceHash: hash('backend workspace'), caseHash: hash('backend case'), executionHash: backendExecution.executionId },
    stages,
    assertions,
    lineage: {
      sourceVersionImmutable: true,
      decisionBound: true,
      reviewBound: true,
      governBound: true,
      handoffBound: true,
      studioSourceBound: true,
    },
    negativeControls: {
      exactReplayZeroEffects: true,
      changedPayloadConflict: true,
      staleAuthorityDenied: true,
      revokedAuthorityDenied: true,
      crossTenantNonDisclosure: true,
      nonServiceDenied: true,
      browserClaimsIgnored: true,
      authorReviewerDenied: true,
      responseLossReconciled: true,
    },
    providerEffects: {
      paidCalls: 0, calls: 0, syntheticProviderCalls: 2, egressAttempts: 0, egress: 0,
      browserSecrets: false, realProviderAllowed: false, providerMode: 'synthetic-production-pipeline',
      syntheticAdapterEnabled: true, forbiddenNetworkGuardTriggered: true,
    },
    cleanup: { attempted: true, succeeded: true, residualRows: 0 },
    sourceDigests: REQUIRED_BACKEND_SOURCES.map(sourceDigest),
  };
  const browser = {
    schemaVersion: BROWSER_EVIDENCE_SCHEMA,
    status: 'passed',
    execution: browserExecution,
    journeyBinding: browserBinding,
    scope: { organizationHash: hash('browser org'), workspaceHash: hash('browser workspace'), caseHash: hash('browser case'), executionHash: browserExecution.executionId },
    projects: REQUIRED_BROWSER_PROJECTS.map(name => ({
      project: name,
      device: name,
      status: 'passed',
      assertions: REQUIRED_BROWSER_ASSERTIONS.map(id => ({ id, observed: true })),
      network: { observedHttpRequests: 20, nonLoopbackRequests: 0 },
      stages: REQUIRED_BROWSER_STAGES.map(id => ({
        id,
        actor: 'synthetic-role',
        outcome: id.includes('denial') ? 'denied' : 'observed',
        uiObserved: true,
        reloadObserved: id === 'reload-committed-state',
        errorCode: id.includes('denial') ? 'EXPECTED_DENIAL' : null,
      })),
    })),
    network: { observedHttpRequests: REQUIRED_BROWSER_PROJECTS.length * 20, nonLoopbackRequests: 0 },
    providerEffects: {
      paidCalls: 0, calls: 0, syntheticProviderCalls: 2, egressAttempts: 0, egress: 0,
      browserSecrets: false, realProviderAllowed: false, syntheticAdapterEnabled: true,
      providerMode: 'synthetic-production-pipeline', forbiddenNetworkGuardTriggered: true,
    },
    cleanup: { backendAttempted: true, backendSucceeded: true, browserContextsClosed: true },
    sourceDigests: REQUIRED_BROWSER_SOURCES.map(sourceDigest),
  };
  const backendPath = 'output/acceptance/enterprise-lifecycle/backend-evidence.json';
  const browserPath = 'output/acceptance/enterprise-lifecycle/browser-evidence.json';
  fs.mkdirSync(path.join(root, 'output/acceptance/enterprise-lifecycle'), { recursive: true });
  fs.writeFileSync(path.join(root, backendPath), `${JSON.stringify(backend)}\n`);
  fs.writeFileSync(path.join(root, browserPath), `${JSON.stringify(browser)}\n`);
  return { backend, browser, backendPath, browserPath, expected: { headSha, runId: '123456', runAttempt: '2' } };
};

test('connected lifecycle evidence binds actual same-run backend and browser proof and re-verifies its manifest', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'connected-lifecycle-evidence-'));
  try {
    const fixture = makeFixture(root);
    const result = validateEnterpriseLifecycleEvidence({ ...fixture, repositoryRoot: root });
    assert.equal(result.ok, true, result.errors.join(', '));
    assert.equal(result.manifest.gateId, 'connected-enterprise-lifecycle');
    assert.equal(result.manifest.scope, 'synthetic_disposable_local_connected_integration_only');
    assert.match(result.manifest.limitations.join(' '), /catalog.*remain unchanged and blocked/iu);

    const manifestPath = 'output/acceptance/enterprise-lifecycle/connected-evidence.json';
    const absoluteManifest = path.join(root, manifestPath);
    fs.writeFileSync(absoluteManifest, `${JSON.stringify(result.manifest, null, 2)}\n`);
    assert.equal(verifyEnterpriseLifecycleManifestFile({
      manifestPath,
      manifestDigest: hash(fs.readFileSync(absoluteManifest)),
      expected: fixture.expected,
      repositoryRoot: root,
    }), true);

    fs.appendFileSync(path.join(root, fixture.browserPath), '\n');
    assert.equal(verifyEnterpriseLifecycleManifestFile({
      manifestPath,
      manifestDigest: hash(fs.readFileSync(absoluteManifest)),
      expected: fixture.expected,
      repositoryRoot: root,
    }), false, 'artifact changes after validation must invalidate the gate');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('connected lifecycle evidence fails closed on identity, stages, assertions, lineage, scope, source, cleanup, and effects', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'connected-lifecycle-rejections-'));
  try {
    const fixture = makeFixture(root);
    const cases = [
      ['head', value => { value.backend.execution.headSha = 'b'.repeat(40); }],
      ['attempt', value => { value.browser.execution.runAttempt = '3'; }],
      ['binding-alias', value => { value.browser.journeyBinding = value.backend.journeyBinding; }],
      ['execution-alias', value => { value.browser.execution.executionId = value.backend.execution.executionId; value.browser.scope.executionHash = value.backend.execution.executionId; }],
      ['backend-stage', value => { value.backend.stages = value.backend.stages.filter(stage => stage.id !== 'govern.approve'); }],
      ['backend-assertion', value => { value.backend.assertions['govern.approve.audit'] = false; }],
      ['backend-final-reviewer-semantic', value => { value.backend.assertions['govern.separation-denied.final-reviewer'] = false; }],
      ['backend-actions-bound-semantic', value => { value.backend.assertions['govern.resolve.actions-bound'] = false; }],
      ['backend-duplicate-assertion', value => { value.backend.stages[0].assertionIds.push(value.backend.stages[0].assertionIds[0]); }],
      ['backend-delta', value => { value.backend.stages.find(stage => stage.id === 'studio.consume').mutationDelta += 1; }],
      ['backend-persistence', value => { value.backend.stages.find(stage => stage.id === 'govern.approve').persistence.bindings[0].resourceBound = false; }],
      ['browser-stage', value => { value.browser.projects[0].stages = value.browser.projects[0].stages.filter(stage => stage.id !== 'studio-consume'); }],
      ['browser-assertion', value => { value.browser.projects[0].assertions[0].observed = false; }],
      ['browser-final-reviewer-semantic', value => { value.browser.projects[0].assertions.find(item => item.id === 'ui.final-reviewer-govern-denied').observed = false; }],
      ['lineage', value => { value.backend.lineage.handoffBound = false; }],
      ['scope', value => { value.backend.scope.workspaceHash = 'raw-workspace-id'; }],
      ['source', value => { value.backend.sourceDigests[0].sha256 = `sha256:${'0'.repeat(64)}`; }],
      ['cleanup', value => { value.backend.cleanup.residualRows = 1; }],
      ['provider-effects', value => { value.browser.providerEffects.calls = 1; }],
      ['raw-identifier', value => { value.browser.debug = { requestId: 'a1000000-0000-4000-8000-000000000022' }; }],
    ];
    for (const [name, mutate] of cases) {
      const value = clone(fixture);
      mutate(value);
      const result = validateEnterpriseLifecycleEvidence({ ...value, repositoryRoot: root });
      assert.equal(result.ok, false, `${name} substitution must fail closed`);
      assert.equal(result.manifest, null);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
