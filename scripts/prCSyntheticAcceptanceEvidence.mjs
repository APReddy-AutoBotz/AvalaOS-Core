import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CONTROLLED_HUMAN_CATALOG,
  CONTROLLED_HUMAN_EXECUTION_ORDER,
  HUMAN_DUTY_BY_PERSONA,
  REQUIRED_JOURNEYS,
  canonicalDigest,
  canonicalJson,
  sha256Digest,
  validateControlledExerciseObservedDuty,
  validateControlledHumanProofPairs,
} from './prCControlledHumanEvidenceContract.mjs';

export const SYNTHETIC_POLICY_SCHEMA_VERSION = 'pr-c-solo-owner-synthetic-policy-1';
export const SYNTHETIC_SESSION_SCHEMA_VERSION = 'governed-delivery-monitor-pr-c-synthetic-acceptance-session-1';
export const SYNTHETIC_POLICY_ID = 'solo-owner-synthetic-v1';
export const SYNTHETIC_RESULT_ID = 'SYNTHETIC-ROLE-ACCEPTANCE';
export const SYNTHETIC_WORKFLOW_PATH = '.github/workflows/transcript-flow-pr-c.yml';
export const SYNTHETIC_WORKFLOW_JOB = 'synthetic_role_acceptance';
export const PR_NUMBER = 264;
export const PR_BRANCH = 'controller/governed-delivery-monitor-pr-c-20260831';
export const PREVIEW_ORIGIN = 'https://deploy-preview-264--avalaos-pilot.netlify.app';
export const ENVIRONMENT = 'hosted_nonproduction_pilot';

const SHA = /^[0-9a-f]{40}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const RUN_ID = /^[1-9][0-9]{0,19}$/u;
const DEPLOY_ID = /^[0-9a-f]{24}$/u;
const SAFE_LABEL = /^[a-z0-9][a-z0-9._:-]{0,127}$/u;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const ROLES = Object.freeze(['requester', 'reviewer', 'approver']);
const catalogByCheckpoint = new Map(CONTROLLED_HUMAN_CATALOG.map(record => [record.checkpointId, record]));

const fail = code => { throw new Error(code); };
const assert = (condition, code) => { if (!condition) fail(code); };
const exactKeys = (value, expected, code) => {
  assert(value && typeof value === 'object' && !Array.isArray(value), code);
  assert(JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort()), code);
};
const digest = (value, code) => assert(typeof value === 'string' && DIGEST.test(value), code);
const timestamp = (value, code) => {
  assert(typeof value === 'string' && ISO_TIMESTAMP.test(value) && Number.isFinite(Date.parse(value)), code);
  return Date.parse(value);
};
const safeLabel = (value, code) => assert(typeof value === 'string' && SAFE_LABEL.test(value), code);
const stepKey = (checkpointId, stepId) => `${checkpointId}\0${stepId}`;
export const requiredSyntheticBrowserAssertionId = (checkpointId, stepId) => `${checkpointId}.${stepId}.observed`.toLowerCase();

const orderedCatalog = CONTROLLED_HUMAN_EXECUTION_ORDER.map(checkpointId => catalogByCheckpoint.get(checkpointId));
export const SYNTHETIC_STEP_COUNT = orderedCatalog.reduce((total, checkpoint) => total + checkpoint.steps.length, 0);
assert(SYNTHETIC_STEP_COUNT === 84, 'PR_C_SYNTHETIC_CATALOG_STEP_COUNT');

export const SYNTHETIC_PERSONA_ORDER = Object.freeze([...new Set(orderedCatalog.flatMap(record => record.steps.map(step => step.personaKey)))]);

