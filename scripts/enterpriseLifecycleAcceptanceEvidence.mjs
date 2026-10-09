import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CONNECTED_LIFECYCLE_GATE_ID = 'connected-enterprise-lifecycle';
export const CONNECTED_LIFECYCLE_MANIFEST_SCHEMA = 'connected-enterprise-lifecycle-evidence-v1';
export const BACKEND_EVIDENCE_SCHEMA = 'enterprise-lifecycle-backend-evidence-v1';
export const BROWSER_EVIDENCE_SCHEMA = 'enterprise-lifecycle-browser-evidence-v1';

export const REQUIRED_BACKEND_STAGES = Object.freeze([
  'assess.create',
  'assess.finalize',
  'assess.feature-disabled',
  'govern.assign',
  'govern.attest',
  'govern.changes-requested',
  'govern.revise',
  'govern.resubmit',
  'govern.approve',
  'govern.reject',
  'govern.separation-denied',
  'govern.resolve',
  'studio.handoff',
  'studio.consume',
  'studio.generate',
  'studio.provider-failure',
]);
const BACKEND_STAGE_DELTAS = Object.freeze({
  'assess.create': [2, 2, 2, 0],
  'assess.finalize': [1, 1, 1, 0],
  'assess.feature-disabled': [0, 0, 0, 0],
  'govern.assign': [1, 1, 1, 0],
  'govern.attest': [2, 2, 2, 0],
  'govern.changes-requested': [1, 1, 1, 0],
  'govern.revise': [1, 1, 1, 0],
  'govern.resubmit': [2, 2, 2, 0],
  'govern.approve': [4, 4, 4, 0],
  'govern.reject': [5, 5, 5, 0],
  'govern.separation-denied': [0, 0, 0, 0],
  'govern.resolve': [1, 1, 1, 0],
  'studio.handoff': [2, 1, 1, 0],
  'studio.consume': [6, 4, 4, 0],
  'studio.generate': [1, 1, 2, 1],
  'studio.provider-failure': [1, 1, 2, 0],
});
const BACKEND_STAGE_EXPECTATIONS = Object.freeze(Object.fromEntries(REQUIRED_BACKEND_STAGES.map(id => [id, {
  outcome: id === 'studio.generate' ? 'generation_completed'
    : id === 'studio.provider-failure' ? 'generation_failed'
      : ['assess.feature-disabled', 'govern.separation-denied'].includes(id) ? 'denied' : 'committed',
  persists: !['assess.feature-disabled', 'govern.separation-denied'].includes(id),
  deltas: BACKEND_STAGE_DELTAS[id],
  errorCode: id === 'assess.feature-disabled' ? 'FEATURE_DISABLED'
    : id === 'govern.separation-denied' ? 'INVALID_COMMAND'
      : id === 'studio.provider-failure' ? 'PROVIDER_REQUEST_FAILED' : null,
}])));

