import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { profileFixture, manifestFixture, rawHostedFixtures } from './authenticatedAcceptanceTestFixtures.mjs';
import { AUTHENTICATED_ACCEPTANCE_TEST_IDS } from './authenticatedAcceptanceCases.mjs';
import { authenticatedEvidenceDigest, authenticatedRawIdentity } from './authenticatedBrowserCorrelation.mjs';
import { validateAuthenticatedAcceptanceManifest, evaluateAuthenticatedAcceptanceCase } from './authenticatedAcceptanceEvidence.mjs';
import { produceAuthenticatedHostedEvidence } from './authenticatedHostedEvidence.mjs';
import { validateAuthenticatedCatalogRevision } from './authenticatedAcceptanceCriteria.mjs';

const catalog = JSON.parse(fs.readFileSync('tests/acceptance/catalog/test-catalog.json', 'utf8'));
const evaluate = (manifest, testId, expected = profileFixture()) => evaluateAuthenticatedAcceptanceCase({
  testCase: catalog.cases.find(item => item.testId === testId), manifest, expected, catalog,
});
const localRawFixtures = () => {
  const raw = rawHostedFixtures();
  raw.binding.schemaVersion = 'local-real-backend-authenticated-profile-v1';
  raw.binding.executionKind = 'local_real_backend_authenticated';
  raw.binding.origin = 'http://127.0.0.1:4173';
  raw.binding.deploymentId = null;
  raw.binding.buildDigest = `sha256:${'c'.repeat(64)}`;
  raw.browserCorrelations.identity = authenticatedRawIdentity(raw.binding);
  raw.serverObservations.identity = authenticatedRawIdentity(raw.binding);
  return raw;
};

test('approved catalog changes remain bounded and all 47 cases require both projects', () => {
  assert.deepEqual(validateAuthenticatedCatalogRevision(catalog), []);
  assert.equal(AUTHENTICATED_ACCEPTANCE_TEST_IDS.length, 47);
  const manifest = manifestFixture();
  assert.deepEqual(validateAuthenticatedAcceptanceManifest(manifest, profileFixture(), catalog), []);
  for (const id of AUTHENTICATED_ACCEPTANCE_TEST_IDS) assert.equal(evaluate(manifest, id).status, 'PASS');
  const partial = structuredClone(manifest);
  partial.browserCorrelations.cases = partial.browserCorrelations.cases
    .filter(row => !(row.testId === 'E2E-001' && row.project === 'pixel-7-chromium'));
  assert.equal(evaluate(partial, 'E2E-001').status, 'BLOCKED');
});

test('local real-backend evidence reconstructs all 47 cases with an explicit non-hosted scope', () => {
  const raw = localRawFixtures();
  const manifest = produceAuthenticatedHostedEvidence({ ...raw, catalog });
  assert.deepEqual(manifest.scope, { evidenceScope: 'executed-local-real-backend-synthetic' });
  assert.deepEqual(validateAuthenticatedAcceptanceManifest(manifest, raw.binding, catalog), []);
  for (const id of AUTHENTICATED_ACCEPTANCE_TEST_IDS) {
    const result = evaluate(manifest, id, raw.binding);
    assert.equal(result.status, 'PASS');
    assert.equal(result.scope.evidenceScope, 'executed-local-real-backend-synthetic');
  }

  const wrongScope = structuredClone(manifest);
  wrongScope.scope.evidenceScope = 'executed-hosted-authenticated-synthetic';
  assert.deepEqual(validateAuthenticatedAcceptanceManifest(wrongScope, raw.binding, catalog),
    ['authenticated-manifest-scope']);
  const wrongBuild = structuredClone(raw.binding);
  wrongBuild.buildDigest = `sha256:${'9'.repeat(64)}`;
  assert.notDeepEqual(validateAuthenticatedAcceptanceManifest(manifest, wrongBuild, catalog), []);
});

test('raw frames, rather than supplied counts or authority booleans, determine mutation evidence', () => {
  const manifest = manifestFixture();
  const forged = structuredClone(manifest);
  forged.cases.find(row => row.testId === 'DELIVERY-001').measurements.logicalMutations = 0;
  assert.equal(evaluate(forged, 'DELIVERY-001').status, 'BLOCKED');
  const v1 = { schemaVersion: 'authenticated-acceptance-evidence-v1', binding: profileFixture(), cases: [],
    preflight: { authorityVerified: true }, cleanup: { scopedResidue: 0 } };
  assert.equal(evaluate(v1, 'DELIVERY-001').status, 'BLOCKED');
});

