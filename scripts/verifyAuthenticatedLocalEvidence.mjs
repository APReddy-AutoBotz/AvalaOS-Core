import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { AUTHENTICATED_ACCEPTANCE_PROJECTS, AUTHENTICATED_ACCEPTANCE_TEST_IDS, AUTHENTICATED_CASE_ASSERTIONS } from './authenticatedAcceptanceCases.mjs';

export const AUTHENTICATED_LOCAL_COUNTERS = Object.freeze([
  'logicalMutations', 'domainWrites', 'generationAttemptWrites', 'receiptWrites', 'auditWrites',
  'secretWrites', 'storageWrites', 'providerCalls', 'paidCalls', 'providerTokens', 'budgetDebits', 'foreignWrites',
]);
const digest = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
export const authenticatedLocalDigest = value => digest(JSON.stringify(canonical(value)));
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort());
const stamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

export const authenticatedLocalSourceDigests = () => {
  const catalog = JSON.parse(fs.readFileSync('tests/acceptance/catalog/test-catalog.json', 'utf8'));
  const paths = [...new Set([
    ...catalog.cases.filter(c => AUTHENTICATED_ACCEPTANCE_TEST_IDS.includes(c.testId)).flatMap(c => c.sourceReference),
    'scripts/verifyAuthenticatedLocalEvidence.mjs', 'scripts/runEnterpriseLifecycleAcceptanceBrowser.mjs',
    'tests/acceptance/catalog/test-catalog.json', 'tests/acceptance/catalog/schema.json',
    'scripts/authenticatedAcceptanceCriteria.mjs',
    '.github/workflows/authenticated-product-acceptance.yml', 'package.json',
    'App.tsx', 'types.ts', 'components/assess/ProcessDetailStubView.tsx',
    'services/viewAccessGuard.ts', 'services/governedCreationNavigation.ts',
    'components/delivery/WorkspaceView.tsx',
    'components/docs/GovernedStudioRoute.tsx', 'components/docs/StudioArtifactWorkspace.tsx',
    'components/docs/StudioApprovedArtifactPublish.tsx',
    'components/delivery/ProjectView.tsx', 'components/delivery/TaskDetailModal.tsx',
    'components/delivery/DeliveryPackView.tsx', 'components/delivery/DeliveryPackSnapshotAction.tsx',
    'components/delivery/DeliveryOutcomeEditor.tsx', 'components/delivery/DeliveryTaskOutcome.tsx',
    'components/shared/PortfolioView.tsx', 'components/shared/DeliveryOutcomeMonitorPanel.tsx',
    'components/admin/AdminWorkbench.tsx', 'components/admin/AdminSectionNav.tsx', 'components/admin/PilotOperationsPanel.tsx',
    'components/enterprise/EnterpriseIntelligenceView.tsx',
    'services/enterpriseIntelligenceClient.ts', 'services/pilotOperations/client.ts',
    'services/syntheticAdminClient.ts', 'services/studioArtifacts/privateArtifactClient.ts',
    'services/processService.ts', 'services/adapters/assessAdapter.ts',
    'services/adapters/deliveryAdapter.ts', 'services/deliveryPackService.ts',
    'services/productAcceptanceBridge/outcomePaging.ts',
    'scripts/authenticatedControlsProductionLoader.mjs',
    'scripts/enterpriseLifecycleStudioGeneration.mjs',
    'scripts/enterpriseLifecyclePersistenceAssertions.mjs',
    'supabase/functions/_shared/processCommandRouter.ts',
    'supabase/functions/_shared/processUpdateDb.ts', 'supabase/functions/process-command/index.ts',
    'supabase/functions/_shared/studioDeliveryDb.ts', 'supabase/functions/_shared/studioDeliveryHttp.ts',
    'supabase/functions/studio-delivery-authority-command/index.ts',
    'supabase/functions/studio-delivery-outcome-query/index.ts',
    'supabase/functions/_shared/providerLifecycle.ts',
    'supabase/functions/_shared/enterpriseIntelligenceQuery.ts',
    'supabase/functions/_shared/syntheticAdminEndpoint.ts',
    'supabase/functions/_shared/studioPrivateArtifactDownloadHandler.ts',
    'supabase/functions/_shared/tenantAuthority.ts',
    'supabase/functions/_shared/assessV2Command.ts', 'supabase/functions/_shared/assessV2Handlers.ts',
    'supabase/functions/_shared/assessV2ReviewCommand.ts', 'supabase/functions/_shared/assessV2ReviewHandlers.ts',
    'supabase/functions/_shared/studioArtifactCommand.ts', 'supabase/functions/_shared/studioArtifactHandler.ts',
    'supabase/functions/_shared/studioArtifactDb.ts', 'supabase/functions/_shared/studioArtifactGeneration.ts',
    'supabase/functions/_shared/studioArtifactProvider.ts',
    'supabase/functions/_shared/legacyDeliveryCommand.ts', 'supabase/functions/_shared/legacyDeliveryQuery.ts',
    'tests/browser/authenticatedLifecycleHarness.ts',
    'tests/browser/enterpriseLifecycleAcceptance/studioDeliveryMonitorJourney.ts',
    'tests/browser/enterpriseLifecycleAcceptance/assessmentScenarioJourneys.ts',
    'playwright.enterprise-lifecycle-acceptance.config.ts', 'vite.enterprise-lifecycle-acceptance.config.ts',
    ...fs.readdirSync('supabase/migrations').filter(name => name.endsWith('.sql')).map(name => `supabase/migrations/${name}`),
  ])].sort();
  return paths.map(source => ({ path: source, sha256: digest(fs.readFileSync(source, 'utf8').replace(/\r\n/gu, '\n')) }));
};