export const REQUIRED_BROWSER_PROJECTS = Object.freeze(['chromium-desktop', 'chromium-mobile']);
export const REQUIRED_BROWSER_STAGES = Object.freeze([
  'assess-create',
  'assess-finalize',
  'govern-assign',
  'govern-attest',
  'govern-request-changes',
  'assess-revise',
  'assess-resubmit',
  'govern-approve',
  'govern-separation-denial',
  'govern-resolve',
  'studio-consume',
  'studio-synthetic-generation',
  'command-replay',
  'command-stale-denial',
  'reload-committed-state',
]);
export const REQUIRED_BROWSER_ASSERTIONS = Object.freeze([
  'ui.assess-created',
  'ui.assess-finalized',
  'ui.review-assigned',
  'ui.evidence-attested',
  'ui.changes-requested',
  'ui.revision-committed',
  'ui.resubmitted',
  'ui.independent-approved',
  'ui.separation-denied',
  'ui.final-reviewer-govern-denied',
  'ui.govern-resolved',
  'ui.studio-lineage-consumed',
  'ui.synthetic-provider-boundary',
  'ui.replay-no-new-effect',
  'ui.stale-no-false-success',
  'ui.reload-committed-truth',
]);
export const REQUIRED_BACKEND_SOURCES = Object.freeze([
  'scripts/enterpriseLifecyclePostgresFixture.mjs',
  'scripts/enterpriseLifecyclePersistenceAssertions.mjs',
  'scripts/enterpriseLifecycleStudioGeneration.mjs',
  'scripts/syntheticAiTerminalJournalMigrationTestGuard.mjs',
  'scripts/testEnterpriseLifecycleAcceptancePostgres.mjs',
  'services/assessV2/decisionVersion.ts',
  'services/assessV2/fixture.ts',
  'supabase/functions/_shared/assessV2Command.ts',
  'supabase/functions/_shared/assessV2Handlers.ts',
  'supabase/functions/_shared/assessV2ReviewCommand.ts',
  'supabase/functions/_shared/assessV2ReviewHandlers.ts',
  'supabase/functions/_shared/providerBudget.ts',
  'supabase/functions/_shared/studioArtifactCommand.ts',
  'supabase/functions/_shared/studioArtifactDb.ts',
  'supabase/functions/_shared/studioArtifactGeneration.ts',
  'supabase/functions/_shared/studioArtifactHandler.ts',
  'supabase/functions/_shared/studioArtifactProvider.ts',
  'supabase/functions/_shared/studioArtifactTemplateContract.ts',
  'supabase/functions/_shared/tenantAuthority.ts',
  ...fs.readdirSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations'))
    .filter(name => name.endsWith('.sql'))
    .sort()
    .map(name => `supabase/migrations/${name}`),
]);
export const REQUIRED_BROWSER_SOURCES = Object.freeze([
  ...REQUIRED_BACKEND_SOURCES.filter(sourcePath => ![
    'scripts/enterpriseLifecyclePersistenceAssertions.mjs',
    'scripts/testEnterpriseLifecycleAcceptancePostgres.mjs',
  ].includes(sourcePath)),
  'scripts/enterpriseLifecycleAcceptanceEvidence.mjs',
  'scripts/runEnterpriseLifecycleAcceptanceBrowser.mjs',
  'vite.enterprise-lifecycle-acceptance.config.ts',
  'playwright.enterprise-lifecycle-acceptance.config.ts',
  'tests/browser/enterpriseLifecycleAcceptance/enterpriseLifecycleAcceptance.spec.ts',
  'services/assessV2Client.ts',
  'services/assessV2Client.revisionProjection.test.mjs',
  'services/supabaseClient.ts',
  'services/supabaseClient.enterpriseLifecycleBoundary.test.mjs',
]);

const REQUIRED_LINEAGE = Object.freeze([
  'sourceVersionImmutable',
  'decisionBound',
  'reviewBound',
  'governBound',
  'handoffBound',
  'studioSourceBound',
]);
const REQUIRED_NEGATIVE_CONTROLS = Object.freeze([
  'exactReplayZeroEffects',
  'changedPayloadConflict',
  'staleAuthorityDenied',
  'revokedAuthorityDenied',
  'crossTenantNonDisclosure',
  'nonServiceDenied',
  'browserClaimsIgnored',
  'authorReviewerDenied',
  'responseLossReconciled',
]);
const REQUIRED_SCOPE = Object.freeze(['organizationHash', 'workspaceHash', 'caseHash', 'executionHash']);
export const REQUIRED_BACKEND_GLOBAL_ASSERTIONS = Object.freeze([
  ...REQUIRED_LINEAGE.map(name => `lineage.${name.replaceAll(/[A-Z]/gu, match => `-${match.toLowerCase()}`)}`),
  'negative.exact-replay-zero-effects',
  'negative.changed-payload-conflict',
  'negative.stale-authority-denied',
  'negative.revoked-authority-denied',
  'negative.cross-tenant-non-disclosure',
  'negative.non-service-denied',
  'negative.browser-claims-ignored',
  'negative.author-reviewer-denied',
  'negative.response-loss-reconciled',
  'provider.no-paid-calls',
  'provider.forbidden-network-guard',
  'provider.no-browser-secrets',
  'cleanup.database-removed',
]);
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const HEAD_SHA = /^[0-9a-f]{40}$/u;
const RAW_UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/iu;
const RAW_NETWORK_OR_CREDENTIAL = /(?:https?:\/\/|postgres(?:ql)?:\/\/|\beyJ[A-Za-z0-9_-]{12,}\.|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b)/iu;
const FORBIDDEN_EVIDENCE_KEYS = new Set([
  'actorid', 'organizationid', 'workspaceid', 'caseid', 'requestid', 'resourceid', 'receiptid', 'auditid',
  'handoffid', 'artifactid', 'sourcepackageid', 'controltoken', 'publicanonkey', 'baseurl', 'email', 'token',
  'secret', 'signedurl', 'rawcontent', 'customerdata', 'response', 'payload',
]);