export const validateSyntheticOwnerPolicy = policy => {
  exactKeys(policy, ['schemaVersion', 'policyId', 'status', 'owner', 'approvalDate', 'approvalReference', 'reason', 'scope'], 'PR_C_SYNTHETIC_POLICY');
  assert(policy.schemaVersion === SYNTHETIC_POLICY_SCHEMA_VERSION && policy.policyId === SYNTHETIC_POLICY_ID
    && policy.status === 'approved' && policy.owner === 'APReddy-AutoBotz', 'PR_C_SYNTHETIC_POLICY_IDENTITY');
  assert(policy.approvalDate === '2026-09-24', 'PR_C_SYNTHETIC_POLICY_DATE');
  safeLabel(policy.approvalReference, 'PR_C_SYNTHETIC_POLICY_REFERENCE');
  assert(typeof policy.reason === 'string' && policy.reason.length >= 40 && policy.reason.length <= 300, 'PR_C_SYNTHETIC_POLICY_REASON');
  exactKeys(policy.scope, ['repository', 'prNumber', 'branch', 'environment', 'previewOrigin', 'syntheticResult', 'controlledHumanResult'], 'PR_C_SYNTHETIC_POLICY_SCOPE');
  assert(policy.scope.repository === 'APReddy-AutoBotz/AvalaOS-Core' && policy.scope.prNumber === PR_NUMBER
    && policy.scope.branch === PR_BRANCH && policy.scope.environment === ENVIRONMENT && policy.scope.previewOrigin === PREVIEW_ORIGIN
    && policy.scope.syntheticResult === SYNTHETIC_RESULT_ID && policy.scope.controlledHumanResult === 'not_run', 'PR_C_SYNTHETIC_POLICY_SCOPE_IDENTITY');
  return policy;
};

const validateBinding = binding => {
  exactKeys(binding, ['repository', 'prNumber', 'branch', 'exactHead', 'preview', 'backend', 'producer'], 'PR_C_SYNTHETIC_BINDING');
  assert(binding.repository === 'APReddy-AutoBotz/AvalaOS-Core' && binding.prNumber === PR_NUMBER && binding.branch === PR_BRANCH
    && SHA.test(binding.exactHead), 'PR_C_SYNTHETIC_BINDING_SOURCE');
  exactKeys(binding.preview, ['origin', 'deployId', 'releaseSha', 'environment', 'context', 'reviewId', 'siteName'], 'PR_C_SYNTHETIC_PREVIEW');
  assert(binding.preview.origin === PREVIEW_ORIGIN && DEPLOY_ID.test(binding.preview.deployId) && binding.preview.releaseSha === binding.exactHead
    && binding.preview.environment === ENVIRONMENT && binding.preview.context === 'deploy-preview' && binding.preview.reviewId === PR_NUMBER
    && binding.preview.siteName === 'avalaos-pilot', 'PR_C_SYNTHETIC_PREVIEW_IDENTITY');
  exactKeys(binding.backend, ['exerciseDigest', 'targetFingerprint', 'publicTargetDigest', 'personaManifestDigest', 'fixtureManifestDigest', 'migrationTip'], 'PR_C_SYNTHETIC_BACKEND');
  for (const field of ['exerciseDigest', 'targetFingerprint', 'publicTargetDigest', 'personaManifestDigest', 'fixtureManifestDigest']) digest(binding.backend[field], `PR_C_SYNTHETIC_BACKEND_${field}`);
  assert(binding.backend.migrationTip === '20260926053818', 'PR_C_SYNTHETIC_BACKEND_MIGRATION_TIP');
  exactKeys(binding.producer, ['workflowPath', 'job', 'event', 'runId', 'runAttempt', 'owner'], 'PR_C_SYNTHETIC_PRODUCER');
  assert(binding.producer.workflowPath === SYNTHETIC_WORKFLOW_PATH && binding.producer.job === SYNTHETIC_WORKFLOW_JOB
    && binding.producer.event === 'workflow_dispatch' && RUN_ID.test(String(binding.producer.runId))
    && Number.isSafeInteger(binding.producer.runAttempt) && binding.producer.runAttempt > 0
    && binding.producer.owner === 'APReddy-AutoBotz', 'PR_C_SYNTHETIC_PRODUCER_IDENTITY');
  return binding;
};

