import { isDeepStrictEqual } from 'node:util';
import {
  AUTHENTICATED_ACCEPTANCE_PROJECTS,
  AUTHENTICATED_ACCEPTANCE_TEST_IDS,
  authenticatedAcceptanceScenario,
} from './authenticatedAcceptanceCases.mjs';
import { authenticatedRawIdentity } from './authenticatedBrowserCorrelation.mjs';

export const AUTHENTICATED_SERVER_OBSERVATION_SCHEMA = 'authenticated-server-observations-v1';
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString() === value;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, names) => object(value) && isDeepStrictEqual(Object.keys(value).sort(), [...names].sort());
const nullableDigest = value => value === null || DIGEST.test(value);
export const AUTHENTICATED_EFFECT_KINDS = Object.freeze([
  'domain', 'generation_attempt', 'receipt', 'audit', 'secret', 'storage',
  'provider_call', 'paid_call', 'provider_token', 'budget_reservation', 'budget_debit', 'foreign', 'control',
]);
export const AUTHENTICATED_OBSERVED_SOURCE_EFFECTS = Object.freeze({
  assess_processes: 'domain',
  assessments: 'domain',
  assess_v2_cases: 'domain',
  assess_v2_case_versions: 'domain',
  assess_v2_decision_versions: 'domain',
  assess_v2_review_assignments: 'domain',
  assess_v2_evidence_attestations: 'domain',
  assess_v2_review_resolutions: 'domain',
  assess_v2_govern_resolutions: 'domain',
  assess_v2_studio_handoffs: 'domain',
  studio_artifact_source_packages: 'domain',
  studio_artifact_aggregates: 'domain',
  studio_artifact_versions: 'domain',
  document_generations: 'domain',
  delivery_work_items: 'domain',
  legacy_delivery_imports: 'domain',
  legacy_delivery_outcome_versions: 'domain',
  legacy_delivery_pack_snapshots: 'domain',
  studio_delivery_publications: 'domain',
  legacy_delivery_outcome_aggregates: 'domain',
  ai_provider_configs: 'domain',
  enterprise_ai_budget_reservations: 'budget_reservation',
  studio_artifact_generation_attempts: 'generation_attempt',
  studio_rendition_attempts: 'generation_attempt',
  assess_command_receipts: 'receipt',
  studio_artifact_command_receipts: 'receipt',
  legacy_delivery_command_receipts: 'receipt',
  studio_delivery_command_receipts: 'receipt',
  enterprise_ai_command_receipts: 'receipt',
  privileged_audit_events: 'audit',
  ai_provider_audit_events: 'audit',
  ai_provider_key_refs: 'secret',
  studio_renditions: 'storage',
  authenticated_synthetic_exercises: 'control',
  authenticated_synthetic_actor_sessions: 'control',
  authenticated_synthetic_permits: 'control',
  authenticated_synthetic_permit_events: 'control',
});
const rowKeys = Object.freeze([
  'source', 'recordHash', 'rowHash', 'businessRowHash', 'occurredAt', 'classification', 'active',
  'actorHash', 'sessionHash', 'requestIdHash', 'persistedRequestHash', 'persistedPayloadHash', 'commandBindingHash',
  'commandIdHash', 'receiptIdHash', 'auditIdHash',
  'effectKind', 'organizationHash', 'workspaceHash',
]);