const sha256 = value => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const expectedJourneyBinding = execution => sha256(JSON.stringify({
  executionId: execution?.executionId,
  runId: execution?.runId,
  headSha: execution?.headSha,
  logicalJourney: 'assess-govern-studio-v1',
}));
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const normalizedRelativePath = value => String(value || '').replaceAll('\\', '/');

const validateSanitizedEvidence = (value, label, errors) => {
  let rejected = false;
  const visit = candidate => {
    if (typeof candidate === 'string') {
      if (RAW_UUID.test(candidate) || RAW_NETWORK_OR_CREDENTIAL.test(candidate)) rejected = true;
      return;
    }
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (!candidate || typeof candidate !== 'object') return;
    for (const [key, child] of Object.entries(candidate)) {
      if (FORBIDDEN_EVIDENCE_KEYS.has(key.toLowerCase())) rejected = true;
      visit(child);
    }
  };
  visit(value);
  if (rejected) errors.push(`${label}:sanitization`);
};

const safeRepositoryFile = (root, relative) => {
  const normalized = normalizedRelativePath(relative);
  if (!normalized || path.isAbsolute(normalized) || normalized.startsWith('../') || normalized.includes('/../')) return null;
  const absolute = path.resolve(root, normalized);
  const relativeToRoot = path.relative(path.resolve(root), absolute);
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) return null;
  return absolute;
};

const validateExecution = (execution, expected, label, errors) => {
  if (!execution || typeof execution !== 'object') {
    errors.push(`${label}:execution`);
    return;
  }
  if (!HEAD_SHA.test(String(execution.headSha || '')) || execution.headSha !== expected.headSha) errors.push(`${label}:headSha`);
  if (String(execution.runId || '') !== expected.runId) errors.push(`${label}:runId`);
  if (String(execution.runAttempt || '') !== expected.runAttempt) errors.push(`${label}:runAttempt`);
  if (!SHA256.test(String(execution.executionId || ''))) errors.push(`${label}:executionId`);
  if (typeof execution.startedAt !== 'string' || !Number.isFinite(Date.parse(execution.startedAt))) errors.push(`${label}:startedAt`);
  if (typeof execution.completedAt !== 'string' || !Number.isFinite(Date.parse(execution.completedAt))) errors.push(`${label}:completedAt`);
  if (Number.isFinite(Date.parse(execution.startedAt)) && Number.isFinite(Date.parse(execution.completedAt))
    && Date.parse(execution.completedAt) < Date.parse(execution.startedAt)) errors.push(`${label}:time-order`);
};

