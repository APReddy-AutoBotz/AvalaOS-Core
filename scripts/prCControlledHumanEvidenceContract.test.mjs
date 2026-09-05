import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import {
  buildHumanObservationTemplate, buildPreparationEvidence, buildServerObserverRequest, buildVerifiedHumanSession, canonicalDigest, canonicalJson,
  CHECKPOINT_SCHEMA_VERSION, CONTROLLED_HUMAN_CATALOG, CONTROLLED_HUMAN_EXECUTION_ORDER,
  CONTROLLED_HUMAN_SERVER_ACTIONS,
  CONTROLLED_HUMAN_MIGRATION_PATH, controlledHumanEvidenceDisposition, createEdgeDeploymentManifest,
  createHumanCheckpoint, EDGE_DEPLOY_WORKFLOW, EDGE_MANIFEST_SCHEMA_VERSION, ENVIRONMENT,
  HUMAN_DUTY_BY_PERSONA, PREPARATION_SCHEMA_VERSION, PREVIEW_ORIGIN, PR_C_WORKFLOW,
  REQUIRED_EDGE_FUNCTIONS, REQUIRED_JOURNEYS, SESSION_SCHEMA_VERSION, sha256Digest,
  validateControlledHumanProofPairs, validateEdgeDeploymentManifest, validateHumanCheckpoint, validatePreparationEvidence, validateVerifiedHumanSession,
} from './prCControlledHumanEvidenceContract.mjs';
import { verifyPr264DeployPreview } from './buildPrCControlledHumanPreparation.mjs';
import { captureProviderDeployment } from './producePrCControlledHumanEdgeDeploymentManifest.mjs';

const root = path.resolve('.');
const head = 'a'.repeat(40);
const deployId = 'b'.repeat(24);
const d = value => sha256Digest(String(value));
const signingKey = 'controlled-human-test-signing-key-32-bytes-minimum';
const createdAt = '2026-09-04T10:00:00Z';
const migrationDigest = `sha256:${createHash('sha256').update(readFileSync(CONTROLLED_HUMAN_MIGRATION_PATH)).digest('hex')}`;
const common = {
  releaseSha: head, reviewHeadSha: head, prNumber: 264, deployId, deployOrigin: PREVIEW_ORIGIN,
  exerciseDigest: d('exercise'), targetFingerprint: d('target'), personaManifestDigest: d('personas'), fixtureManifestDigest: d('fixture'),
  publicTargetDigest: d('public-target'),
  environmentClass: ENVIRONMENT, migrationTip: '20260904120000', productionAuthorized: false, customerDataAuthorized: false, realProviderCallsAuthorized: false,
};

const controllerRecord = phase => ({
  contractVersion: 'pr-c-controlled-human-controller-1', phase, status: 'passed', ...common,
  ...(phase === 'preflight' ? { disposition: 'dedicated_empty', existingLifecycle: null, unexpectedDataCount: 0, providerRowCount: 0 } : {}),
  ...(phase === 'plan' ? { personaCount: 12, featureFlagCount: 11, seedStudioArtifactCount: 2, eligibleStudioArtifactCount: 2, seedPackageCount: 2, seedBaselineCount: 1, operations: ['bounded-seed'], deprovisionOperations: ['bounded-deprovision'] } : {}),
  ...(phase === 'apply' ? { personaCount: 12, studioArtifactCount: 2, eligibleStudioArtifactCount: 2, packageCount: 2, baselineCount: 1, lifecycle: 'active', concurrencyVersion: 1, replayed: false, authUsersCreated: 12, providerRowCount: 0, zeroEgress: true } : {}),
  ...(phase === 'verify' ? { personaCount: 12, activeMembershipCount: 11, studioArtifactCount: 2, eligibleStudioArtifactCount: 2, packageCount: 2, baselineCount: 1, providerRowCount: 0, lifecycle: 'active', concurrencyVersion: 1, featureFlagCount: 11, attestation: { status: 'matched' }, zeroEgress: true, unexpectedDataCount: 0 } : {}),
  ...(phase === 'quiesce' ? { lifecycle: 'read_only', concurrencyVersion: 2, featureFlagCountEnabled: 0, runtimeControlReadOnlyCount: 2, runtimeControlProviderEnabledCount: 0, operationEventSequence: 2, operationEventDigest: d('quiesce-event'), immutableHistoryDigest: d('quiesced-history'), transitionedAt: '2026-09-04T10:02:40.500Z' } : {}),
  ...(['deprovision','post-deprovision-verify'].includes(phase) ? {
    lifecycle: 'deprovisioned', concurrencyVersion: 3, replayed: phase === 'post-deprovision-verify', sessionsRevoked: 12, credentialsDisabled: 12,
    featureFlagCountEnabled: 0, runtimeControlReadOnlyCount: 2, runtimeControlProviderEnabledCount: 0, activeMembershipCount: 0,
    activeProfileCount: 0, activeOrganizationCount: 0, activeWorkspaceCount: 0, activePilotEnvironmentCount: 0, activePilotTenantCount: 0,
    activeSessionCount: 0, boundPersonaCount: 12, immutableHistoryRetained: true, domainRowsDeleted: 0,
    safety: { providerEgress: 0, realProviderCalls: 0, customerDataRecords: 0, externalUsers: 0 },
    postInspectionDigest: d(`${phase}-inspection`), immutableHistoryDigest: d('final-history'), quiescedHistoryDigest: d('quiesced-history'), operationEventCount: 5, operationEventSequence: 5, operationEventDigest: d('deprovision-event'),
  } : {}),
});

const migrationRecord = phase => ({
  contractVersion: 'pr-c-controlled-human-controller-1', phase, status: 'passed', environmentClass: ENVIRONMENT, ...common,
  migrationDigest, priorMigrationTip: '20260831062024', unexpectedDataCount: 0, providerRowCount: 0,
  ...(phase === 'migration-preflight' ? { disposition: 'exact_additive_apply' } : {}), ...(phase === 'migration-apply' ? { replayed: false } : {}),
});