const validateRow = (row, frame, binding, key, errors) => {
  if (!exact(row, rowKeys) || typeof row.source !== 'string' || !/^[a-z][a-z0-9_]{2,127}$/u.test(row.source)
    || !DIGEST.test(row.recordHash ?? '') || !DIGEST.test(row.rowHash ?? '') || !DIGEST.test(row.businessRowHash ?? '')
    || !timestamp(row.occurredAt)
    || !['transient_control', 'immutable_history'].includes(row.classification) || typeof row.active !== 'boolean'
    || !AUTHENTICATED_EFFECT_KINDS.includes(row.effectKind)
    || AUTHENTICATED_OBSERVED_SOURCE_EFFECTS[row.source] !== row.effectKind
    || !DIGEST.test(row.organizationHash ?? '') || !DIGEST.test(row.workspaceHash ?? '')
    || ![row.actorHash, row.sessionHash, row.requestIdHash, row.persistedRequestHash, row.persistedPayloadHash,
      row.commandBindingHash, row.commandIdHash,
      row.receiptIdHash, row.auditIdHash].every(nullableDigest)) errors.push(`server-observation-row:${key}`);
  if (Date.parse(row.occurredAt) > Date.parse(frame.capturedAt)) errors.push(`server-observation-row-time:${key}`);
  if ((row.actorHash === null) !== (row.sessionHash === null)) errors.push(`server-observation-row-actor:${key}`);
  if (row.effectKind === 'receipt' && (row.receiptIdHash === null || row.persistedRequestHash === null)) {
    errors.push(`server-observation-receipt-identity:${key}`);
  }
  if (row.effectKind === 'audit' && (row.auditIdHash === null || row.commandIdHash === null || row.receiptIdHash === null)) {
    errors.push(`server-observation-audit-identity:${key}`);
  }
  if (['domain', 'generation_attempt', 'secret'].includes(row.effectKind)
    && row.requestIdHash !== null && row.commandIdHash === null) errors.push(`server-observation-command-identity:${key}`);
  if (row.actorHash !== null && !binding.actors.some(actor => actor.actorHash === row.actorHash
    && actor.sessionHash === row.sessionHash && actor.organizationHash === row.organizationHash
    && actor.workspaceHash === row.workspaceHash)) errors.push(`server-observation-row-binding:${key}`);
};