const validateSourceDigests = (items, root, label, requiredPaths, errors) => {
  if (!Array.isArray(items) || items.length === 0) {
    errors.push(`${label}:sourceDigests`);
    return [];
  }
  const seen = new Set();
  const validated = [];
  for (const item of items) {
    const relative = normalizedRelativePath(item?.path);
    const absolute = safeRepositoryFile(root, relative);
    if (!absolute || seen.has(relative) || !SHA256.test(String(item?.sha256 || '')) || !fs.existsSync(absolute)) {
      errors.push(`${label}:sourceDigest:${relative || 'missing'}`);
      continue;
    }
    seen.add(relative);
    const actual = sha256(fs.readFileSync(absolute));
    if (actual !== item.sha256) errors.push(`${label}:sourceDigest:${relative}`);
    validated.push({ path: relative, sha256: item.sha256 });
  }
  for (const required of requiredPaths) if (!seen.has(required)) errors.push(`${label}:sourceDigest:missing:${required}`);
  return validated.sort((left, right) => left.path.localeCompare(right.path));
};

const validateBackend = (backend, expected, root, errors) => {
  if (backend?.schemaVersion !== BACKEND_EVIDENCE_SCHEMA) errors.push('backend:schemaVersion');
  if (backend?.status !== 'passed') errors.push('backend:status');
  validateExecution(backend?.execution, expected, 'backend', errors);
  if (!SHA256.test(String(backend?.journeyBinding || ''))) errors.push('backend:journeyBinding');
  else if (backend.journeyBinding !== expectedJourneyBinding(backend.execution)) errors.push('backend:journeyBinding:execution');
  for (const name of REQUIRED_SCOPE) if (!SHA256.test(String(backend?.scope?.[name] || ''))) errors.push(`backend:scope:${name}`);
  if (backend?.scope?.executionHash !== backend?.execution?.executionId) errors.push('backend:scope:executionBinding');
  for (const name of REQUIRED_LINEAGE) if (backend?.lineage?.[name] !== true) errors.push(`backend:lineage:${name}`);
  for (const name of REQUIRED_NEGATIVE_CONTROLS) if (backend?.negativeControls?.[name] !== true) errors.push(`backend:negativeControl:${name}`);

  const stages = Array.isArray(backend?.stages) ? backend.stages : [];
  if (stages.length !== REQUIRED_BACKEND_STAGES.length) errors.push('backend:stages');
  const assertionIds = new Set(REQUIRED_BACKEND_GLOBAL_ASSERTIONS);
  for (const stageId of REQUIRED_BACKEND_STAGES) {
    const stage = stages.find(candidate => candidate?.id === stageId);
    if (!stage) {
      errors.push(`backend:stage:${stageId}`);
      continue;
    }
    const expectation = BACKEND_STAGE_EXPECTATIONS[stageId];
    if (stage.outcome !== expectation.outcome) errors.push(`backend:stage:outcome:${stageId}`);
    for (const delta of ['mutationDelta', 'receiptDelta', 'auditDelta', 'effectDelta']) {
      if (!Number.isSafeInteger(stage[delta]) || stage[delta] < 0) errors.push(`backend:stage:${delta}:${stageId}`);
    }
    ['mutationDelta', 'receiptDelta', 'auditDelta', 'effectDelta'].forEach((delta, index) => {
      if (stage[delta] !== expectation.deltas[index]) errors.push(`backend:stage:expectedDelta:${delta}:${stageId}`);
    });
    if (stage.errorCode !== null && typeof stage.errorCode !== 'string') errors.push(`backend:stage:errorCode:${stageId}`);
    if (stage.errorCode !== expectation.errorCode) errors.push(`backend:stage:expectedErrorCode:${stageId}`);
    if (expectation.persists) {
      for (const delta of ['mutationDelta', 'receiptDelta', 'auditDelta']) {
        if (stage[delta] < 1) errors.push(`backend:stage:persisted:${delta}:${stageId}`);
      }
      const persistence = stage.persistence;
      if (!persistence || !Number.isSafeInteger(persistence.receiptCount) || !Number.isSafeInteger(persistence.auditCount)
        || persistence.receiptCount !== stage.receiptDelta || persistence.auditCount !== stage.auditDelta
        || !Array.isArray(persistence.bindings) || persistence.bindings.length !== persistence.receiptCount) {
        errors.push(`backend:stage:persistence:${stageId}`);
      } else {
        for (const binding of persistence.bindings) {
          for (const field of ['tenantBound', 'actorBound', 'requestBound', 'commandBound', 'resourceBound', 'terminalBound', 'terminalAuditBound', 'duplicateFree']) {
            if (binding?.[field] !== true) errors.push(`backend:stage:persistence:${stageId}:${field}`);
          }
          if (typeof binding?.terminalAuditRequired !== 'boolean') errors.push(`backend:stage:persistence:${stageId}:terminalAuditRequired`);
        }
        if (['studio.generate', 'studio.provider-failure'].includes(stageId)
          && persistence.bindings.some(binding => binding.terminalAuditRequired !== true)) {
          errors.push(`backend:stage:persistence:${stageId}:terminalAudit`);
        }
      }
    } else if (expectation.outcome === 'denied') {
      for (const delta of ['mutationDelta', 'receiptDelta', 'auditDelta', 'effectDelta']) {
        if (stage[delta] !== 0) errors.push(`backend:stage:zeroDelta:${delta}:${stageId}`);
      }
    }
    if (!Array.isArray(stage.assertionIds)) errors.push(`backend:stage:assertionIds:${stageId}`);
    else if (stage.assertionIds.some(id => typeof id !== 'string' || id.length === 0)
      || new Set(stage.assertionIds).size !== stage.assertionIds.length) errors.push(`backend:stage:assertionIds:malformed:${stageId}`);
    const requiredStageAssertions = [`${stageId}.handler`, `${stageId}.state`];
    if (stage.outcome === 'denied') requiredStageAssertions.push(`${stageId}.zero-effects`, `${stageId}.error-code`);
    else requiredStageAssertions.push(`${stageId}.receipt`, `${stageId}.audit`);
    if (stageId === 'studio.generate') requiredStageAssertions.push('studio.generate.artifact-version', 'studio.generate.provider-synthetic');
    if (stageId === 'studio.provider-failure') requiredStageAssertions.push('studio.provider-failure.no-artifact-version', 'studio.provider-failure.failure-code');
    if (stageId === 'govern.separation-denied') requiredStageAssertions.push('govern.separation-denied.final-reviewer');
    if (stageId === 'govern.resolve') requiredStageAssertions.push('govern.resolve.actions-bound');
    for (const id of requiredStageAssertions) {
      assertionIds.add(id);
      if (!stage.assertionIds?.includes(id)) errors.push(`backend:stage:assertionIds:${stageId}:${id}`);
    }
    for (const id of stage.assertionIds || []) assertionIds.add(id);
  }
  if (!backend?.assertions || typeof backend.assertions !== 'object' || Array.isArray(backend.assertions)) errors.push('backend:assertions');
  for (const id of assertionIds) if (backend?.assertions?.[id] !== true) errors.push(`backend:assertion:${id}`);

  if (backend?.providerEffects?.paidCalls !== 0
    || backend?.providerEffects?.calls !== 0
    || backend?.providerEffects?.egressAttempts !== 0
    || backend?.providerEffects?.egress !== 0
    || backend?.providerEffects?.realProviderAllowed !== false
    || backend?.providerEffects?.browserSecrets !== false
    || backend?.providerEffects?.providerMode !== 'synthetic-production-pipeline'
    || backend?.providerEffects?.syntheticAdapterEnabled !== true
    || backend?.providerEffects?.syntheticProviderCalls !== 2
    || backend?.providerEffects?.forbiddenNetworkGuardTriggered !== true) errors.push('backend:providerEffects');
  if (backend?.cleanup?.attempted !== true
    || backend?.cleanup?.succeeded !== true
    || backend?.cleanup?.residualRows !== 0) errors.push('backend:cleanup');
  return validateSourceDigests(backend?.sourceDigests, root, 'backend', REQUIRED_BACKEND_SOURCES, errors);
};