const providerObservation = () => REQUIRED_EDGE_FUNCTIONS.map((name, index) => ({
  name, identityDigest: d(`provider-id-${name}`), bundleDigest: d(`provider-bundle-${name}`), deploymentReceiptDigest: d(`provider-receipt-${name}`),
  version: index + 1, updatedAtDigest: d(`provider-updated-${name}`), runtimeStatus: 401, observedAt: `2026-09-04T10:00:${String(index).padStart(2,'0')}Z`,
}));
const edgeProducer = { workflowPath: EDGE_DEPLOY_WORKFLOW, event: 'pull_request', runId: '987654321', runAttempt: 3, conclusion: 'success', artifactName: `pr264-controlled-human-edge-deployment-${head}-987654321-3` };
const edgeDeployment = () => createEdgeDeploymentManifest({ root, exactHead: head, targetFingerprint: common.targetFingerprint, exerciseDigest: common.exerciseDigest, deployId, personaManifestDigest: common.personaManifestDigest, fixtureManifestDigest: common.fixtureManifestDigest, migrationRecords: ['migration-preflight','migration-apply','migration-verify'].map(migrationRecord), providerObservation: providerObservation(), producer: edgeProducer, signingKey });

const preparation = () => buildPreparationEvidence({
  root, exactHead: head,
  github: { workflowPath: PR_C_WORKFLOW, runId: '123456789', runAttempt: 2, conclusion: 'success', artifactName: 'governed-delivery-monitor-pr-c-123456789-2', artifactDigest: d('ci-artifact') },
  preview: { origin: PREVIEW_ORIGIN, deployId, releaseSha: head, context: 'deploy-preview', reviewId: 264, siteName: 'avalaos-pilot', environment: ENVIRONMENT },
  controllerRecords: ['preflight','plan','apply','verify'].map(controllerRecord), edgeDeployment: edgeDeployment(), edgeProducer, edgeSigningKey: signingKey, edgeArtifactDigest: d('edge-artifact'), createdAt,
});

const orderedSteps = CONTROLLED_HUMAN_EXECUTION_ORDER.flatMap(checkpointId => {
  const record = CONTROLLED_HUMAN_CATALOG.find(item => item.checkpointId === checkpointId);
  return record.steps.map(step => ({ ...step, checkpointId }));
});
const ordinal = (checkpointId, stepId) => orderedSteps.findIndex(item => item.checkpointId === checkpointId && item.stepId === stepId);
const isoFor = seconds => new Date(Date.parse(createdAt) + seconds * 1000).toISOString().replace('.000Z','Z');
// Keep every active step inside the fixed pre-quiesce exercise window even as
// the canonical catalog grows. The final read-only observation remains after
// quiescence and is scheduled explicitly below.
const activeStepOffset = index => index * 1.9;
const serverActionByStep = new Map(CONTROLLED_HUMAN_SERVER_ACTIONS.map(item=>[`${item.checkpointId}\0${item.stepId}`,item]));
const serverEvents = new Set(CONTROLLED_HUMAN_SERVER_ACTIONS.filter(item=>item.observationKind==='server_event').map(item=>item.stepId));
const isDeniedStep = item => serverActionByStep.get(`${item.checkpointId}\0${item.stepId}`)?.observationKind==='negative_attempt';
const targetDigestFor = item => d(`target-${item.checkpointId}-${item.stepId}`);
const effectDigestFor = item => {
  const contract=serverActionByStep.get(`${item.checkpointId}\0${item.stepId}`);
  if(contract.transitionKind==='replay_existing')return effectDigestFor({...item,stepId:contract.replayOfStepId});
  return contract.transitionKind==='increment_one'&&contract.effectFamily===contract.targetFamily?targetDigestFor(item):d(`effect-${item.checkpointId}-${item.stepId}`);
};
const observedVersionFor = item => {
  const contract=serverActionByStep.get(`${item.checkpointId}\0${item.stepId}`);
  if(contract.transitionKind==='create_zero')return 0;
  if(contract.transitionKind==='increment_one')return 2;
  return 1;
};
const anchorFor = (item,index) => {
  const contract=serverActionByStep.get(`${item.checkpointId}\0${item.stepId}`);if(!contract)return null;
  return {contractVersion:'pr-c-controlled-human-step-anchor-1',stepId:item.stepId,action:contract.action,targetFamily:contract.targetFamily,
    targetDigest:targetDigestFor(item),expectedVersion:1,transitionKind:contract.transitionKind,selectorDigest:d(`selector-${item.stepId}`),intentDigest:d(`intent-${item.stepId}`),requestDigest:d(`request-${item.stepId}`),
    challengeToken:d(`anchor-${item.stepId}`),anchoredAt:isoFor(activeStepOffset(index)+0.5)};
};
const bindingFor = (item, index) => {
  const contract=serverActionByStep.get(`${item.checkpointId}\0${item.stepId}`);if(!contract)return null;
  const originalStep=contract.replayOfStepId??item.stepId;
  const ch03RequestResource=d('effect-CH-03-request-studio-handoff');
  const ch03ConsumeResource=d('effect-CH-03-accept-studio-handoff');
  const ch03GeneratedResource=d('effect-CH-03-generate-source-bound-document');
  const causalByStep={
    'request-studio-handoff':[d('not-applicable-parent-binding'),d('not-applicable-parent-resource'),d('ch03-request-lineage')],
    'review-studio-handoff':[d('binding-request-studio-handoff'),ch03RequestResource,d('ch03-request-lineage')],
    'approve-studio-handoff':[d('binding-review-studio-handoff'),ch03RequestResource,d('ch03-request-lineage')],
    'accept-studio-handoff':[d('binding-approve-studio-handoff'),ch03RequestResource,d('ch03-consumed-lineage')],
    'generate-source-bound-document':[d('binding-accept-studio-handoff'),ch03ConsumeResource,d('ch03-consumed-lineage')],
    'approve-hybrid-studio-document':[d('binding-generate-source-bound-document'),ch03GeneratedResource,d('ch03-consumed-lineage')],
  };
  const causal=causalByStep[item.stepId]??[d('not-applicable-parent-binding'),d('not-applicable-parent-resource'),d('not-applicable-lineage')];
  return {
    contractVersion: 'pr-c-controlled-human-step-binding-3', stepId: item.stepId, action: contract.action,
    result: isDeniedStep(item) ? 'denied' : 'succeeded', resourceFamily: isDeniedStep(item)?contract.targetFamily:contract.effectFamily,
    resourceDigest: isDeniedStep(item)?targetDigestFor(item):effectDigestFor(item), expectedVersion: 1, observedVersion: isDeniedStep(item)?1:observedVersionFor(item),
    requestDigest: d(`request-${item.stepId}`), receiptDigest: d(`receipt-${originalStep}`), auditDigest: d(`audit-${originalStep}`),intentDigest:d(`intent-${item.stepId}`),denialCodeDigest:d(`denial-code-${item.stepId}`),
    bindingToken: d(`binding-${item.stepId}`), anchorToken:d(`anchor-${item.stepId}`),
    causalParentBindingToken:causal[0],causalParentResourceDigest:causal[1],causalLineageDigest:causal[2],
    issuedAt: isoFor(activeStepOffset(index) + 1.5),
  };
};