const validatePersonas = personas => {
  assert(Array.isArray(personas) && personas.length === SYNTHETIC_PERSONA_ORDER.length, 'PR_C_SYNTHETIC_PERSONA_COUNT');
  const actorDigests = new Set();
  const sessionDigests = new Set();
  personas.forEach((record, index) => {
    exactKeys(record, ['personaKey', 'role', 'applicationActorDigest', 'applicationSessionDigest', 'signedOutAt', 'signOutEvidenceDigest'], `PR_C_SYNTHETIC_PERSONA:${index}`);
    const personaKey = SYNTHETIC_PERSONA_ORDER[index];
    assert(record.personaKey === personaKey && record.role === HUMAN_DUTY_BY_PERSONA[personaKey], `PR_C_SYNTHETIC_PERSONA:${index}_IDENTITY`);
    digest(record.applicationActorDigest, `PR_C_SYNTHETIC_PERSONA:${index}_ACTOR`);
    digest(record.applicationSessionDigest, `PR_C_SYNTHETIC_PERSONA:${index}_SESSION`);
    digest(record.signOutEvidenceDigest, `PR_C_SYNTHETIC_PERSONA:${index}_SIGNOUT`);
    timestamp(record.signedOutAt, `PR_C_SYNTHETIC_PERSONA:${index}_SIGNOUT_TIME`);
    actorDigests.add(record.applicationActorDigest); sessionDigests.add(record.applicationSessionDigest);
  });
  assert(actorDigests.size === personas.length && sessionDigests.size === personas.length, 'PR_C_SYNTHETIC_PERSONA_IDENTITY_REUSE');
  return new Map(personas.map(record => [record.personaKey, record]));
};

const validateBrowserArtifact = (artifact, checkpointId, stepId, code) => {
  exactKeys(artifact, ['artifactId', 'route', 'viewport', 'assertions', 'interactionSequence', 'serverAnchor', 'serverBinding'], code);
  safeLabel(artifact.artifactId, `${code}_ID`);
  assert(typeof artifact.route === 'string' && /^\/[a-z0-9/_?=&.-]{0,255}$/u.test(artifact.route), `${code}_ROUTE`);
  safeLabel(artifact.viewport, `${code}_VIEWPORT`);
  assert(Array.isArray(artifact.assertions) && artifact.assertions.length > 0, `${code}_ASSERTIONS`);
  const assertionIds = artifact.assertions.map((record, index) => {
    exactKeys(record, ['assertionId', 'kind', 'result', 'actualDigest'], `${code}_ASSERTION:${index}`);
    safeLabel(record.assertionId, `${code}_ASSERTION:${index}_ID`);
    assert(['dom', 'accessibility', 'layout', 'navigation', 'network'].includes(record.kind) && record.result === 'passed', `${code}_ASSERTION:${index}_RESULT`);
    digest(record.actualDigest, `${code}_ASSERTION:${index}_ACTUAL`);
    return record.assertionId;
  });
  assert(new Set(assertionIds).size === assertionIds.length && JSON.stringify(assertionIds) === JSON.stringify([...assertionIds].sort()), `${code}_ASSERTION_ORDER`);
  assert(assertionIds.includes(requiredSyntheticBrowserAssertionId(checkpointId, stepId)), `${code}_REQUIRED_STATE_ASSERTION`);
  assert(Array.isArray(artifact.interactionSequence) && artifact.interactionSequence.length > 0 && artifact.interactionSequence.length <= 80
    && artifact.interactionSequence.every(value => typeof value === 'string' && SAFE_LABEL.test(value)), `${code}_INTERACTIONS`);
  assert((artifact.serverAnchor === null) === (artifact.serverBinding === null), `${code}_SERVER_PAIR`);
  return canonicalDigest(artifact);
};

