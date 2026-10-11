import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  AUTHENTICATED_ACCEPTANCE_PROJECTS,
  AUTHENTICATED_ACCEPTANCE_TEST_IDS,
  AUTHENTICATED_CASE_ASSERTIONS,
  authenticatedAcceptanceScenario,
} from './authenticatedAcceptanceCases.mjs';

export const AUTHENTICATED_BROWSER_CORRELATION_SCHEMA = 'authenticated-browser-correlations-v1';
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString() === value;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, names) => object(value) && isDeepStrictEqual(Object.keys(value).sort(), [...names].sort());
const primitive = value => value === null || ['string', 'number', 'boolean'].includes(typeof value);
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : object(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const authenticatedEvidenceDigest = value => `sha256:${createHash('sha256')
  .update(JSON.stringify(canonical(value))).digest('hex')}`;

export const AUTHENTICATED_RAW_IDENTITY_KEYS = Object.freeze([
  'bindingDigest', 'releaseSha', 'workflowRunId', 'workflowAttempt', 'exerciseDigest', 'sourceDigest', 'window',
]);

export const authenticatedRawIdentity = binding => ({
  bindingDigest: authenticatedEvidenceDigest(binding),
  releaseSha: binding.releaseSha,
  workflowRunId: binding.workflow.runId,
  workflowAttempt: binding.workflow.attempt,
  exerciseDigest: binding.exerciseDigest,
  sourceDigest: binding.sourceDigest,
  window: structuredClone(binding.window),
});

const forbiddenKey = /(?:authorization|cookie|password|secretvalue|token|signedurl|objectid)/iu;
const unsafe = value => {
  if (Array.isArray(value)) return value.some(unsafe);
  if (typeof value === 'string') return /(?:Bearer\s+|service[_-]?role|(?:^|[^A-Za-z0-9])sk-[A-Za-z0-9_-]{16,}|eyJ[A-Za-z0-9_-]+[.]eyJ[A-Za-z0-9_-]+[.][A-Za-z0-9_-]+|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/iu.test(value);
  if (!object(value)) return false;
  return Object.entries(value).some(([key, child]) => forbiddenKey.test(key) || unsafe(child));
};

export const compareAuthenticatedObservation = observation => {
  if (!exact(observation, ['id', 'comparator', 'expected', 'actual', 'observedAt', 'source'])
    || typeof observation.id !== 'string' || !observation.id
    || !['equals', 'not_equals', 'includes'].includes(observation.comparator)
    || !primitive(observation.expected) || !primitive(observation.actual)
    || !timestamp(observation.observedAt)
    || observation.source !== 'actual-product-browser') return null;
  if (observation.comparator === 'equals') return isDeepStrictEqual(observation.actual, observation.expected);
  if (observation.comparator === 'not_equals') return !isDeepStrictEqual(observation.actual, observation.expected);
  return typeof observation.actual === 'string' && typeof observation.expected === 'string'
    && observation.actual.includes(observation.expected);
};

export function validateAuthenticatedBrowserCorrelations(document, binding) {
  const errors = [];
  if (!exact(document, ['schemaVersion', 'identity', 'cases'])
    || document.schemaVersion !== AUTHENTICATED_BROWSER_CORRELATION_SCHEMA) return ['browser-correlation-shape'];
  if (!isDeepStrictEqual(document.identity, authenticatedRawIdentity(binding))) errors.push('browser-correlation-identity');
  if (!Array.isArray(document.cases)) return [...errors, 'browser-correlation-cases'];
  const seen = new Set();
  for (const row of document.cases) {
    const key = `${row?.testId}:${row?.project}`;
    if (!exact(row, ['testId', 'project', 'scenario', 'window', 'participants', 'actions', 'assertions', 'source'])
      || !AUTHENTICATED_ACCEPTANCE_TEST_IDS.includes(row.testId)
      || !AUTHENTICATED_ACCEPTANCE_PROJECTS.includes(row.project) || seen.has(key)) {
      errors.push(`browser-correlation-case:${key}`); continue;
    }
    seen.add(key);
    if (row.scenario !== authenticatedAcceptanceScenario(row.testId) || row.source !== 'actual-product-browser') {
      errors.push(`browser-correlation-contract:${key}`);
    }
    if (!exact(row.window, ['startedAt', 'completedAt']) || !timestamp(row.window.startedAt)
      || !timestamp(row.window.completedAt) || Date.parse(row.window.completedAt) <= Date.parse(row.window.startedAt)
      || Date.parse(row.window.startedAt) < Date.parse(binding.window.startedAt)
      || Date.parse(row.window.completedAt) > Date.parse(binding.window.completedAt)) errors.push(`browser-correlation-window:${key}`);
    if (!Array.isArray(row.participants) || row.participants.length === 0) {
      errors.push(`browser-correlation-participants:${key}`);
    } else {
      const participantKeys = new Set();
      for (const participant of row.participants) {
        if (!exact(participant, ['persona', 'actorHash', 'sessionHash'])
          || !DIGEST.test(participant.actorHash ?? '') || !DIGEST.test(participant.sessionHash ?? '')
          || typeof participant.persona !== 'string'
          || participantKeys.has(`${participant.actorHash}:${participant.sessionHash}`)
          || !binding.actors.some(actor => actor.project === row.project
            && actor.persona === participant.persona && actor.actorHash === participant.actorHash
            && actor.sessionHash === participant.sessionHash)) errors.push(`browser-correlation-participant:${key}`);
        participantKeys.add(`${participant.actorHash}:${participant.sessionHash}`);
      }
    }
    if (!Array.isArray(row.actions) || row.actions.length === 0) errors.push(`browser-correlation-actions:${key}`);
    const actionIds = new Set();
    for (const action of row.actions ?? []) {
      if (!exact(action, ['actionId', 'occurredAt', 'actorHash', 'sessionHash', 'requestIdHash', 'browserPayloadHash',
        'commandBindingHash', 'response'])
        || !DIGEST.test(action.actionId ?? '') || !timestamp(action.occurredAt)
        || !DIGEST.test(action.actorHash ?? '') || !DIGEST.test(action.sessionHash ?? '')
        || !DIGEST.test(action.requestIdHash ?? '') || !DIGEST.test(action.browserPayloadHash ?? '')
        || !DIGEST.test(action.commandBindingHash ?? '')
        || actionIds.has(action.actionId)
        || Date.parse(action.occurredAt) < Date.parse(row.window.startedAt)
        || Date.parse(action.occurredAt) > Date.parse(row.window.completedAt)
        || !row.participants?.some(participant => participant.actorHash === action.actorHash
          && participant.sessionHash === action.sessionHash)) errors.push(`browser-correlation-action:${key}`);
      actionIds.add(action.actionId);
      const response = action.response;
      if (!exact(response, ['status', 'classification', 'commandIdHash', 'receiptIdHash'])
        || !Number.isInteger(response.status) || response.status < 0 || response.status > 599
        || typeof response.classification !== 'string' || !/^[A-Z][A-Z0-9_]{1,80}$/u.test(response.classification)
        || ![response.commandIdHash, response.receiptIdHash].every(value => value === null || DIGEST.test(value))) {
        errors.push(`browser-correlation-response:${key}`);
      }
    }
    for (const participant of row.participants ?? []) if (!(row.actions ?? []).some(action => action.actorHash === participant.actorHash
      && action.sessionHash === participant.sessionHash)) errors.push(`browser-correlation-participant-unused:${key}`);
    if (!Array.isArray(row.assertions)
      || !isDeepStrictEqual(row.assertions.map(item => item?.id).sort(), [...AUTHENTICATED_CASE_ASSERTIONS[row.testId]].sort())
      || row.assertions.some(item => compareAuthenticatedObservation(item) === null)) errors.push(`browser-correlation-assertions:${key}`);
    if (unsafe(row)) errors.push(`browser-correlation-sensitive-field:${key}`);
  }
  for (const testId of AUTHENTICATED_ACCEPTANCE_TEST_IDS) for (const project of AUTHENTICATED_ACCEPTANCE_PROJECTS) {
    if (!seen.has(`${testId}:${project}`)) errors.push(`browser-correlation-missing:${testId}:${project}`);
  }
  return errors;
}