const observations = role => buildHumanObservationTemplate(role).map(checkpoint => ({
  ...checkpoint,
  steps: checkpoint.steps.map(step => {
    const index = ordinal(checkpoint.checkpointId, step.stepId);
    const item = { ...step, checkpointId: checkpoint.checkpointId };
    const readOnly=step.stepId==='verify-history-readable-and-actions-absent';
    return { ...step, outcome: 'passed', startedAt:isoFor(readOnly?161:activeStepOffset(index)+0.1), completedAt: isoFor(readOnly?162:activeStepOffset(index)+1.8), browserArtifact: { artifactId: `${role}-${checkpoint.checkpointId.toLowerCase()}-${step.stepId}`, route: '/enterprise', viewport: 'desktop-chrome', assertions: [`observed-${step.stepId}`], interactionSequence: [`perform-${step.stepId}`], serverAnchor:anchorFor(item,index), serverBinding: bindingFor(item, index) } };
  }),
}));

const serverObserver = (role, roleObservations=observations(role)) => {
  const attempts=new Map(buildServerObserverRequest(role,roleObservations).steps.map(step=>[`${step.checkpointId}\0${step.stepId}`,step.attemptDigest]));
  const observedBindings=new Map(roleObservations.flatMap(record=>record.steps.map(step=>[`${record.checkpointId}\0${step.stepId}`,step.browserArtifact.serverBinding])));
  const steps = orderedSteps.filter(item => HUMAN_DUTY_BY_PERSONA[item.personaKey] === role).map((item,index) => {
    const binding=observedBindings.get(`${item.checkpointId}\0${item.stepId}`);
    return ({
    checkpointId: item.checkpointId, stepId: item.stepId, personaKey: item.personaKey,
    authenticatedPersonaDigest: d(`persona-${item.personaKey}`), capabilityDigest: d(`capability-${item.stepId}`), scopeDigest: d(`scope-${item.stepId}`),
    action: binding?.action??item.stepId, resourceKind: 'controlled-human-step', resourceFamily: binding?.resourceFamily??'controlled-human-step', humanAttemptDigest:attempts.get(`${item.checkpointId}\0${item.stepId}`), bindingToken:binding?.bindingToken??canonicalDigest('not-applicable'), safeBindingDigest:binding?canonicalDigest(binding):canonicalDigest({safeBinding:'not_applicable'}), causalEventDigest:serverEvents.has(item.stepId)?d(`causal-${item.stepId}`):canonicalDigest('not-applicable'),
    resourceDigest: binding?.resourceDigest??(item.stepId === 'verify-history-readable-and-actions-absent' ? d('quiesced-history') : d(`resource-${item.stepId}`)),
    expectedVersion: binding?.expectedVersion??(item.stepId === 'verify-history-readable-and-actions-absent' ? 2 : 1), version: binding?.observedVersion??(item.stepId === 'verify-history-readable-and-actions-absent' ? 2 : 1), requestIdentityDigest:binding?.requestDigest??canonicalDigest('not-applicable'),
    receiptDigest: binding?.receiptDigest??d(`receipt-${item.stepId}`), auditDigest: binding?.auditDigest??d(`audit-${item.stepId}`),
    observationKind: ((item.checkpointId === 'CH-12' && item.stepId.endsWith('-denied')) || (item.checkpointId === 'CH-13' && item.stepId.startsWith('reject-stale-'))) ? 'negative_attempt' : item.negative && /^(?:verify-|decline-|stop-with-no-)/u.test(item.stepId) ? 'no_effect' : serverEvents.has(item.stepId)?'server_event':'human_attestation',
    result: ((item.checkpointId === 'CH-12' && item.stepId.endsWith('-denied')) || (item.checkpointId === 'CH-13' && item.stepId.startsWith('reject-stale-'))) ? 'denied' : item.negative && /^(?:verify-|decline-|stop-with-no-)/u.test(item.stepId) ? 'no_effect_observed' : serverEvents.has(item.stepId)?'succeeded':'attested',
    denialProofKind: isDeniedStep(item) ? (item.stepId.includes('projection') ? 'server_denied_attempt' : 'denied_audit') : 'not_applicable',
    denialCodeDigest: d(`${item.negative ? 'denied' : 'not-denied'}-${item.stepId}`),
    observedDeltas: { receipt: 0, audit: 0, target: 0, itemVersion: 0, approval: 0, baseline: 0 },
    safety: { providerEgress: 0, realProviderCalls: 0, customerDataRecords: 0, externalUsers: 0 },
    serverObservedAt: isoFor(200 + index), inspectionDigest: d(`inspection-${role}-${item.stepId}`),
  });});
  return { contractVersion: 'pr-c-controlled-human-controller-1', phase: 'checkpoint-observe', status: 'passed', ...common, humanRole: role, requestDigest: canonicalDigest(buildServerObserverRequest(role, roleObservations)), observedAt: '2026-09-04T10:04:30Z', lifecycle: 'read_only', concurrencyVersion: 2, operationEventSequence: 2, operationEventDigest: d(`observer-events-${role}`), immutableHistoryDigest: d('quiesced-history'), inspectionDigest: d(`observer-${role}`), steps };
};

const checkpoint = (role, actor, runId, commentId) => createHumanCheckpoint({ preparation: preparation(), quiesceRecord: controllerRecord('quiesce'), humanRole: role, actor, comment: { commentId, createdAt: '2026-09-04T10:05:00Z', updatedAt: '2026-09-04T10:05:00Z' }, workflowRunId: runId, workflowRunAttempt: 1, observations: observations(role), serverObserver: serverObserver(role), signingKey, capturedAt: '2026-09-04T10:06:00Z' });
const checkpoints = () => [checkpoint('requester','human-one','1001','2001'),checkpoint('reviewer','human-two','1002','2002'),checkpoint('approver','human-three','1003','2003')];
const session = () => buildVerifiedHumanSession({ preparation: preparation(), checkpoints: checkpoints(), quiesceRecord: controllerRecord('quiesce'), deprovisionRecord: controllerRecord('deprovision'), postDeprovisionRecord: controllerRecord('post-deprovision-verify'), signingKey, completedAt: '2026-09-04T10:07:00Z' });
const clone = structuredClone;
const resignCheckpoint = signed => {
  const {signature: _signature,...payload}=signed;
  signed.signature=`hmac-sha256:${createHmac('sha256',signingKey).update(canonicalJson(payload)).digest('hex')}`;
  return signed;
};

