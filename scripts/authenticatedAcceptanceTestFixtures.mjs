// Invented validator test data only. Never accepted as executed product evidence.
import fs from 'node:fs';
import { AUTHENTICATED_ACCEPTANCE_PROJECTS, AUTHENTICATED_ACCEPTANCE_TEST_IDS, AUTHENTICATED_CASE_ASSERTIONS, authenticatedAcceptanceScenario } from './authenticatedAcceptanceCases.mjs';
const catalog = JSON.parse(fs.readFileSync('tests/acceptance/catalog/test-catalog.json', 'utf8'));
export const profileFixture = () => ({
  schemaVersion: 'hosted-authenticated-synthetic-profile-v1', executionKind: 'hosted_authenticated_synthetic',
  authKind: 'supabase_auth', releaseSha: 'a'.repeat(40), checkoutSha: 'a'.repeat(40),
  origin: 'https://avalaos-pilot.netlify.app', deploymentId: 'b'.repeat(24),
  backendDigest: `sha256:${'c'.repeat(64)}`, migrationVersion: '20261010025331',
  migrationDigest: `sha256:${'d'.repeat(64)}`, exerciseDigest: `sha256:${'e'.repeat(64)}`,
  catalogDigest: `sha256:${'f'.repeat(64)}`, sourceDigest: `sha256:${'1'.repeat(64)}`,
  baselineDigest: `sha256:${'2'.repeat(64)}`,
  policy: { syntheticOnly: true, production: false, customerDataAllowed: false, providersEnabled: false, paidCallsAllowed: false },
  workflow: {
    repository: 'APReddy-AutoBotz/AvalaOS-Core', path: '.github/workflows/authenticated-product-acceptance.yml',
    ref: 'APReddy-AutoBotz/AvalaOS-Core/.github/workflows/authenticated-product-acceptance.yml@refs/heads/main',
    event: 'workflow_dispatch', runId: '123', attempt: '1', job: 'hosted-authenticated',
  },
  window: { startedAt: '2026-10-10T05:00:00.000Z', completedAt: '2026-10-10T05:05:00.000Z' },
  actors: ['desktop-chromium', 'pixel-7-chromium'].map((project, index) => ({ persona: 'author', project,
    actorHash: `sha256:${'3'.repeat(64)}`, sessionHash: `sha256:${String(index + 4).repeat(64)}`,
    organizationHash: `sha256:${'6'.repeat(64)}`, workspaceHash: `sha256:${'7'.repeat(64)}` })),
});

const digest = value => `sha256:${value.repeat(64)}`;
// These invented values exercise rejection logic only; they are never emitted
// as executed product evidence or included in acceptance artifacts.
export const manifestFixture = () => {
  const binding = profileFixture();
  return {
    schemaVersion: 'authenticated-acceptance-evidence-v1', binding,
    preflight: { serverBindingVerified: true, realAuthVerified: true, providersDisabled: true, noCustomerData: true, sourceVerified: true },
    cleanup: { sessionsRevoked: true, browserStateRemoved: true, syntheticObjectsRemoved: true, providersDisabled: true,
      scopedResidue: 0, retainedHistoryPreserved: true, digest: digest('8') },
    cases: AUTHENTICATED_ACCEPTANCE_TEST_IDS.flatMap(testId => AUTHENTICATED_ACCEPTANCE_PROJECTS.map(project => {
      const definition = catalog.cases.find(c => c.testId === testId);
      const actor = binding.actors.find(a => a.project === project);
      const { project: ignored, ...auth } = actor;
      const writes = definition.expectedMutationCount;
      return {
        testId, project, scenario: authenticatedAcceptanceScenario(testId), status: 'PASS',
        observedAt: '2026-10-10T05:02:00.000Z', auth: { kind: 'supabase_auth', ...auth },
        measurements: { logicalMutations: writes, domainWrites: writes,
          generationAttemptWrites: testId === 'STUDIO-003' ? 1 : 0,
          receiptWrites: testId === 'STUDIO-003' ? 1 : writes, auditWrites: testId === 'STUDIO-003' ? 2 : writes,
          secretWrites: testId === 'AI-004' ? 1 : 0, storageWrites: 0, providerCalls: 0, paidCalls: 0,
          providerTokens: 0, budgetDebits: 0, foreignWrites: 0, beforeHash: digest('a'), afterHash: digest(writes ? 'b' : 'a'),
          setupExcluded: true, authorityVerified: true, denialObserved: definition.expectedDenial, falseSuccess: false },
        ui: { actionObserved: true, resultObserved: true, source: 'actual-product-browser', secretExposure: false },
        lineage: definition.expectedLineage ? { chainDigest: digest('c'), organizationHash: actor.organizationHash,
          workspaceHash: actor.workspaceHash, serverDerived: true, foreignTenantDenied: true } : null,
        assertions: AUTHENTICATED_CASE_ASSERTIONS[testId].map(id => ({ id, status: 'PASS' })), failureCode: null,
      };
    })),
  };
};