const validateCheckpoints = (checkpoints, personas) => {
  assert(Array.isArray(checkpoints) && checkpoints.length === CONTROLLED_HUMAN_CATALOG.length, 'PR_C_SYNTHETIC_CHECKPOINT_COUNT');
  const checkpointMap = new Map();
  const artifactDigests = [];
  checkpoints.forEach((record, index) => {
    exactKeys(record, ['checkpointId', 'journeyId', 'testIds', 'outcome', 'steps'], `PR_C_SYNTHETIC_CHECKPOINT:${index}`);
    const expected = CONTROLLED_HUMAN_CATALOG[index];
    assert(record.checkpointId === expected.checkpointId && record.journeyId === expected.journeyId && record.outcome === 'passed', `PR_C_SYNTHETIC_CHECKPOINT:${index}_IDENTITY`);
    assert(JSON.stringify(record.testIds) === JSON.stringify(expected.testIds), `PR_C_SYNTHETIC_CHECKPOINT:${index}_TEST_IDS`);
    assert(Array.isArray(record.steps) && record.steps.length === expected.steps.length, `PR_C_SYNTHETIC_CHECKPOINT:${index}_STEP_COUNT`);
    record.steps.forEach((step, stepIndex) => {
      exactKeys(step, ['stepId', 'personaKey', 'outcome', 'startedAt', 'completedAt', 'applicationActorDigest', 'applicationSessionDigest', 'browserArtifact'], `PR_C_SYNTHETIC_STEP:${record.checkpointId}:${stepIndex}`);
      const wanted = expected.steps[stepIndex];
      assert(step.stepId === wanted.stepId && step.personaKey === wanted.personaKey && step.outcome === 'passed', `PR_C_SYNTHETIC_STEP:${record.checkpointId}:${stepIndex}_IDENTITY`);
      const started = timestamp(step.startedAt, `PR_C_SYNTHETIC_STEP:${record.checkpointId}:${stepIndex}_STARTED`);
      const completed = timestamp(step.completedAt, `PR_C_SYNTHETIC_STEP:${record.checkpointId}:${stepIndex}_COMPLETED`);
      assert(completed > started, `PR_C_SYNTHETIC_STEP:${record.checkpointId}:${stepIndex}_TIME_ORDER`);
      const persona = personas.get(step.personaKey);
      assert(step.applicationActorDigest === persona?.applicationActorDigest && step.applicationSessionDigest === persona?.applicationSessionDigest,
        `PR_C_SYNTHETIC_STEP:${record.checkpointId}:${stepIndex}_SESSION_IDENTITY`);
      artifactDigests.push(validateBrowserArtifact(step.browserArtifact, record.checkpointId, step.stepId, `PR_C_SYNTHETIC_STEP:${record.checkpointId}:${stepIndex}_BROWSER`));
    });
    checkpointMap.set(record.checkpointId, record);
  });
  const execution = orderedCatalog.flatMap(record => checkpointMap.get(record.checkpointId).steps.map(step => ({ checkpointId: record.checkpointId, ...step })));
  const times = execution.flatMap(step => [Date.parse(step.startedAt), Date.parse(step.completedAt)]);
  assert(times.every((value, index) => index === 0 || value > times[index - 1]), 'PR_C_SYNTHETIC_STEP_GLOBAL_TIME_ORDER');
  assert(new Set(artifactDigests).size === SYNTHETIC_STEP_COUNT, 'PR_C_SYNTHETIC_BROWSER_ARTIFACT_REUSE');
  return { checkpointMap, execution };
};

export const validateSyntheticBrowserCampaign = ({ binding, personas, checkpoints }) => {
  validateBinding(binding);
  const personaMap = validatePersonas(personas);
  validateCheckpoints(checkpoints, personaMap);
  return { binding, personas, checkpoints };
};

export const buildSyntheticObserverRequest = (role, checkpoints) => {
  assert(ROLES.includes(role), 'PR_C_SYNTHETIC_OBSERVER_ROLE');
  const byCheckpoint = new Map(checkpoints.map(record => [record.checkpointId, record]));
  return {
    executionKind: 'synthetic',
    syntheticRole: role,
    steps: orderedCatalog.flatMap(expected => byCheckpoint.get(expected.checkpointId).steps
      .filter(step => HUMAN_DUTY_BY_PERSONA[step.personaKey] === role)
      .map(step => ({
        checkpointId: expected.checkpointId,
        stepId: step.stepId,
        personaKey: step.personaKey,
        startedAt: step.startedAt,
        completedAt: step.completedAt,
        attemptDigest: canonicalDigest(step.browserArtifact),
        bindingToken: step.browserArtifact.serverBinding?.bindingToken ?? null,
        applicationActorDigest: step.applicationActorDigest,
        applicationSessionDigest: step.applicationSessionDigest,
      }))),
  };
};