test('validates one authentic-shaped envelope for every server-owned action contract',()=>{
  const pairs=CONTROLLED_HUMAN_SERVER_ACTIONS.map(contract=>{
    const item={checkpointId:contract.checkpointId,stepId:contract.stepId};const index=ordinal(item.checkpointId,item.stepId);
    return {...item,anchor:anchorFor(item,index),binding:bindingFor(item,index)};
  });
  assert.equal(validateControlledHumanProofPairs(pairs),pairs);
  const wrongEffect=clone(pairs);wrongEffect.find(pair=>pair.stepId==='create-baseline-with-exact-package-selectors').binding.resourceFamily='delivery_work_package';
  assert.throws(()=>validateControlledHumanProofPairs(wrongEffect),/CATALOG/u);
  const substitutedValidChain=clone(pairs);
  const substitutedGeneration=substitutedValidChain.find(pair=>pair.stepId==='generate-source-bound-document').binding;
  substitutedGeneration.causalParentResourceDigest=d('second-valid-chain-artifact');
  substitutedGeneration.causalLineageDigest=d('second-valid-consumed-chain');
  assert.throws(()=>validateControlledHumanProofPairs(substitutedValidChain),/CH03_GENERATION_CHAIN/u);
});

test('accepts exact preparation, duty fragments, backend observers, lifecycle controls, and independent post-reset verification', () => {
  const prepared = preparation(); assert.equal(validatePreparationEvidence(prepared), prepared);
  for (const signed of checkpoints()) assert.equal(validateHumanCheckpoint({ preparation: prepared, quiesceRecord: controllerRecord('quiesce'), checkpoint: signed, signingKey }), signed);
  const verified = session(); assert.equal(validateVerifiedHumanSession(verified), verified); assert.equal(verified.checkpoints.length, 14); assert.equal(verified.journeys.length, 8);
  assert.deepEqual(controlledHumanEvidenceDisposition(verified), { testId:'CONTROLLED-HUMAN', result:'passed', sessionDigest:canonicalDigest(verified), exactHead:head });
});

test('final session rejects a signed, well-formed second-valid CH-03 generation chain substitution', () => {
  const requesterObservations=observations('requester');
  const generated=requesterObservations.flatMap(record=>record.steps).find(step=>step.stepId==='generate-source-bound-document').browserArtifact.serverBinding;
  const approverObservations=observations('approver');
  const hybrid=approverObservations.flatMap(record=>record.steps).find(step=>step.stepId==='approve-hybrid-studio-document');
  generated.causalParentBindingToken=d('second-valid-consumed-binding');
  generated.causalParentResourceDigest=d('second-valid-consumed-resource');
  generated.causalLineageDigest=d('second-valid-consumed-lineage');
  // The downstream hybrid proof remains internally bound to the substituted
  // generation, so this is not a malformed field mutation. Only the final
  // cross-role aggregate can prove that the generation did not descend from
  // the accepted handoff recorded by the other signed checkpoints.
  hybrid.browserArtifact.serverBinding.causalParentBindingToken=generated.bindingToken;
  hybrid.browserArtifact.serverBinding.causalParentResourceDigest=generated.resourceDigest;
  hybrid.browserArtifact.serverBinding.causalLineageDigest=generated.causalLineageDigest;
  const requester=createHumanCheckpoint({preparation:preparation(),quiesceRecord:controllerRecord('quiesce'),humanRole:'requester',actor:'human-one',comment:{commentId:'2001',createdAt:'2026-09-04T10:05:00Z',updatedAt:'2026-09-04T10:05:00Z'},workflowRunId:'1001',workflowRunAttempt:1,observations:requesterObservations,serverObserver:serverObserver('requester',requesterObservations),signingKey,capturedAt:'2026-09-04T10:06:00Z'});
  const approver=createHumanCheckpoint({preparation:preparation(),quiesceRecord:controllerRecord('quiesce'),humanRole:'approver',actor:'human-three',comment:{commentId:'2003',createdAt:'2026-09-04T10:05:00Z',updatedAt:'2026-09-04T10:05:00Z'},workflowRunId:'1003',workflowRunAttempt:1,observations:approverObservations,serverObserver:serverObserver('approver',approverObservations),signingKey,capturedAt:'2026-09-04T10:06:00Z'});
  assert.throws(()=>buildVerifiedHumanSession({preparation:preparation(),checkpoints:[requester,checkpoint('reviewer','human-two','1002','2002'),approver],quiesceRecord:controllerRecord('quiesce'),deprovisionRecord:controllerRecord('deprovision'),postDeprovisionRecord:controllerRecord('post-deprovision-verify'),signingKey,completedAt:'2026-09-04T10:07:00Z'}),/AUTHENTIC_CH03_GENERATION_CHAIN/u);

  const causallyEdited=checkpoint('requester','human-one','1001','2001');
  const retained=causallyEdited.checkpoints.flatMap(record=>record.steps).find(step=>step.stepId==='generate-source-bound-document');
  retained.browserArtifact.content.serverBinding.causalParentBindingToken=d('signed-edited-parent-binding');
  retained.browserArtifact.content.serverBinding.causalParentResourceDigest=d('signed-edited-parent-resource');
  retained.browserArtifact.content.serverBinding.causalLineageDigest=d('signed-edited-lineage');
  const bytes=Buffer.from(canonicalJson(retained.browserArtifact.content),'utf8');
  retained.browserArtifact.byteLength=bytes.length;retained.browserArtifact.digest=sha256Digest(bytes);
  const raw=causallyEdited.checkpoints.map(record=>({...record,steps:record.steps.map(step=>({...step,browserArtifact:step.browserArtifact.content}))}));
  const observerStep=causallyEdited.serverObserver.record.steps.find(step=>step.stepId==='generate-source-bound-document');
  observerStep.humanAttemptDigest=retained.browserArtifact.digest;
  causallyEdited.serverObserver.record.requestDigest=canonicalDigest(buildServerObserverRequest('requester',raw));
  causallyEdited.serverObserver.artifactDigest=canonicalDigest(causallyEdited.serverObserver.record);
  resignCheckpoint(causallyEdited);
  assert.throws(()=>buildVerifiedHumanSession({preparation:preparation(),checkpoints:[causallyEdited,checkpoint('reviewer','human-two','1002','2002'),checkpoint('approver','human-three','1003','2003')],quiesceRecord:controllerRecord('quiesce'),deprovisionRecord:controllerRecord('deprovision'),postDeprovisionRecord:controllerRecord('post-deprovision-verify'),signingKey,completedAt:'2026-09-04T10:07:00Z'}),/SAFE_BINDING_DIGEST/u);
});