/** Local fixture evidence has no conversion into a real-auth hosted manifest. */
export const createAuthenticatedLocalManifest = ({ execution, sourceDigests, cases, cleanup }) => ({
  schemaVersion: 'local-authenticated-lifecycle-v1', authKind: 'fixture_transport',
  execution, sourceDigests, cases, cleanup,
});

export function validateAuthenticatedLocalEvidence(manifest, {
  execution, sourceDigests = authenticatedLocalSourceDigests(),
  catalog = JSON.parse(fs.readFileSync('tests/acceptance/catalog/test-catalog.json', 'utf8')),
} = {}) {
  const errors = [];
  if (!exact(manifest, ['schemaVersion', 'authKind', 'execution', 'sourceDigests', 'cases', 'cleanup'])
    || manifest.schemaVersion !== 'local-authenticated-lifecycle-v1' || manifest.authKind !== 'fixture_transport') return ['local-profile-invalid'];
  const e = manifest.execution;
  if (!exact(e, ['headSha', 'runId', 'runAttempt', 'executionId', 'startedAt', 'completedAt'])
    || !/^(?:[a-f0-9]{40}|local-working-tree)$/u.test(e.headSha ?? '')
    || !/^(?:[1-9][0-9]*|local-[A-Za-z0-9-]+)$/u.test(e.runId ?? '')
    || !/^[1-9][0-9]*$/u.test(e.runAttempt ?? '')
    || !(/^[A-Za-z0-9-]{16,100}$/u.test(e.executionId ?? '') || DIGEST.test(e.executionId ?? ''))
    || !stamp(e.startedAt) || !stamp(e.completedAt) || Date.parse(e.completedAt) <= Date.parse(e.startedAt)) return ['local-execution-invalid'];
  if (execution && Object.entries(execution).some(([key, value]) => e[key] !== value)) errors.push('local-execution-mismatch');
  if (!isDeepStrictEqual(manifest.sourceDigests, sourceDigests)) errors.push('local-source-mismatch');
  const sourceDigestSetHash = authenticatedLocalDigest(sourceDigests);
  if (!exact(manifest.cleanup, ['database', 'server', 'preview', 'browserState', 'secretBackend'])
    || Object.values(manifest.cleanup).some(value => value !== true)) errors.push('local-cleanup-incomplete');
  if (!Array.isArray(manifest.cases)) return [...errors, 'local-cases-invalid'];
  const seen = new Set();
  for (const row of manifest.cases) {
    const key = `${row?.testId}:${row?.project}`;
    if (!AUTHENTICATED_ACCEPTANCE_TEST_IDS.includes(row?.testId) || !AUTHENTICATED_ACCEPTANCE_PROJECTS.includes(row?.project) || seen.has(key)) {
      errors.push(`local-case-identity:${key}`); continue;
    }
    seen.add(key);
    if (!exact(row, ['testId', 'project', 'status', 'proofMode', 'observations', 'controls', 'measurements', 'cleanup', 'sourceBinding'])) errors.push(`local-case-shape:${key}`);
    if (row.status !== 'passed' || row.proofMode !== 'actual-ui') errors.push(`local-case-incomplete:${key}`);
    if (!exact(row.sourceBinding, ['executionId', 'sourceDigestSetHash'])
      || row.sourceBinding.executionId !== e.executionId || row.sourceBinding.sourceDigestSetHash !== sourceDigestSetHash) errors.push(`local-case-binding:${key}`);
    const assertions = row.controls?.assertions;
    if (!exact(row.controls, ['assertions']) || !Array.isArray(assertions)
      || !isDeepStrictEqual(assertions.map(a => a.id).sort(), [...AUTHENTICATED_CASE_ASSERTIONS[row.testId]].sort())
      || assertions.some(a => !exact(a, ['id', 'status']) || a.status !== 'passed')) errors.push(`local-case-assertions:${key}`);
    const browser = row.observations?.browser;
    if (!exact(row.observations, ['browser', 'api']) || !exact(browser, ['actions', 'result'])
      || !Array.isArray(browser?.actions) || !browser.actions.length
      || browser.actions.some(a => !exact(a, ['action', 'target']) || typeof a.action !== 'string' || !a.action || typeof a.target !== 'string' || !a.target)
      || !browser.result || Object.keys(browser.result).length === 0 || Object.values(browser.result).some(v => v !== true)) errors.push(`local-browser-observation:${key}`);
    const api = row.observations?.api;
    if (!exact(api, ['productionRoutes', 'responses']) || !Array.isArray(api?.productionRoutes) || !api.productionRoutes.length
      || api.productionRoutes.some(route => typeof route !== 'string' || !/^\/(?:functions\/v1\/[a-z0-9-]+|rest\/v1\/rpc\/[a-z0-9_]+)$/u.test(route))
      || !Array.isArray(api.responses) || !api.responses.length
      || api.responses.some(r => !exact(r, ['classification', 'status']) || !/^[A-Z][A-Z0-9_]{1,80}$/u.test(r.classification ?? '')
        || !(Number.isInteger(r.status) && r.status >= 200 && r.status <= 599
          || r.status === 0 && ['NETWORK_OFFLINE', 'NETWORK_TIMEOUT', 'NETWORK_ABORTED'].includes(r.classification)))) errors.push(`local-api-observation:${key}`);
    const m = row.measurements;
    if (!exact(m, ['setupExcluded', 'before', 'after', 'delta', 'stateBeforeHash', 'stateAfterHash']) || m.setupExcluded !== true
      || !DIGEST.test(m.stateBeforeHash ?? '') || !DIGEST.test(m.stateAfterHash ?? '')
      || ['before', 'after', 'delta'].some(part => !exact(m[part], AUTHENTICATED_LOCAL_COUNTERS)
        || AUTHENTICATED_LOCAL_COUNTERS.some(name => !Number.isSafeInteger(m[part][name]) || m[part][name] < 0))) {
      errors.push(`local-measurements-invalid:${key}`); continue;
    }
    const d = m.delta;
    if (AUTHENTICATED_LOCAL_COUNTERS.some(name => d[name] !== m.after[name] - m.before[name])) errors.push(`local-delta-mismatch:${key}`);
    if (['providerCalls', 'paidCalls', 'providerTokens', 'budgetDebits', 'foreignWrites'].some(name => d[name] !== 0)) errors.push(`local-forbidden-effect:${key}`);
    const definition = catalog.cases.find(c => c.testId === row.testId);
    if (d.logicalMutations !== definition.expectedMutationCount) errors.push(`local-business-mutation:${key}`);
    if (definition.expectedMutationCount === 0) {
      if (m.stateBeforeHash !== m.stateAfterHash || d.domainWrites !== 0 || d.secretWrites !== 0 || d.storageWrites !== 0) errors.push(`local-target-changed:${key}`);
      const journals = row.testId === 'STUDIO-003' ? [1, 1, 2] : [0, 0, 0];
      if (!isDeepStrictEqual([d.generationAttemptWrites, d.receiptWrites, d.auditWrites], journals)) errors.push(`local-journal-mismatch:${key}`);
      if (row.testId === 'STUDIO-003' && browser?.result?.reservationCounterAdvancedExactlyOnce !== true) errors.push(`local-reservation-measurement:${key}`);
    } else if (d.domainWrites < 1 || m.stateBeforeHash === m.stateAfterHash) errors.push(`local-target-not-observed:${key}`);
    if (definition.expectedMutationCount > 0 && definition.expectedAudit === 'required for privileged mutation'
      && (d.receiptWrites < 1 || d.auditWrites < 1)) errors.push(`local-privileged-audit:${key}`);
    if (row.testId === 'AI-004' && (d.secretWrites !== 1 || d.receiptWrites !== 1 || d.auditWrites !== 1)) errors.push(`local-secret-boundary:${key}`);
    if (!exact(row.cleanup, ['verified']) || row.cleanup.verified !== true) errors.push(`local-case-cleanup:${key}`);
  }
  for (const testId of AUTHENTICATED_ACCEPTANCE_TEST_IDS) for (const project of AUTHENTICATED_ACCEPTANCE_PROJECTS) {
    if (!seen.has(`${testId}:${project}`)) errors.push(`local-case-missing:${testId}:${project}`);
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const manifest = JSON.parse(fs.readFileSync(process.argv[2] ?? 'output/acceptance/authenticated-product/local-evidence.json', 'utf8'));
    const execution = process.env.CI ? {
      headSha: process.env.RELEASE_SHA ?? process.env.PILOT_ACCEPTANCE_HEAD ?? process.env.GITHUB_SHA,
      runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT,
    } : undefined;
    const errors = validateAuthenticatedLocalEvidence(manifest, { execution });
    console.log(JSON.stringify({ status: errors.length ? 'INCOMPLETE' : 'PASS', authKind: 'fixture_transport', hostedRequirementSatisfied: false,
      cases: manifest.cases?.length ?? 0, errors }));
    if (errors.length) process.exitCode = 1;
  } catch { console.error('AUTHENTICATED_LOCAL_EVIDENCE_INVALID'); process.exitCode = 1; }
}