export const buildSyntheticSessionBindingRequest = personas => {
  assert(Array.isArray(personas) && personas.length === SYNTHETIC_PERSONA_ORDER.length, 'PR_C_SYNTHETIC_SESSION_BINDING_COUNT');
  const records = personas.map((record, index) => {
    assert(SYNTHETIC_PERSONA_ORDER.includes(record?.personaKey), `PR_C_SYNTHETIC_SESSION_BINDING:${index}_PERSONA`);
    digest(record.applicationActorDigest, `PR_C_SYNTHETIC_SESSION_BINDING:${index}_ACTOR`);
    digest(record.applicationSessionDigest, `PR_C_SYNTHETIC_SESSION_BINDING:${index}_SESSION`);
    return { personaKey: record.personaKey, applicationActorDigest: record.applicationActorDigest, applicationSessionDigest: record.applicationSessionDigest };
  }).sort((left, right) => left.personaKey.localeCompare(right.personaKey));
  assert(new Set(records.map(record => record.personaKey)).size === records.length
    && new Set(records.map(record => record.applicationActorDigest)).size === records.length
    && new Set(records.map(record => record.applicationSessionDigest)).size === records.length, 'PR_C_SYNTHETIC_SESSION_BINDING_REUSE');
  return { executionKind: 'synthetic', personas: records };
};

const validateControllerBinding = (record, phase, binding, code) => {
  assert(record?.contractVersion === 'pr-c-controlled-human-controller-1' && record.phase === phase && record.status === 'passed', `${code}_STATUS`);
  assert(record.environmentClass === ENVIRONMENT && record.prNumber === PR_NUMBER && record.releaseSha === binding.exactHead
    && record.reviewHeadSha === binding.exactHead && record.deployId === binding.preview.deployId && record.deployOrigin === PREVIEW_ORIGIN
    && record.exerciseDigest === binding.backend.exerciseDigest && record.targetFingerprint === binding.backend.targetFingerprint
    && record.publicTargetDigest === binding.backend.publicTargetDigest && record.personaManifestDigest === binding.backend.personaManifestDigest
    && record.fixtureManifestDigest === binding.backend.fixtureManifestDigest && record.migrationTip === binding.backend.migrationTip,
  `${code}_BINDING`);
  assert(record.productionAuthorized === false && record.customerDataAuthorized === false && record.realProviderCallsAuthorized === false, `${code}_STOP_STATE`);
};

const validateSyntheticObservers = ({ serverObservers, checkpoints, binding, quiesceRecord }) => {
  assert(Array.isArray(serverObservers) && serverObservers.length === 3, 'PR_C_SYNTHETIC_OBSERVER_COUNT');
  const proofPairs = checkpoints.flatMap(checkpoint => checkpoint.steps.flatMap(step => step.browserArtifact.serverAnchor
    ? [{ checkpointId: checkpoint.checkpointId, stepId: step.stepId, anchor: step.browserArtifact.serverAnchor, binding: step.browserArtifact.serverBinding }]
    : []));
  validateControlledHumanProofPairs(proofPairs);
  const allServerSteps = [];
  ROLES.forEach((role, index) => {
    const observer = serverObservers[index];
    validateControllerBinding(observer, 'checkpoint-observe', binding, `PR_C_SYNTHETIC_OBSERVER:${role}`);
    assert(observer.executionKind === 'synthetic' && observer.syntheticRole === role && !Object.hasOwn(observer, 'humanRole'), `PR_C_SYNTHETIC_OBSERVER:${role}_EXECUTION_KIND`);
    const request = buildSyntheticObserverRequest(role, checkpoints);
    assert(observer.requestDigest === canonicalDigest(request), `PR_C_SYNTHETIC_OBSERVER:${role}_REQUEST`);
    timestamp(observer.observedAt, `PR_C_SYNTHETIC_OBSERVER:${role}_TIME`);
    assert(observer.lifecycle === 'read_only' && observer.concurrencyVersion === quiesceRecord.concurrencyVersion
      && observer.operationEventSequence === quiesceRecord.operationEventSequence
      && observer.operationEventDigest === quiesceRecord.operationEventDigest
      && observer.immutableHistoryDigest === quiesceRecord.immutableHistoryDigest, `PR_C_SYNTHETIC_OBSERVER:${role}_QUIESCE`);
    digest(observer.inspectionDigest, `PR_C_SYNTHETIC_OBSERVER:${role}_INSPECTION`);
    validateControlledExerciseObservedDuty({ executionKind: 'synthetic', role, requestedSteps: request.steps, serverSteps: observer.steps, proofPairs });
    allServerSteps.push(...observer.steps);
  });
  assert(allServerSteps.length === SYNTHETIC_STEP_COUNT && new Set(allServerSteps.map(record => record.inspectionDigest)).size === SYNTHETIC_STEP_COUNT,
    'PR_C_SYNTHETIC_SERVER_STEP_COVERAGE');
  return allServerSteps;
};