test('keeps absent controlled-human evidence not_run', () => assert.equal(controlledHumanEvidenceDisposition().result, 'not_run'));

test('maps every application persona to exactly one human duty and reconstructs all checkpoints', () => {
  assert.deepEqual(CONTROLLED_HUMAN_EXECUTION_ORDER, ['CH-01','CH-02','CH-03','CH-04','CH-05','CH-06','CH-07','CH-08','CH-09','CH-10','CH-11','CH-12','CH-14','CH-13']);
  for (const record of CONTROLLED_HUMAN_CATALOG) for (const step of record.steps) assert.ok(['requester','reviewer','approver'].includes(HUMAN_DUTY_BY_PERSONA[step.personaKey]));
  assert.deepEqual([...new Set(CONTROLLED_HUMAN_CATALOG.map(record=>record.journeyId))], REQUIRED_JOURNEYS);
});

test('rejects caller-authored counters, digests, and partial duty coverage', () => {
  const records = observations('requester'); records[0].steps[0].providerEgressCount = 0;
  assert.throws(() => createHumanCheckpoint({ preparation:preparation(), quiesceRecord:controllerRecord('quiesce'), humanRole:'requester', actor:'h', comment:{commentId:'1',createdAt:'2026-09-04T10:05:00Z',updatedAt:'2026-09-04T10:05:00Z'}, workflowRunId:'1', workflowRunAttempt:1, observations:records, serverObserver:serverObserver('requester'), signingKey, capturedAt:'2026-09-04T10:06:00Z' }), /UNKNOWN/u);
  const partial=observations('reviewer'); partial[0].steps.pop();
  assert.throws(() => createHumanCheckpoint({ preparation:preparation(), quiesceRecord:controllerRecord('quiesce'), humanRole:'reviewer', actor:'h', comment:{commentId:'2',createdAt:'2026-09-04T10:05:00Z',updatedAt:'2026-09-04T10:05:00Z'}, workflowRunId:'2', workflowRunAttempt:1, observations:partial, serverObserver:serverObserver('reviewer'), signingKey, capturedAt:'2026-09-04T10:06:00Z' }), /STEP_SET/u);
});

test('rejects random or reused browser and server digests', () => {
  const records=observations('requester'); records[0].steps[1].browserArtifact=clone(records[0].steps[0].browserArtifact);
  assert.throws(() => createHumanCheckpoint({ preparation:preparation(), quiesceRecord:controllerRecord('quiesce'), humanRole:'requester', actor:'h', comment:{commentId:'1',createdAt:'2026-09-04T10:05:00Z',updatedAt:'2026-09-04T10:05:00Z'}, workflowRunId:'1', workflowRunAttempt:1, observations:records, serverObserver:serverObserver('requester'), signingKey, capturedAt:'2026-09-04T10:06:00Z' }), /SERVER_OBSERVER_REQUEST|BROWSER_DIGEST_REUSE/u);
  const observer=serverObserver('reviewer'); observer.steps[1].inspectionDigest=observer.steps[0].inspectionDigest;
  assert.throws(() => createHumanCheckpoint({ preparation:preparation(), quiesceRecord:controllerRecord('quiesce'), humanRole:'reviewer', actor:'h', comment:{commentId:'2',createdAt:'2026-09-04T10:05:00Z',updatedAt:'2026-09-04T10:05:00Z'}, workflowRunId:'2', workflowRunAttempt:1, observations:observations('reviewer'), serverObserver:observer, signingKey, capturedAt:'2026-09-04T10:06:00Z' }), /DIGEST_REUSE/u);
  const reusedEvent=serverObserver('reviewer');const eventSteps=reusedEvent.steps.filter(step=>step.observationKind==='server_event');assert.ok(eventSteps.length>1);eventSteps[1].causalEventDigest=eventSteps[0].causalEventDigest;
  assert.throws(() => createHumanCheckpoint({ preparation:preparation(), quiesceRecord:controllerRecord('quiesce'), humanRole:'reviewer', actor:'h', comment:{commentId:'2',createdAt:'2026-09-04T10:05:00Z',updatedAt:'2026-09-04T10:05:00Z'}, workflowRunId:'2', workflowRunAttempt:1, observations:observations('reviewer'), serverObserver:reusedEvent, signingKey, capturedAt:'2026-09-04T10:06:00Z' }), /CAUSAL_EVENT_REUSE/u);
});

test('rejects stale or reused step times and edited comments', () => {
  const records=observations('approver'); records[0].steps[0].startedAt='2026-09-04T09:59:00Z';
  const observer=serverObserver('approver'); observer.requestDigest=canonicalDigest(buildServerObserverRequest('approver',records));
  assert.throws(() => createHumanCheckpoint({ preparation:preparation(), quiesceRecord:controllerRecord('quiesce'), humanRole:'approver', actor:'h', comment:{commentId:'3',createdAt:'2026-09-04T10:05:00Z',updatedAt:'2026-09-04T10:05:00Z'}, workflowRunId:'3', workflowRunAttempt:1, observations:records, serverObserver:observer, signingKey, capturedAt:'2026-09-04T10:06:00Z' }), /TIME_BOUNDARY/u);
  assert.throws(() => createHumanCheckpoint({ preparation:preparation(), quiesceRecord:controllerRecord('quiesce'), humanRole:'approver', actor:'h', comment:{commentId:'3',createdAt:'2026-09-04T10:05:00Z',updatedAt:'2026-09-04T10:05:01Z'}, workflowRunId:'3', workflowRunAttempt:1, observations:observations('approver'), serverObserver:serverObserver('approver'), signingKey, capturedAt:'2026-09-04T10:06:00Z' }), /COMMENT_IDENTITY/u);
});