test('missing frames, mismatched hashes, stale sources and actor/session collapse fail closed', () => {
  for (const change of [
    raw => { raw.serverObservations.cases.pop(); },
    raw => { raw.browserCorrelations.identity.workflowAttempt = '2'; },
    raw => { raw.serverObservations.identity.sourceDigest = raw.binding.baselineDigest; },
    raw => { raw.serverObservations.cases[0].participants[0].sessionHash = raw.binding.actors[1].sessionHash; },
    raw => { raw.serverObservations.cases.find(row => row.testId === 'DELIVERY-001').after.records[0].commandBindingHash = raw.binding.sourceDigest; },
    raw => { raw.serverObservations.cases.find(row => row.testId === 'DELIVERY-001').after.records[0].source = 'forged_domain_rows'; },
    raw => { raw.serverObservations.cases.find(row => row.testId === 'DELIVERY-001').after.records[0].source = 'privileged_audit_events'; },
    raw => { raw.browserCorrelations.cases[0].assertions[0].actual = 'Bearer raw-secret-value'; },
  ]) {
    const raw = rawHostedFixtures(); change(raw);
    assert.throws(() => produceAuthenticatedHostedEvidence({ ...raw, catalog }));
  }
  const collapsed = profileFixture();
  collapsed.actors.find(actor => actor.persona === 'reviewer').actorHash = collapsed.actors.find(actor => actor.persona === 'author').actorHash;
  assert.throws(() => produceAuthenticatedHostedEvidence({ binding: collapsed,
    browserCorrelations: rawHostedFixtures().browserCorrelations, serverObservations: rawHostedFixtures().serverObservations, catalog }));
});

test('native Vault evidence requires exact created and absent physical observations for each AI-004 case',()=>{
  const valid=rawHostedFixtures();
  assert.doesNotThrow(()=>produceAuthenticatedHostedEvidence({...valid,catalog}));
  for(const change of [
    raw=>{raw.serverObservations.cleanup.resources=raw.serverObservations.cleanup.resources
      .filter(resource=>resource.kind!=='secret_material_created_verified');},
    raw=>{raw.serverObservations.cleanup.resources.find(resource=>resource.kind==='secret_material_absence_verified').resourceHash
      =raw.binding.sourceDigest;},
  ]){
    const raw=rawHostedFixtures();change(raw);
    assert.throws(()=>produceAuthenticatedHostedEvidence({...raw,catalog}),/authenticated-supabase-vault-physical/);
  }
  const hashicorp=rawHostedFixtures();
  hashicorp.binding.secretBackendKind='hashicorp_vault';
  hashicorp.browserCorrelations.identity=authenticatedRawIdentity(hashicorp.binding);
  hashicorp.serverObservations.identity=authenticatedRawIdentity(hashicorp.binding);
  hashicorp.serverObservations.cleanup.resources=hashicorp.serverObservations.cleanup.resources
    .filter(resource=>!resource.kind.startsWith('secret_material_'));
  assert.doesNotThrow(()=>produceAuthenticatedHostedEvidence({...hashicorp,catalog}));
});

test('request, receipt, audit and observation windows are independently correlated', () => {
  for (const change of [
    raw => { raw.serverObservations.cases.find(row => row.testId === 'AI-004').after.records
      .find(row => row.effectKind === 'receipt').receiptIdHash = raw.binding.sourceDigest; },
    raw => { raw.browserCorrelations.cases.find(row => row.testId === 'DELIVERY-001').actions[0].requestIdHash = raw.binding.sourceDigest; },
    raw => { raw.browserCorrelations.cases.find(row => row.testId === 'STUDIO-003').actions[0].browserPayloadHash = raw.binding.sourceDigest; },
    raw => { raw.serverObservations.cases.find(row => row.testId === 'DELIVERY-001').after.records
      .find(row => row.effectKind === 'domain').occurredAt = '2026-10-10T05:20:00.000Z'; },
    raw => { raw.serverObservations.cases.find(row => row.testId === 'STUDIO-003').after.records
      .find(row => row.effectKind === 'audit').auditIdHash = null; },
  ]) {
    const raw = rawHostedFixtures(); change(raw);
    assert.throws(() => produceAuthenticatedHostedEvidence({ ...raw, catalog }));
  }
});

test('ASSESS-003 accepts only one exact assessment.finalize mutation boundary', () => {
  const valid=rawHostedFixtures();
  assert.doesNotThrow(()=>produceAuthenticatedHostedEvidence({...valid,catalog}));
  for(const change of [
    raw=>{
      const action=raw.browserCorrelations.cases.find(row=>row.testId==='ASSESS-003').actions[0];
      action.commandBindingHash=authenticatedEvidenceDigest({requestIdHash:action.requestIdHash,
        actorHash:action.actorHash,commandType:'process.update'});
      const server=raw.serverObservations.cases.find(row=>row.testId==='ASSESS-003');
      for(const record of server.after.records)if(record.requestIdHash===action.requestIdHash){
        record.commandBindingHash=action.commandBindingHash;
      }
    },
    raw=>{
      const action=raw.browserCorrelations.cases.find(row=>row.testId==='ASSESS-003').actions[0];
      action.commandBindingHash=authenticatedEvidenceDigest({requestIdHash:action.requestIdHash,
        actorHash:action.actorHash,commandType:'assessment.response.upsert'});
      const server=raw.serverObservations.cases.find(row=>row.testId==='ASSESS-003');
      for(const record of server.after.records)if(record.requestIdHash===action.requestIdHash){
        record.commandBindingHash=action.commandBindingHash;
      }
    },
    raw=>{
      const server=raw.serverObservations.cases.find(row=>row.testId==='ASSESS-003');
      server.before.records.find(row=>row.source==='assessments').source='assess_processes';
      server.after.records.find(row=>row.source==='assessments').source='assess_processes';
    },
    raw=>{
      const server=raw.serverObservations.cases.find(row=>row.testId==='ASSESS-003');
      const extra=structuredClone(server.after.records.find(row=>row.source==='assess_command_receipts'));
      extra.recordHash=raw.binding.baselineDigest;
      extra.rowHash=raw.binding.sourceDigest;
      extra.businessRowHash=extra.rowHash;
      extra.receiptIdHash=raw.binding.catalogDigest;
      server.after.records.push(extra);
    },
  ]){
    const raw=rawHostedFixtures();change(raw);
    assert.throws(()=>produceAuthenticatedHostedEvidence({...raw,catalog}),
      /authenticated-assessment-finalize-boundary|server-observation/u);
  }
});