const validateBrowser = (browser, expected, root, errors) => {
  if (browser?.schemaVersion !== BROWSER_EVIDENCE_SCHEMA) errors.push('browser:schemaVersion');
  if (browser?.status !== 'passed') errors.push('browser:status');
  validateExecution(browser?.execution, expected, 'browser', errors);
  if (!SHA256.test(String(browser?.journeyBinding || ''))) errors.push('browser:journeyBinding');
  else if (browser.journeyBinding !== expectedJourneyBinding(browser.execution)) errors.push('browser:journeyBinding:execution');
  for (const name of REQUIRED_SCOPE) if (!SHA256.test(String(browser?.scope?.[name] || ''))) errors.push(`browser:scope:${name}`);
  if (browser?.scope?.executionHash !== browser?.execution?.executionId) errors.push('browser:scope:executionBinding');

  const projects = Array.isArray(browser?.projects) ? browser.projects : [];
  if (projects.length !== REQUIRED_BROWSER_PROJECTS.length) errors.push('browser:projects');
  for (const name of REQUIRED_BROWSER_PROJECTS) {
    const project = projects.find(candidate => candidate?.project === name);
    if (!project || project.status !== 'passed') {
      errors.push(`browser:project:${name}`);
      continue;
    }
    const assertions = Array.isArray(project.assertions) ? project.assertions : [];
    if (assertions.length !== REQUIRED_BROWSER_ASSERTIONS.length) errors.push(`browser:assertions:${name}`);
    for (const id of REQUIRED_BROWSER_ASSERTIONS) {
      const assertion = assertions.find(candidate => candidate?.id === id);
      if (!assertion || assertion.observed !== true) errors.push(`browser:assertion:${name}:${id}`);
    }
    const stages = Array.isArray(project.stages) ? project.stages : [];
    if (stages.length !== REQUIRED_BROWSER_STAGES.length) errors.push(`browser:stages:${name}`);
    for (const id of REQUIRED_BROWSER_STAGES) {
      const stage = stages.find(candidate => candidate?.id === id);
      if (!stage || stage.uiObserved !== true) errors.push(`browser:stage:${name}:${id}`);
    }
    const reload = stages.find(candidate => candidate?.id === 'reload-committed-state');
    if (reload?.reloadObserved !== true) errors.push(`browser:reloadObserved:${name}`);
    if (!Number.isSafeInteger(project?.network?.observedHttpRequests) || project.network.observedHttpRequests < 1
      || project?.network?.nonLoopbackRequests !== 0) errors.push(`browser:network:${name}`);
  }
  const measuredRequests = projects.reduce((total, project) => total + (Number.isSafeInteger(project?.network?.observedHttpRequests) ? project.network.observedHttpRequests : 0), 0);
  if (browser?.network?.observedHttpRequests !== measuredRequests || browser?.network?.nonLoopbackRequests !== 0) errors.push('browser:network');
  if (browser?.providerEffects?.realProviderAllowed !== false
    || browser?.providerEffects?.calls !== 0
    || browser?.providerEffects?.egress !== 0
    || browser?.providerEffects?.egressAttempts !== 0
    || browser?.providerEffects?.paidCalls !== 0
    || browser?.providerEffects?.browserSecrets !== false
    || browser?.providerEffects?.providerMode !== 'synthetic-production-pipeline'
    || browser?.providerEffects?.syntheticAdapterEnabled !== true
    || browser?.providerEffects?.forbiddenNetworkGuardTriggered !== true
    || !Number.isSafeInteger(browser?.providerEffects?.syntheticProviderCalls)
    || browser.providerEffects.syntheticProviderCalls < 1) errors.push('browser:providerEffects');
  if (browser?.cleanup?.backendAttempted !== true
    || browser?.cleanup?.backendSucceeded !== true
    || browser?.cleanup?.browserContextsClosed !== true) errors.push('browser:cleanup');
  return validateSourceDigests(browser?.sourceDigests, root, 'browser', REQUIRED_BROWSER_SOURCES, errors);
};