test('rejects active work after quiesce and read-only observation before quiesce', () => {
  const lateActive=observations('requester');
  lateActive[0].steps[0].completedAt='2026-09-04T10:03:00Z';
  const lateObserver=serverObserver('requester');
  lateObserver.requestDigest=canonicalDigest(buildServerObserverRequest('requester',lateActive));
  assert.throws(() => createHumanCheckpoint({ preparation:preparation(), quiesceRecord:controllerRecord('quiesce'), humanRole:'requester', actor:'h', comment:{commentId:'1',createdAt:'2026-09-04T10:05:00Z',updatedAt:'2026-09-04T10:05:00Z'}, workflowRunId:'1', workflowRunAttempt:1, observations:lateActive, serverObserver:lateObserver, signingKey, capturedAt:'2026-09-04T10:06:00Z' }), /ACTIVE_STEP_AFTER_QUIESCE/u);

  const earlyReadOnly=observations('reviewer');
  const readOnlyStep=earlyReadOnly.flatMap(record=>record.steps).find(step=>step.stepId==='verify-history-readable-and-actions-absent');
  readOnlyStep.startedAt='2026-09-04T10:02:39.250Z';
  readOnlyStep.completedAt='2026-09-04T10:02:40.250Z';
  const earlyObserver=serverObserver('reviewer');
  earlyObserver.requestDigest=canonicalDigest(buildServerObserverRequest('reviewer',earlyReadOnly));
  assert.throws(() => createHumanCheckpoint({ preparation:preparation(), quiesceRecord:controllerRecord('quiesce'), humanRole:'reviewer', actor:'h', comment:{commentId:'2',createdAt:'2026-09-04T10:05:00Z',updatedAt:'2026-09-04T10:05:00Z'}, workflowRunId:'2', workflowRunAttempt:1, observations:earlyReadOnly, serverObserver:earlyObserver, signingKey, capturedAt:'2026-09-04T10:06:00Z' }), /READ_ONLY_STEP_BEFORE_QUIESCE/u);
});

test('rejects persona/actor substitution and one human filling multiple duties', () => {
  const observer=serverObserver('reviewer'); observer.steps[0].personaKey='requester';
  assert.throws(() => createHumanCheckpoint({ preparation:preparation(), quiesceRecord:controllerRecord('quiesce'), humanRole:'reviewer', actor:'h', comment:{commentId:'2',createdAt:'2026-09-04T10:05:00Z',updatedAt:'2026-09-04T10:05:00Z'}, workflowRunId:'2', workflowRunAttempt:1, observations:observations('reviewer'), serverObserver:observer, signingKey, capturedAt:'2026-09-04T10:06:00Z' }), /IDENTITY/u);
  assert.throws(() => buildVerifiedHumanSession({ preparation:preparation(), checkpoints:[checkpoint('requester','same','1001','2001'),checkpoint('reviewer','same','1002','2002'),checkpoint('approver','same','1003','2003')], quiesceRecord:controllerRecord('quiesce'), deprovisionRecord:controllerRecord('deprovision'), postDeprovisionRecord:controllerRecord('post-deprovision-verify'), signingKey, completedAt:'2026-09-04T10:07:00Z' }), /DISTINCT_HUMANS/u);
});

test('rejects fake zeroes and accepted-versus-denied confusion from server observer', () => {
  const egress=serverObserver('reviewer'); egress.steps[0].safety.providerEgress=1;
  assert.throws(() => createHumanCheckpoint({ preparation:preparation(), quiesceRecord:controllerRecord('quiesce'), humanRole:'reviewer', actor:'h', comment:{commentId:'2',createdAt:'2026-09-04T10:05:00Z',updatedAt:'2026-09-04T10:05:00Z'}, workflowRunId:'2', workflowRunAttempt:1, observations:observations('reviewer'), serverObserver:egress, signingKey, capturedAt:'2026-09-04T10:06:00Z' }), /STOP_COUNT/u);
  const denial=serverObserver('reviewer'); const negative=denial.steps.find(record=>record.observationKind==='negative_attempt'); negative.result='succeeded';
  assert.throws(() => createHumanCheckpoint({ preparation:preparation(), quiesceRecord:controllerRecord('quiesce'), humanRole:'reviewer', actor:'h', comment:{commentId:'2',createdAt:'2026-09-04T10:05:00Z',updatedAt:'2026-09-04T10:05:00Z'}, workflowRunId:'2', workflowRunAttempt:1, observations:observations('reviewer'), serverObserver:denial, signingKey, capturedAt:'2026-09-04T10:06:00Z' }), /RESULT|DENIAL_PROOF/u);
});

test('distinguishes attempted denials, no-effect observations, human attestations, and exact server events', () => {
  const observer=serverObserver('reviewer');
  assert.equal(observer.steps.find(record=>record.stepId==='revoked-actor-mutation-denied').result,'denied');
  assert.equal(observer.steps.find(record=>record.stepId==='revoked-actor-mutation-denied').denialProofKind,'denied_audit');
  assert.equal(observer.steps.find(record=>record.stepId==='verify-no-monitor-mutation-controls').result,'no_effect_observed');
  assert.equal(observer.steps.find(record=>record.stepId==='request-handoff-changes').observationKind,'server_event');
  assert.equal(observer.steps.find(record=>record.stepId==='compare-enterprise-and-primary-monitor').observationKind,'human_attestation');
  const substituted=serverObserver('reviewer'); substituted.steps.find(record=>record.observationKind==='negative_attempt').denialProofKind='not_applicable';
  assert.throws(() => createHumanCheckpoint({ preparation:preparation(), quiesceRecord:controllerRecord('quiesce'), humanRole:'reviewer', actor:'h', comment:{commentId:'2',createdAt:'2026-09-04T10:05:00Z',updatedAt:'2026-09-04T10:05:00Z'}, workflowRunId:'2', workflowRunAttempt:1, observations:observations('reviewer'), serverObserver:substituted, signingKey, capturedAt:'2026-09-04T10:06:00Z' }), /DENIAL_PROOF/u);
});