export const validateSyntheticServerSafety = serverSteps => {
  assert(Array.isArray(serverSteps) && serverSteps.length === SYNTHETIC_STEP_COUNT, 'PR_C_SYNTHETIC_SERVER_STEP_COVERAGE');
  const aggregate = serverSteps.reduce((total, record) => ({
    providerEgress: total.providerEgress + Number(record?.safety?.providerEgress),
    realProviderCalls: total.realProviderCalls + Number(record?.safety?.realProviderCalls),
    customerDataRecords: total.customerDataRecords + Number(record?.safety?.customerDataRecords),
    externalUsers: total.externalUsers + Number(record?.safety?.externalUsers),
  }), { providerEgress: 0, realProviderCalls: 0, customerDataRecords: 0, externalUsers: 0 });
  assert(Object.values(aggregate).every(value => value === 0), 'PR_C_SYNTHETIC_SAFETY');
  return aggregate;
};

export const validateSyntheticCleanup = ({ deprovisionRecord, postDeprovisionRecord }) => {
  assert(deprovisionRecord?.lifecycle === 'deprovisioned' && deprovisionRecord.immutableHistoryRetained === true && deprovisionRecord.domainRowsDeleted === 0,
    'PR_C_SYNTHETIC_DEPROVISION_RESULT');
  assert(postDeprovisionRecord?.lifecycle === 'deprovisioned' && postDeprovisionRecord.immutableHistoryRetained === true
    && postDeprovisionRecord.domainRowsDeleted === 0 && postDeprovisionRecord.activeSessionCount === 0, 'PR_C_SYNTHETIC_POST_DEPROVISION_RESULT');
  digest(postDeprovisionRecord.postInspectionDigest, 'PR_C_SYNTHETIC_POST_DEPROVISION_DIGEST');
  return true;
};