export function validateAuthenticatedServerObservations(document, binding) {
  const errors = [];
  if (!exact(document, ['schemaVersion', 'identity', 'cases', 'cleanup'])
    || document.schemaVersion !== AUTHENTICATED_SERVER_OBSERVATION_SCHEMA) return ['server-observation-shape'];
  if (!isDeepStrictEqual(document.identity, authenticatedRawIdentity(binding))) errors.push('server-observation-identity');
  if (!Array.isArray(document.cases)) return [...errors, 'server-observation-cases'];
  const seen = new Set();
  for (const row of document.cases) {
    const key = `${row?.testId}:${row?.project}`;
    if (!exact(row, ['testId', 'project', 'scenario', 'window', 'participants', 'before', 'after'])
      || !AUTHENTICATED_ACCEPTANCE_TEST_IDS.includes(row.testId)
      || !AUTHENTICATED_ACCEPTANCE_PROJECTS.includes(row.project) || seen.has(key)) {
      errors.push(`server-observation-case:${key}`); continue;
    }
    seen.add(key);
    if (row.scenario !== authenticatedAcceptanceScenario(row.testId)) errors.push(`server-observation-contract:${key}`);
    if (!exact(row.window, ['startedAt', 'completedAt']) || !timestamp(row.window.startedAt)
      || !timestamp(row.window.completedAt) || Date.parse(row.window.completedAt) <= Date.parse(row.window.startedAt)
      || Date.parse(row.window.startedAt) < Date.parse(binding.window.startedAt)
      || Date.parse(row.window.completedAt) > Date.parse(binding.window.completedAt)) errors.push(`server-observation-window:${key}`);
    if (!Array.isArray(row.participants) || row.participants.length === 0
      || row.participants.some(participant => !exact(participant, ['persona', 'actorHash', 'sessionHash'])
        || !binding.actors.some(actor => actor.project === row.project && actor.persona === participant.persona
          && actor.actorHash === participant.actorHash && actor.sessionHash === participant.sessionHash))) {
      errors.push(`server-observation-participants:${key}`);
    }
    for (const [name, frame] of [['before', row.before], ['after', row.after]]) {
      if (!exact(frame, ['capturedAt', 'records']) || !timestamp(frame.capturedAt) || !Array.isArray(frame.records)
        || (name === 'before' && Date.parse(frame.capturedAt) > Date.parse(row.window.startedAt))
        || (name === 'after' && Date.parse(frame.capturedAt) < Date.parse(row.window.completedAt))) {
        errors.push(`server-observation-frame:${key}:${name}`); continue;
      }
      const recordHashes = new Set();
      for (const record of frame.records) {
        validateRow(record, frame, binding, `${key}:${name}`, errors);
        if (recordHashes.has(record.recordHash)) errors.push(`server-observation-duplicate-record:${key}:${name}`);
        recordHashes.add(record.recordHash);
      }
    }
    const before = new Map((row.before?.records ?? []).map(record => [record.recordHash, record]));
    const after = new Map((row.after?.records ?? []).map(record => [record.recordHash, record]));
    for (const recordHash of new Set([...before.keys(), ...after.keys()])) {
      const prior = before.get(recordHash) ?? null;
      const current = after.get(recordHash) ?? null;
      if (prior && current && prior.rowHash === current.rowHash && prior.active === current.active) continue;
      const changed = current ?? prior;
      if (changed.effectKind !== 'control' && changed.actorHash !== null
        && !row.participants.some(participant => participant.actorHash === changed.actorHash
        && participant.sessionHash === changed.sessionHash)) errors.push(`server-observation-case-actor:${key}`);
    }
  }
  for (const testId of AUTHENTICATED_ACCEPTANCE_TEST_IDS) for (const project of AUTHENTICATED_ACCEPTANCE_PROJECTS) {
    if (!seen.has(`${testId}:${project}`)) errors.push(`server-observation-missing:${testId}:${project}`);
  }
  const cleanup = document.cleanup;
  if (!exact(cleanup, ['capturedAt', 'resources', 'nonExerciseStateBeforeHash', 'nonExerciseStateAfterHash'])
    || !timestamp(cleanup?.capturedAt) || Date.parse(cleanup?.capturedAt) < Date.parse(binding.window.completedAt)
    || !DIGEST.test(cleanup?.nonExerciseStateBeforeHash ?? '') || !DIGEST.test(cleanup?.nonExerciseStateAfterHash ?? '')
    || cleanup?.nonExerciseStateBeforeHash !== cleanup?.nonExerciseStateAfterHash || !Array.isArray(cleanup?.resources)) {
    errors.push('server-observation-cleanup');
  } else {
    const sessionKeys = new Set();
    for (const resource of cleanup.resources) {
      if (!exact(resource, ['kind', 'resourceHash', 'classification', 'status', 'actorHash', 'sessionHash'])
        || typeof resource.kind !== 'string' || !/^[a-z][a-z0-9_-]{1,80}$/u.test(resource.kind)
        || !DIGEST.test(resource.resourceHash ?? '') || !['transient', 'retained_immutable'].includes(resource.classification)
        || !['removed', 'revoked', 'disarmed', 'inactive', 'preserved', 'active'].includes(resource.status)
        || ![resource.actorHash, resource.sessionHash].every(nullableDigest)
        || resource.classification === 'transient' && resource.status === 'active'
        || resource.classification === 'retained_immutable' && !['preserved', 'inactive'].includes(resource.status)) {
        errors.push('server-observation-cleanup-resource');
      }
      if (resource.kind === 'session' && resource.actorHash && resource.sessionHash && resource.status === 'revoked') {
        sessionKeys.add(`${resource.actorHash}:${resource.sessionHash}`);
      }
    }
    for (const actor of binding.actors) if (!sessionKeys.has(`${actor.actorHash}:${actor.sessionHash}`)) {
      errors.push(`server-observation-session-not-revoked:${actor.persona}:${actor.project}`);
    }
    if (!cleanup.resources.some(resource => resource.classification === 'retained_immutable'
      && ['preserved', 'inactive'].includes(resource.status))) errors.push('server-observation-retained-history-missing');
  }
  return errors;
}