test('rejects exact-binding target, version, family, request, time, and reuse substitutions', () => {
  const invoke = (records, observer) => createHumanCheckpoint({ preparation:preparation(), quiesceRecord:controllerRecord('quiesce'), humanRole:'reviewer', actor:'h', comment:{commentId:'2',createdAt:'2026-09-04T10:05:00Z',updatedAt:'2026-09-04T10:05:00Z'}, workflowRunId:'2', workflowRunAttempt:1, observations:records, serverObserver:observer, signingKey, capturedAt:'2026-09-04T10:06:00Z' });
  for (const [field,value] of [['resourceDigest',d('different-valid-owned-resource')],['resourceFamily','different_valid_family'],['expectedVersion',2],['requestDigest',d('substituted-request')],['receiptDigest',d('aggregate-receipt')],['action','different.valid.action']]) {
    const records=observations('reviewer'); const bound=records.flatMap(record=>record.steps).find(step=>step.browserArtifact.serverBinding);
    bound.browserArtifact.serverBinding[field]=value;
    assert.throws(()=>invoke(records,serverObserver('reviewer')),/SERVER_OBSERVER_REQUEST|EXACT_BINDING|VERSION_BINDING|SAME_TRANSITION|TWO_PHASE_IDENTITY|CATALOG/u,field);
  }
  const outside=observations('reviewer'); const outsideStep=outside.flatMap(record=>record.steps).find(step=>step.browserArtifact.serverBinding);
  outsideStep.browserArtifact.serverBinding.issuedAt='2026-09-04T10:04:00Z';
  assert.throws(()=>invoke(outside,serverObserver('reviewer')),/BINDING_TIME_BOUNDARY/u);
  const reused=observations('reviewer'); const boundSteps=reused.flatMap(record=>record.steps).filter(step=>step.browserArtifact.serverBinding);
  boundSteps[1].browserArtifact.serverBinding.bindingToken=boundSteps[0].browserArtifact.serverBinding.bindingToken;
  const reusedObserver=serverObserver('reviewer'); reusedObserver.requestDigest=canonicalDigest(buildServerObserverRequest('reviewer',reused));
  reusedObserver.steps.find(record=>record.stepId===boundSteps[1].stepId).bindingToken=boundSteps[0].browserArtifact.serverBinding.bindingToken;
  assert.throws(()=>invoke(reused,reusedObserver),/BINDING_REUSE|EXACT_BINDING|SAFE_BINDING_DIGEST/u);
});

test('rejects missing artifact bytes and tampered server attestation', () => {
  const signed=checkpoint('requester','human-one','1001','2001'); delete signed.checkpoints[0].steps[0].browserArtifact.content;
  assert.throws(() => validateHumanCheckpoint({preparation:preparation(),quiesceRecord:controllerRecord('quiesce'),checkpoint:signed,signingKey}), /REQUIRED/u);
  const tampered=checkpoint('requester','human-one','1001','2001'); tampered.serverObserver.record.steps[0].auditDigest=d('fake-audit');
  assert.throws(() => validateHumanCheckpoint({preparation:preparation(),quiesceRecord:controllerRecord('quiesce'),checkpoint:tampered,signingKey}), /SERVER_OBSERVER_DIGEST|SIGNATURE/u);
  const invoke=observer=>createHumanCheckpoint({preparation:preparation(),quiesceRecord:controllerRecord('quiesce'),humanRole:'requester',actor:'human-one',comment:{commentId:'2001',createdAt:'2026-09-04T10:05:00Z',updatedAt:'2026-09-04T10:05:00Z'},workflowRunId:'1001',workflowRunAttempt:1,observations:observations('requester'),serverObserver:observer,signingKey,capturedAt:'2026-09-04T10:06:00Z'});
  const altered=serverObserver('requester');altered.steps.find(step=>step.stepId==='generate-source-bound-document').safeBindingDigest=d('altered-server-safe-binding');
  assert.throws(()=>invoke(altered),/SAFE_BINDING_DIGEST/u);
  const omitted=serverObserver('requester');delete omitted.steps[0].safeBindingDigest;
  assert.throws(()=>invoke(omitted),/SERVER_STEP/u);
  const extra=serverObserver('requester');extra.steps[0].browserSafeBindingDigest=extra.steps[0].safeBindingDigest;
  assert.throws(()=>invoke(extra),/SERVER_STEP/u);
});

test('rejects stale run attempts and copied signatures', () => {
  const signed=checkpoint('requester','human-one','1001','2001'); signed.capture.runAttempt=0;
  assert.throws(() => validateHumanCheckpoint({preparation:preparation(),quiesceRecord:controllerRecord('quiesce'),checkpoint:signed,signingKey}), /CAPTURE_IDENTITY/u);
});

test('rejects fake deployment receipt, local-equals-deployed claims, and partial function sets', () => {
  const manifest=edgeDeployment(); manifest.functions[0].provider.deploymentReceiptDigest='sha256:'+'0'.repeat(64);
  assert.throws(() => validateEdgeDeploymentManifest(manifest,{root,exactHead:head,targetFingerprint:common.targetFingerprint,exerciseDigest:common.exerciseDigest,producer:edgeProducer,signingKey}), /SIGNATURE/u);
  const localClaim=edgeDeployment(); localClaim.functions[0].deployedSourceDigest=localClaim.functions[0].sourceDigest;
  assert.throws(() => validateEdgeDeploymentManifest(localClaim,{root,exactHead:head,targetFingerprint:common.targetFingerprint,exerciseDigest:common.exerciseDigest,producer:edgeProducer,signingKey}), /UNKNOWN/u);
  const partial=edgeDeployment(); partial.functions.pop();
  assert.throws(() => validateEdgeDeploymentManifest(partial,{root,exactHead:head,targetFingerprint:common.targetFingerprint,exerciseDigest:common.exerciseDigest,producer:edgeProducer,signingKey}), /FUNCTION_SET/u);
});

test('derives deployment receipts from provider inventory changes and runtime endpoints', async () => {
  const inventory=REQUIRED_EDGE_FUNCTIONS.map((name,index)=>({id:`provider-${name}`,slug:name,status:'ACTIVE',version:index+2,updated_at:`updated-${index}`,ezbr_sha256:`bundle-sha-${name}`}));
  const baseline={schemaVersion:'pr-c-controlled-human-edge-provider-baseline-1',observedAt:createdAt,functions:REQUIRED_EDGE_FUNCTIONS.map((name,index)=>({name,version:index+1,identityDigest:d(`old-id-${name}`),bundleDigest:d(`old-bundle-${name}`),updatedAtDigest:d(`old-updated-${name}`)}))};
  let calls=0; const fetchImpl=async()=>calls++===0?new Response(JSON.stringify(inventory),{status:200,headers:{'content-type':'application/json'}}):new Response(null,{status:401});
  const records=await captureProviderDeployment({env:{SUPABASE_PROJECT_REF:'a'.repeat(20),SUPABASE_ACCESS_TOKEN:'x'.repeat(32)},baseline,fetchImpl});
  assert.equal(records.length,REQUIRED_EDGE_FUNCTIONS.length); assert.ok(records.every(record=>record.runtimeStatus===401 && record.deploymentReceiptDigest.startsWith('sha256:')));
});