export const buildVerifiedSyntheticAcceptanceSession = ({ policy, binding, personas, checkpoints, sessionBindingRecord, serverObservers, quiesceRecord, deprovisionRecord, postDeprovisionRecord, completedAt }) => {
  validateSyntheticOwnerPolicy(policy); validateBinding(binding);
  const personaMap = validatePersonas(personas);
  const { execution } = validateCheckpoints(checkpoints, personaMap);
  validateControllerBinding(sessionBindingRecord, 'synthetic-session-bind', binding, 'PR_C_SYNTHETIC_SESSION_BINDING');
  const sessionBindingRequest = buildSyntheticSessionBindingRequest(personas);
  assert(sessionBindingRecord.executionKind === 'synthetic' && sessionBindingRecord.sessionBindingCount === personas.length
    && sessionBindingRecord.requestDigest === canonicalDigest(sessionBindingRequest)
    && sessionBindingRecord.sessionBindingDigest === canonicalDigest(sessionBindingRequest.personas), 'PR_C_SYNTHETIC_SESSION_BINDING_PROOF');
  validateControllerBinding(quiesceRecord, 'quiesce', binding, 'PR_C_SYNTHETIC_QUIESCE');
  validateControllerBinding(deprovisionRecord, 'deprovision', binding, 'PR_C_SYNTHETIC_DEPROVISION');
  validateControllerBinding(postDeprovisionRecord, 'post-deprovision-verify', binding, 'PR_C_SYNTHETIC_POST_DEPROVISION');
  const quiescedAt = timestamp(quiesceRecord.transitionedAt, 'PR_C_SYNTHETIC_QUIESCE_TIME');
  assert(execution.filter(step => step.stepId !== 'verify-history-readable-and-actions-absent').every(step => Date.parse(step.completedAt) < quiescedAt)
    && execution.filter(step => step.stepId === 'verify-history-readable-and-actions-absent').every(step => Date.parse(step.startedAt) >= quiescedAt),
  'PR_C_SYNTHETIC_QUIESCE_STEP_ORDER');
  const serverSteps = validateSyntheticObservers({ serverObservers, checkpoints, binding, quiesceRecord });
  validateSyntheticCleanup({deprovisionRecord,postDeprovisionRecord});
  const completed = timestamp(completedAt, 'PR_C_SYNTHETIC_COMPLETED_AT');
  assert(completed >= timestamp(postDeprovisionRecord.inspectionObservedAt, 'PR_C_SYNTHETIC_POST_DEPROVISION_TIME'), 'PR_C_SYNTHETIC_COMPLETION_ORDER');
  assert(personas.every(record => Date.parse(record.signedOutAt) <= completed), 'PR_C_SYNTHETIC_SIGNOUT_ORDER');
  const aggregateSafety = validateSyntheticServerSafety(serverSteps);
  const session = {
    schemaVersion: SYNTHETIC_SESSION_SCHEMA_VERSION,
    status: 'passed',
    result: SYNTHETIC_RESULT_ID,
    controlledHuman: 'not_run',
    evidenceBasis: 'automated_browser_plus_server_observed',
    policy: { policyId: policy.policyId, policyDigest: canonicalDigest(policy), owner: policy.owner, approvalReference: policy.approvalReference },
    binding,
    personas,
    journeys: REQUIRED_JOURNEYS.map(journeyId => ({ journeyId, checkpointIds: CONTROLLED_HUMAN_CATALOG.filter(record => record.journeyId === journeyId).map(record => record.checkpointId), outcome: 'passed' })),
    checkpoints,
    serverObservers,
    totals: { journeyCount: 8, checkpointCount: 14, stepCount: 84, passedStepCount: 84, failedStepCount: 0, blockedStepCount: 0, ...aggregateSafety },
    lifecycle: {
      quiesceDigest: canonicalDigest(quiesceRecord),
      sessionBindingDigest: canonicalDigest(sessionBindingRecord),
      quiescedHistoryDigest: quiesceRecord.immutableHistoryDigest,
      deprovisionDigest: canonicalDigest(deprovisionRecord),
      independentCleanupDigest: canonicalDigest(postDeprovisionRecord),
      postInspectionDigest: postDeprovisionRecord.postInspectionDigest,
      status: 'verified_deprovisioned',
    },
    completedAt,
  };
  return validateSyntheticAcceptanceSessionShape(session);
};

