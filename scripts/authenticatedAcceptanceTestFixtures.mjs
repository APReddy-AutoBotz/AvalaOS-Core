// Invented validator data only. Never accepted as executed product evidence.
import fs from 'node:fs';
import {
  AUTHENTICATED_ACCEPTANCE_PROJECTS,
  AUTHENTICATED_ACCEPTANCE_TEST_IDS,
  AUTHENTICATED_CASE_ASSERTIONS,
  authenticatedAcceptanceScenario,
} from './authenticatedAcceptanceCases.mjs';
import { authenticatedEvidenceDigest, authenticatedRawIdentity } from './authenticatedBrowserCorrelation.mjs';
import { produceAuthenticatedHostedEvidence } from './authenticatedHostedEvidence.mjs';

const catalog = JSON.parse(fs.readFileSync('tests/acceptance/catalog/test-catalog.json', 'utf8'));
const digest = value => authenticatedEvidenceDigest({ fixture: value });
const personas = ['author', 'reviewer', 'approver', 'outsider'];
const fixtureSource = Object.freeze({
  domain: 'assess_processes',
  secret: 'ai_provider_key_refs',
  receipt: 'assess_command_receipts',
  audit: 'privileged_audit_events',
  generation_attempt: 'studio_artifact_generation_attempts',
  control: 'authenticated_synthetic_permits',
});

export const profileFixture = () => ({
  schemaVersion: 'hosted-authenticated-synthetic-profile-v3', executionKind: 'hosted_authenticated_synthetic',
  authKind: 'supabase_auth', releaseSha: 'a'.repeat(40), checkoutSha: 'a'.repeat(40),
  origin: 'https://avalaos-pilot.netlify.app', deploymentId: 'b'.repeat(24),
  backendDigest: digest('backend'), migrationVersion: '20261011053000', migrationDigest: digest('migration'),
  exerciseDigest: digest('exercise'), catalogDigest: digest('catalog'), sourceDigest: digest('source'), baselineDigest: digest('baseline'),
  secretBackendKind: 'supabase_vault',
  policy: { syntheticOnly: true, production: false, customerDataAllowed: false, providersEnabled: false, paidCallsAllowed: false },
  workflow: {
    repository: 'APReddy-AutoBotz/AvalaOS-Core',
    producer: { path: '.github/workflows/exhaustive-acceptance.yml',
      ref: 'APReddy-AutoBotz/AvalaOS-Core/.github/workflows/exhaustive-acceptance.yml@refs/heads/main', job: 'acceptance' },
    caller: { path: '.github/workflows/authenticated-product-acceptance.yml',
      ref: 'APReddy-AutoBotz/AvalaOS-Core/.github/workflows/authenticated-product-acceptance.yml@refs/heads/main',
      event: 'workflow_dispatch', job: 'hosted-authenticated' },
    runId: '123', attempt: '1',
  },
  window: { startedAt: '2026-10-10T05:00:00.000Z', completedAt: '2026-10-10T06:00:00.000Z' },
  actors: AUTHENTICATED_ACCEPTANCE_PROJECTS.flatMap(project => personas.map(persona => ({
    persona, project, actorHash: digest(`actor:${project}:${persona}`), sessionHash: digest(`session:${project}:${persona}`),
    organizationHash: digest('organization'), workspaceHash: digest('workspace'),
  }))),
});

const rawRecord = ({ key, effectKind, requestIdHash, persistedRequestHash = null, persistedPayloadHash = null,
  commandBindingHash = null, actor, rowHash = digest(`row:${key}`), businessRowHash = rowHash, active = true,
  source = fixtureSource[effectKind], commandIdHash = null, receiptIdHash = null, auditIdHash = null,
  occurredAt = '2026-10-10T05:10:01.000Z' }) => ({
  source,
  recordHash: digest(`record:${key}`), rowHash, businessRowHash, occurredAt,
  classification: effectKind === 'control' ? 'transient_control' : 'immutable_history', active,
  actorHash: actor?.actorHash ?? null, sessionHash: actor?.sessionHash ?? null,
  requestIdHash, persistedRequestHash, persistedPayloadHash, commandBindingHash,
  commandIdHash, receiptIdHash, auditIdHash, effectKind,
  organizationHash: digest('organization'), workspaceHash: digest('workspace'),
});