test('rejects stale provider inventory and missing runtime deployment', async () => {
  const inventory=REQUIRED_EDGE_FUNCTIONS.map((name,index)=>({id:`provider-${name}`,slug:name,status:'ACTIVE',version:index+1,updated_at:`updated-${index}`,ezbr_sha256:`bundle-sha-${name}`}));
  const baseline={schemaVersion:'pr-c-controlled-human-edge-provider-baseline-1',observedAt:createdAt,functions:inventory.map(record=>({name:record.slug,version:record.version,identityDigest:d(`provider-id-${record.slug}`),bundleDigest:d(`provider-bundle\0${record.slug}\0${record.ezbr_sha256}`),updatedAtDigest:d(`provider-updated\0${record.slug}\0${record.updated_at}`)}))};
  const fetchImpl=async()=>new Response(JSON.stringify(inventory),{status:200,headers:{'content-type':'application/json'}});
  await assert.rejects(()=>captureProviderDeployment({env:{SUPABASE_PROJECT_REF:'a'.repeat(20),SUPABASE_ACCESS_TOKEN:'x'.repeat(32)},baseline,fetchImpl}),/STALE_DEPLOYMENT/u);
});

test('requires real pre-comment CH-13 quiesce binding and independent post-deprovision inspection', () => {
  const wrong=controllerRecord('quiesce'); wrong.operationEventDigest=d('wrong');
  assert.throws(() => buildVerifiedHumanSession({preparation:preparation(),checkpoints:checkpoints(),quiesceRecord:wrong,deprovisionRecord:controllerRecord('deprovision'),postDeprovisionRecord:controllerRecord('post-deprovision-verify'),signingKey,completedAt:'2026-09-04T10:07:00Z'}), /CHECKPOINT_QUIESCE/u);
  const copied=controllerRecord('post-deprovision-verify'); copied.postInspectionDigest=controllerRecord('deprovision').postInspectionDigest;
  assert.throws(() => buildVerifiedHumanSession({preparation:preparation(),checkpoints:checkpoints(),quiesceRecord:controllerRecord('quiesce'),deprovisionRecord:controllerRecord('deprovision'),postDeprovisionRecord:copied,signingKey,completedAt:'2026-09-04T10:07:00Z'}), /POST_DEPROVISION_INDEPENDENCE/u);
});

test('rejects provider traffic first observed after human checkpoint capture', () => {
  const post=controllerRecord('post-deprovision-verify'); post.safety.providerEgress=1;
  assert.throws(() => buildVerifiedHumanSession({preparation:preparation(),checkpoints:checkpoints(),quiesceRecord:controllerRecord('quiesce'),deprovisionRecord:controllerRecord('deprovision'),postDeprovisionRecord:post,signingKey,completedAt:'2026-09-04T10:07:00Z'}), /STOP_COUNT/u);
});

test('rejects wrong preview and unsafe evidence', () => {
  const p=preparation(); p.preview.origin='https://avalaos.com'; assert.throws(()=>validatePreparationEvidence(p),/PREVIEW/u);
});

test('verifies preview headers and rejects substituted release', async () => {
  const good=async()=>new Response('<div id="root"></div>',{headers:{'x-avalaos-release':head,'x-avalaos-environment':ENVIRONMENT,'x-avalaos-netlify-deploy-id':deployId}});
  assert.equal((await verifyPr264DeployPreview({exactHead:head,deployId,fetchImpl:good})).origin,PREVIEW_ORIGIN);
  const wrong=async()=>new Response('<div id="root"></div>',{headers:{'x-avalaos-release':'f'.repeat(40),'x-avalaos-environment':ENVIRONMENT,'x-avalaos-netlify-deploy-id':deployId}});
  await assert.rejects(()=>verifyPr264DeployPreview({exactHead:head,deployId,fetchImpl:wrong}),/PREVIEW_HEADERS/u);
});

test('published schemas are fail-closed and version-aligned', () => {
  for (const [name,version] of [['pr-c-controlled-human-preparation.schema.json',PREPARATION_SCHEMA_VERSION],['pr-c-controlled-human-edge-deployment.schema.json',EDGE_MANIFEST_SCHEMA_VERSION],['pr-c-controlled-human-checkpoint.schema.json',CHECKPOINT_SCHEMA_VERSION],['pr-c-controlled-human-session.schema.json',SESSION_SCHEMA_VERSION]]) {
    const schema=JSON.parse(readFileSync(path.join(root,'testing/process-lifecycle/contracts',name),'utf8')); assert.equal(schema.additionalProperties,false); assert.equal(schema.properties.schemaVersion.const,version);
  }
});

test('validates authentic built artifacts against every published JSON Schema and rejects 82/84-step totals', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const contracts = path.join(root,'testing/process-lifecycle/contracts');
  const cases = [
    ['pr-c-controlled-human-preparation.schema.json', preparation()],
    ['pr-c-controlled-human-edge-deployment.schema.json', edgeDeployment()],
    ['pr-c-controlled-human-checkpoint.schema.json', checkpoints()[0]],
    ['pr-c-controlled-human-session.schema.json', session()],
  ];
  const validators=new Map();
  for (const [name, value] of cases) {
    const validate=ajv.compile(JSON.parse(readFileSync(path.join(contracts,name),'utf8')));
    validators.set(name,validate);
    assert.equal(validate(value),true,`${name}: ${ajv.errorsText(validate.errors)}`);
  }
  const sessionSchema=validators.get('pr-c-controlled-human-session.schema.json');
  for(const count of [82,84]) {
    const altered=clone(session());altered.totals.stepCount=count;altered.totals.passedStepCount=count;
    assert.equal(sessionSchema(altered),false,`${count} steps must fail schema validation`);
  }
  assert.equal(CONTROLLED_HUMAN_CATALOG.reduce((total,checkpoint)=>total+checkpoint.steps.length,0),83);
});