const validateSyntheticAcceptanceSessionShape = session => {
  exactKeys(session, ['schemaVersion', 'status', 'result', 'controlledHuman', 'evidenceBasis', 'policy', 'binding', 'personas', 'journeys', 'checkpoints', 'serverObservers', 'totals', 'lifecycle', 'completedAt'], 'PR_C_SYNTHETIC_SESSION');
  assert(session.schemaVersion === SYNTHETIC_SESSION_SCHEMA_VERSION && session.status === 'passed' && session.result === SYNTHETIC_RESULT_ID
    && session.controlledHuman === 'not_run' && session.evidenceBasis === 'automated_browser_plus_server_observed', 'PR_C_SYNTHETIC_SESSION_STATUS');
  exactKeys(session.policy, ['policyId', 'policyDigest', 'owner', 'approvalReference'], 'PR_C_SYNTHETIC_SESSION_POLICY');
  assert(session.policy.policyId === SYNTHETIC_POLICY_ID && session.policy.owner === 'APReddy-AutoBotz', 'PR_C_SYNTHETIC_SESSION_POLICY_IDENTITY');
  digest(session.policy.policyDigest, 'PR_C_SYNTHETIC_SESSION_POLICY_DIGEST'); safeLabel(session.policy.approvalReference, 'PR_C_SYNTHETIC_SESSION_POLICY_REFERENCE');
  validateBinding(session.binding); const personas = validatePersonas(session.personas); validateCheckpoints(session.checkpoints, personas);
  assert(JSON.stringify(session.journeys.map(record => record.journeyId)) === JSON.stringify(REQUIRED_JOURNEYS)
    && session.journeys.every(record => record.outcome === 'passed'), 'PR_C_SYNTHETIC_SESSION_JOURNEYS');
  exactKeys(session.totals, ['journeyCount', 'checkpointCount', 'stepCount', 'passedStepCount', 'failedStepCount', 'blockedStepCount', 'providerEgress', 'realProviderCalls', 'customerDataRecords', 'externalUsers'], 'PR_C_SYNTHETIC_SESSION_TOTALS');
  assert(session.totals.journeyCount === 8 && session.totals.checkpointCount === 14 && session.totals.stepCount === 84
    && session.totals.passedStepCount === 84 && session.totals.failedStepCount === 0 && session.totals.blockedStepCount === 0
    && ['providerEgress', 'realProviderCalls', 'customerDataRecords', 'externalUsers'].every(field => session.totals[field] === 0), 'PR_C_SYNTHETIC_SESSION_TOTAL_VALUES');
  exactKeys(session.lifecycle, ['sessionBindingDigest', 'quiesceDigest', 'quiescedHistoryDigest', 'deprovisionDigest', 'independentCleanupDigest', 'postInspectionDigest', 'status'], 'PR_C_SYNTHETIC_SESSION_LIFECYCLE');
  assert(session.lifecycle.status === 'verified_deprovisioned', 'PR_C_SYNTHETIC_SESSION_CLEANUP');
  for (const field of ['sessionBindingDigest', 'quiesceDigest', 'quiescedHistoryDigest', 'deprovisionDigest', 'independentCleanupDigest', 'postInspectionDigest']) digest(session.lifecycle[field], `PR_C_SYNTHETIC_SESSION_${field}`);
  timestamp(session.completedAt, 'PR_C_SYNTHETIC_SESSION_COMPLETED');
  const serialized = canonicalJson(session);
  assert(!/(?:password|service[_-]?role|database_url|access[_-]?token|refresh[_-]?token|postgres(?:ql)?:\/\/|@example[.]invalid)/iu.test(serialized), 'PR_C_SYNTHETIC_SESSION_UNSAFE');
  return session;
};

export const verifySyntheticAcceptanceSession = ({ session, policy, binding, personas, checkpoints, sessionBindingRecord, serverObservers, quiesceRecord, deprovisionRecord, postDeprovisionRecord, completedAt }) => {
  const rebuilt = buildVerifiedSyntheticAcceptanceSession({ policy, binding, personas, checkpoints, sessionBindingRecord, serverObservers, quiesceRecord, deprovisionRecord, postDeprovisionRecord, completedAt });
  assert(canonicalDigest(session) === canonicalDigest(rebuilt), 'PR_C_SYNTHETIC_SESSION_RAW_EVIDENCE_MISMATCH');
  return session;
};

const parseArgs = argv => {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index]?.startsWith('--') || argv[index + 1] === undefined) fail('PR_C_SYNTHETIC_ARGUMENTS');
    values[argv[index].slice(2)] = argv[index + 1];
  }
  return values;
};
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const required = ['policy', 'browser', 'session-binding', 'requester-observer', 'reviewer-observer', 'approver-observer', 'quiesce', 'deprovision', 'post-deprovision', 'output'];
  if (required.some(key => !args[key])) fail('PR_C_SYNTHETIC_ARGUMENTS');
  const browser = await readJson(args.browser);
  const session = buildVerifiedSyntheticAcceptanceSession({
    policy: await readJson(args.policy),
    binding: browser.binding,
    personas: browser.personas,
    checkpoints: browser.checkpoints,
    sessionBindingRecord: await readJson(args['session-binding']),
    serverObservers: await Promise.all(ROLES.map(role => readJson(args[`${role}-observer`]))),
    quiesceRecord: await readJson(args.quiesce),
    deprovisionRecord: await readJson(args.deprovision),
    postDeprovisionRecord: await readJson(args['post-deprovision']),
    completedAt: process.env.PR_C_SYNTHETIC_ACCEPTANCE_COMPLETED_AT,
  });
  const output = path.resolve(args.output); await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(session, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ testId: SYNTHETIC_RESULT_ID, result: 'passed', sessionDigest: canonicalDigest(session), exactHead: session.binding.exactHead })}\n`);
  return session;
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '')) {
  main().catch(error => { process.stderr.write(`PR_C_SYNTHETIC_ACCEPTANCE_REJECTED: ${error.message}\n`); process.exitCode = 1; });
}