const canonicalManifest = ({ backend, browser, backendPath, browserPath, backendDigest, browserDigest, sourceDigests }) => ({
  schemaVersion: CONNECTED_LIFECYCLE_MANIFEST_SCHEMA,
  gateId: CONNECTED_LIFECYCLE_GATE_ID,
  result: 'passed',
  scope: 'synthetic_disposable_local_connected_integration_only',
  execution: {
    headSha: backend.execution.headSha,
    runId: String(backend.execution.runId),
    runAttempt: String(backend.execution.runAttempt),
  },
  evidenceExecutions: { backend: backend.execution.executionId, browser: browser.execution.executionId },
  journeyBindings: { backend: backend.journeyBinding, browser: browser.journeyBinding },
  artifacts: {
    backend: { path: normalizedRelativePath(backendPath), sha256: backendDigest },
    browser: { path: normalizedRelativePath(browserPath), sha256: browserDigest },
  },
  stages: ['assess', 'govern', 'studio'],
  sourceDigests,
  cleanup: { backend: 'passed', browser: 'passed' },
  providerEffects: {
    paidCalls: 0,
    realProviderCalls: 0,
    egressAttempts: 0,
    browserSecrets: false,
    backendMode: 'synthetic-production-pipeline',
    browserMode: 'synthetic-production-pipeline',
  },
  limitations: [
    'This is connected local integration evidence across Assess, Govern, and Studio, not the canonical six-module journey.',
    'No hosted or live infrastructure, real provider, paid call, customer data, or external side effect was used.',
    'The exhaustive acceptance catalog and its hosted-required cases remain unchanged and blocked until their own evidence contracts pass.',
  ],
});