export const rawHostedFixtures = () => {
  const binding = profileFixture();
  const identity = authenticatedRawIdentity(binding);
  const browserCases = [];
  const serverCases = [];
  for (const testId of AUTHENTICATED_ACCEPTANCE_TEST_IDS) for (const project of AUTHENTICATED_ACCEPTANCE_PROJECTS) {
    const definition = catalog.cases.find(item => item.testId === testId);
    const actor = binding.actors.find(item => item.project === project && item.persona === 'author');
    const participant = { persona: actor.persona, actorHash: actor.actorHash, sessionHash: actor.sessionHash };
    const requestIdHash = digest(`request-id:${testId}:${project}`);
    const browserPayloadHash = digest(`browser-payload:${testId}:${project}`);
    const persistedRequestHash = digest(`persisted-request:${testId}:${project}`);
    const commandBindingHash = testId === 'ASSESS-003'
      ? authenticatedEvidenceDigest({requestIdHash,actorHash:actor.actorHash,commandType:'assessment.finalize'})
      : digest(`command-binding:${testId}:${project}`);
    const commandIdHash = definition.expectedMutationCount > 0 || testId === 'STUDIO-003' ? digest(`command:${testId}:${project}`) : null;
    const receiptIdHash = commandIdHash ? digest(`receipt:${testId}:${project}`) : null;
    const status = definition.expectedDenial ? 403 : testId === 'STUDIO-003' ? 500 : 200;
    browserCases.push({
      testId, project, scenario: authenticatedAcceptanceScenario(testId),
      window: { startedAt: '2026-10-10T05:10:00.000Z', completedAt: '2026-10-10T05:11:00.000Z' },
      participants: [participant],
      actions: [{ actionId: digest(`action:${testId}:${project}`), occurredAt: '2026-10-10T05:10:01.000Z',
        actorHash: actor.actorHash, sessionHash: actor.sessionHash, requestIdHash, browserPayloadHash, commandBindingHash,
        response: { status, classification: testId === 'ASSESS-003' ? 'COMMITTED'
          : status === 200 ? 'SUCCESS' : status === 500 ? 'SERVER_ERROR_PRECOMMIT' : 'AUTHORIZATION_DENIED',
          commandIdHash, receiptIdHash } }],
      assertions: AUTHENTICATED_CASE_ASSERTIONS[testId].map(id => ({ id, comparator: 'equals', expected: true, actual: true,
        observedAt: '2026-10-10T05:10:30.000Z', source: 'actual-product-browser' })),
      source: 'actual-product-browser',
    });
    const before = [];
    const after = [];
    if (definition.expectedMutationCount > 0 && testId !== 'AI-004') {
      before.push(rawRecord({ key: `${testId}:${project}:domain`, effectKind: 'domain', requestIdHash: null,
        source:testId==='ASSESS-003'?'assessments':fixtureSource.domain,
        actor: null, rowHash: digest(`before:${testId}:${project}`), occurredAt: '2026-10-10T05:00:01.000Z' }));
      after.push(rawRecord({ key: `${testId}:${project}:domain`, effectKind: 'domain', requestIdHash,
        source:testId==='ASSESS-003'?'assessments':fixtureSource.domain,
        persistedRequestHash, commandBindingHash, actor,
        rowHash: digest(`after:${testId}:${project}`), commandIdHash }));
    }
    if (testId === 'AI-004') after.push(rawRecord({ key: `${testId}:${project}:secret`, effectKind: 'secret', requestIdHash,
      persistedRequestHash, commandBindingHash, actor, commandIdHash }));
    if (definition.expectedMutationCount > 0 || testId === 'STUDIO-003') {
      after.push(rawRecord({ key: `${testId}:${project}:receipt`, effectKind: 'receipt', requestIdHash,
        persistedRequestHash, commandBindingHash, actor,
        commandIdHash, receiptIdHash }));
      after.push(rawRecord({ key: `${testId}:${project}:audit:1`, effectKind: 'audit', requestIdHash,
        persistedRequestHash, commandBindingHash, actor,
        commandIdHash, receiptIdHash, auditIdHash: digest(`audit:1:${testId}:${project}`) }));
    }
    if (testId === 'STUDIO-003') {
      const aggregateKey = `${testId}:${project}:aggregate`;
      const businessRowHash = digest(`business:${aggregateKey}`);
      before.push(rawRecord({ key: aggregateKey, source: 'studio_artifact_aggregates', effectKind: 'domain', requestIdHash: null,
        actor: null, rowHash: digest(`before:${aggregateKey}`), businessRowHash,
        occurredAt: '2026-10-10T05:00:01.000Z' }));
      after.push(rawRecord({ key: aggregateKey, source: 'studio_artifact_aggregates', effectKind: 'domain', requestIdHash,
        persistedRequestHash, commandBindingHash, actor, rowHash: digest(`after:${aggregateKey}`),
        businessRowHash, commandIdHash }));
      after.push(rawRecord({ key: `${testId}:${project}:attempt`, effectKind: 'generation_attempt', requestIdHash,
        persistedRequestHash, commandBindingHash, actor, commandIdHash }));
      after.push(rawRecord({ key: `${testId}:${project}:audit:2`, effectKind: 'audit', requestIdHash,
        persistedRequestHash, commandBindingHash, actor,
        commandIdHash, receiptIdHash, auditIdHash: digest(`audit:2:${testId}:${project}`) }));
    }
    if (['STUDIO-003', 'SAFETY-002'].includes(testId)) {
      const permitKey = `${testId}:${project}:permit`;
      before.push(rawRecord({ key: permitKey, effectKind: 'control', requestIdHash, persistedPayloadHash: browserPayloadHash,
        commandBindingHash, actor, active: true, rowHash: digest(`armed:${permitKey}`),
        occurredAt: '2026-10-10T05:09:58.000Z' }));
      after.push(rawRecord({ key: permitKey, effectKind: 'control', requestIdHash, persistedPayloadHash: browserPayloadHash,
        commandBindingHash, actor, active: false, rowHash: digest(`consumed:${permitKey}`) }));
    }
    serverCases.push({
      testId, project, scenario: authenticatedAcceptanceScenario(testId),
      window: { startedAt: '2026-10-10T05:10:00.000Z', completedAt: '2026-10-10T05:11:00.000Z' },
      participants: [participant],
      before: { capturedAt: '2026-10-10T05:09:59.000Z', records: before },
      after: { capturedAt: '2026-10-10T05:11:01.000Z', records: [...before.filter(row => !after.some(next => next.recordHash === row.recordHash)), ...after] },
    });
  }
  const resources = binding.actors.map(actor => ({ kind: 'session', resourceHash: digest(`resource:${actor.sessionHash}`),
    classification: 'transient', status: 'revoked', actorHash: actor.actorHash, sessionHash: actor.sessionHash }));
  for(const project of AUTHENTICATED_ACCEPTANCE_PROJECTS){
    const keyRefRecordHash=serverCases.find(row=>row.testId==='AI-004'&&row.project===project).after.records
      .find(row=>row.source==='ai_provider_key_refs').recordHash;
    for(const [kind,phase,exists,fingerprintMatches] of [
      ['secret_material_created_verified','created',true,true],
      ['secret_material_absence_verified','absent',false,false],
    ])resources.push({kind,resourceHash:authenticatedEvidenceDigest({schema:'supabase-vault-physical-observation-v1',
      releaseSha:binding.releaseSha,runId:binding.workflow.runId,attempt:binding.workflow.attempt,project,
      backendKind:binding.secretBackendKind,keyRefRecordHash,phase,exists,fingerprintMatches}),
    classification:'transient',status:'removed',actorHash:null,sessionHash:null});
  }
  resources.push({ kind: 'receipt-history', resourceHash: digest('retained-history'), classification: 'retained_immutable',
    status: 'preserved', actorHash: null, sessionHash: null });
  return {
    binding,
    browserCorrelations: { schemaVersion: 'authenticated-browser-correlations-v1', identity, cases: browserCases },
    serverObservations: { schemaVersion: 'authenticated-server-observations-v1', identity, cases: serverCases,
      cleanup: { capturedAt: '2026-10-10T06:01:00.000Z', resources,
        nonExerciseStateBeforeHash: digest('non-exercise'), nonExerciseStateAfterHash: digest('non-exercise') } },
  };
};

export const manifestFixture = () => {
  const raw = rawHostedFixtures();
  return produceAuthenticatedHostedEvidence({ ...raw, catalog });
};