test('generation failure requires one concurrency-only aggregate write and replay receipts may preexist', () => {
  const valid = manifestFixture();
  assert.equal(valid.cases.find(row => row.testId === 'STUDIO-003').measurements.concurrencyWrites, 1);
  for (const change of [
    raw => {
      const observation = raw.serverObservations.cases.find(row => row.testId === 'STUDIO-003');
      observation.before.records = observation.before.records.filter(row => row.source !== 'studio_artifact_aggregates');
      observation.after.records = observation.after.records.filter(row => row.source !== 'studio_artifact_aggregates');
    },
    raw => {
      const aggregate = raw.serverObservations.cases.find(row => row.testId === 'STUDIO-003').after.records
        .find(row => row.source === 'studio_artifact_aggregates');
      aggregate.businessRowHash = raw.binding.sourceDigest;
    },
  ]) {
    const raw = rawHostedFixtures(); change(raw);
    assert.throws(() => produceAuthenticatedHostedEvidence({ ...raw, catalog }));
  }

  const replay = rawHostedFixtures();
  const delivery = replay.serverObservations.cases.find(row => row.testId === 'DELIVERY-001');
  const receipt = delivery.after.records.find(row => row.effectKind === 'receipt');
  receipt.occurredAt = '2026-10-10T05:09:50.000Z';
  delivery.before.records.push(structuredClone(receipt));
  const manifest = produceAuthenticatedHostedEvidence({ ...replay, catalog });
  assert.equal(manifest.cases.find(row => row.testId === 'DELIVERY-001').status, 'PASS');
});

test('unchanged multi-actor history does not become the current case participant', () => {
  const raw = rawHostedFixtures();
  const browser = raw.browserCorrelations.cases.find(row => row.testId === 'ADMIN-002' && row.project === 'desktop-chromium');
  const server = raw.serverObservations.cases.find(row => row.testId === 'ADMIN-002' && row.project === 'desktop-chromium');
  const outsider = raw.binding.actors.find(actor => actor.project === 'desktop-chromium' && actor.persona === 'outsider');
  const historical = structuredClone(raw.serverObservations.cases
    .find(row => row.testId === 'DELIVERY-001' && row.project === 'desktop-chromium').after.records
    .find(row => row.effectKind === 'domain'));
  historical.occurredAt = '2026-10-10T05:09:50.000Z';
  const participant = { persona: outsider.persona, actorHash: outsider.actorHash, sessionHash: outsider.sessionHash };
  browser.participants = [participant]; server.participants = [participant];
  browser.actions[0].actorHash = outsider.actorHash; browser.actions[0].sessionHash = outsider.sessionHash;
  server.before.records.push(structuredClone(historical));
  server.after.records.push(structuredClone(historical));
  const manifest = produceAuthenticatedHostedEvidence({ ...raw, catalog });
  assert.equal(manifest.cases.find(row => row.testId === 'ADMIN-002'
    && row.project === 'desktop-chromium').status, 'PASS');
});

test('cleanup distinguishes retained immutable history from active transient residue', () => {
  const valid = manifestFixture();
  assert.equal(valid.cleanup.activeTransientResidue, 0);
  assert.ok(valid.cleanup.retainedImmutableHistory > 0);
  for (const change of [
    raw => { raw.serverObservations.cleanup.resources[0].status = 'active'; },
    raw => { raw.serverObservations.cleanup.resources = raw.serverObservations.cleanup.resources
      .filter(resource => resource.classification !== 'retained_immutable'); },
    raw => { raw.serverObservations.cleanup.nonExerciseStateAfterHash = raw.binding.sourceDigest; },
  ]) {
    const raw = rawHostedFixtures(); change(raw);
    assert.throws(() => produceAuthenticatedHostedEvidence({ ...raw, catalog }));
  }
});

test('assertion failures remain FAIL after valid reconstruction', () => {
  const raw = rawHostedFixtures();
  const row = raw.browserCorrelations.cases.find(item => item.testId === 'DELIVERY-001');
  row.assertions[0].actual = false;
  const manifest = produceAuthenticatedHostedEvidence({ ...raw, catalog });
  assert.equal(evaluate(manifest, 'DELIVERY-001').status, 'FAIL');
});