export const validateEnterpriseLifecycleEvidence = ({ backend, browser, expected, repositoryRoot = process.cwd(), backendPath, browserPath }) => {
  const errors = [];
  validateSanitizedEvidence(backend, 'backend', errors);
  validateSanitizedEvidence(browser, 'browser', errors);
  if (!HEAD_SHA.test(String(expected?.headSha || ''))) errors.push('expected:headSha');
  if (!/^\d+$/u.test(String(expected?.runId || '')) && expected?.runId !== 'local') errors.push('expected:runId');
  if (!/^\d+$/u.test(String(expected?.runAttempt || ''))) errors.push('expected:runAttempt');
  const backendSources = validateBackend(backend, expected, repositoryRoot, errors);
  const browserSources = validateBrowser(browser, expected, repositoryRoot, errors);
  if (backend?.execution?.executionId === browser?.execution?.executionId) errors.push('executionId:not-distinct');
  if (backend?.journeyBinding === browser?.journeyBinding) errors.push('journeyBinding:not-distinct');
  if (backend?.scope?.caseHash === browser?.scope?.caseHash) errors.push('scope:case:not-distinct');

  const resolvedBackend = safeRepositoryFile(repositoryRoot, backendPath);
  const resolvedBrowser = safeRepositoryFile(repositoryRoot, browserPath);
  if (!resolvedBackend) errors.push('backend:path');
  if (!resolvedBrowser) errors.push('browser:path');
  const backendDigest = resolvedBackend && fs.existsSync(resolvedBackend) ? sha256(fs.readFileSync(resolvedBackend)) : null;
  const browserDigest = resolvedBrowser && fs.existsSync(resolvedBrowser) ? sha256(fs.readFileSync(resolvedBrowser)) : null;
  if (!backendDigest) errors.push('backend:artifact');
  if (!browserDigest) errors.push('browser:artifact');

  const sourceDigests = [...backendSources, ...browserSources]
    .filter((item, index, items) => items.findIndex(candidate => candidate.path === item.path && candidate.sha256 === item.sha256) === index)
    .sort((left, right) => left.path.localeCompare(right.path));
  const digestByPath = new Map();
  for (const item of sourceDigests) {
    const previous = digestByPath.get(item.path);
    if (previous && previous !== item.sha256) errors.push(`sourceDigest:conflict:${item.path}`);
    digestByPath.set(item.path, item.sha256);
  }
  return {
    ok: errors.length === 0,
    errors,
    manifest: errors.length === 0 ? canonicalManifest({
      backend,
      browser,
      backendPath,
      browserPath,
      backendDigest,
      browserDigest,
      sourceDigests,
    }) : null,
  };
};

export const verifyEnterpriseLifecycleManifestFile = ({ manifestPath, manifestDigest, expected, repositoryRoot = process.cwd() }) => {
  const absoluteManifest = safeRepositoryFile(repositoryRoot, manifestPath);
  if (!absoluteManifest || !fs.existsSync(absoluteManifest) || !SHA256.test(String(manifestDigest || ''))) return false;
  const bytes = fs.readFileSync(absoluteManifest);
  if (sha256(bytes) !== manifestDigest) return false;
  let manifest;
  try { manifest = JSON.parse(bytes.toString('utf8')); } catch { return false; }
  if (manifest?.schemaVersion !== CONNECTED_LIFECYCLE_MANIFEST_SCHEMA
    || manifest?.gateId !== CONNECTED_LIFECYCLE_GATE_ID
    || manifest?.result !== 'passed'
    || manifest?.execution?.headSha !== expected.headSha
    || String(manifest?.execution?.runId || '') !== expected.runId
    || String(manifest?.execution?.runAttempt || '') !== expected.runAttempt) return false;
  const backendPath = manifest?.artifacts?.backend?.path;
  const browserPath = manifest?.artifacts?.browser?.path;
  const backendAbsolute = safeRepositoryFile(repositoryRoot, backendPath);
  const browserAbsolute = safeRepositoryFile(repositoryRoot, browserPath);
  if (!backendAbsolute || !browserAbsolute || !fs.existsSync(backendAbsolute) || !fs.existsSync(browserAbsolute)) return false;
  if (sha256(fs.readFileSync(backendAbsolute)) !== manifest.artifacts.backend.sha256
    || sha256(fs.readFileSync(browserAbsolute)) !== manifest.artifacts.browser.sha256) return false;
  let backend;
  let browser;
  try {
    backend = readJson(backendAbsolute);
    browser = readJson(browserAbsolute);
  } catch { return false; }
  const verified = validateEnterpriseLifecycleEvidence({ backend, browser, expected, repositoryRoot, backendPath, browserPath });
  return verified.ok && JSON.stringify(verified.manifest) === JSON.stringify(manifest);
};

const argument = name => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
};

export const main = () => {
  const repositoryRoot = process.cwd();
  const backendPath = argument('--backend') || 'output/acceptance/enterprise-lifecycle/backend-evidence.json';
  const browserPath = argument('--browser') || 'output/acceptance/enterprise-lifecycle/browser-evidence.json';
  const outputPath = argument('--output') || 'output/acceptance/enterprise-lifecycle/connected-evidence.json';
  const backendAbsolute = safeRepositoryFile(repositoryRoot, backendPath);
  const browserAbsolute = safeRepositoryFile(repositoryRoot, browserPath);
  const expected = {
    headSha: process.env.PILOT_ACCEPTANCE_HEAD || process.env.GITHUB_SHA || '',
    runId: process.env.GITHUB_RUN_ID || 'local',
    runAttempt: process.env.GITHUB_RUN_ATTEMPT || '1',
  };
  let result;
  try {
    result = validateEnterpriseLifecycleEvidence({
      backend: readJson(backendAbsolute),
      browser: readJson(browserAbsolute),
      expected,
      repositoryRoot,
      backendPath,
      browserPath,
    });
  } catch {
    result = { ok: false, errors: ['evidence:unreadable'], manifest: null };
  }
  if (!result.ok) {
    console.error(`Connected enterprise lifecycle evidence rejected: ${result.errors.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  const absoluteOutput = safeRepositoryFile(repositoryRoot, outputPath);
  if (!absoluteOutput) throw new Error('Connected enterprise lifecycle output must remain inside the repository.');
  fs.mkdirSync(path.dirname(absoluteOutput), { recursive: true });
  fs.writeFileSync(absoluteOutput, `${JSON.stringify(result.manifest, null, 2)}\n`);
  console.log(`Connected enterprise lifecycle evidence passed for ${expected.headSha}.`);
};

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
