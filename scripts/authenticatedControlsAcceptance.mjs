import { createHash } from 'node:crypto';
import { AUTHENTICATED_CASE_ASSERTIONS, authenticatedAcceptanceScenario } from './authenticatedAcceptanceCases.mjs';

export const AUTHENTICATED_CONTROL_CASE_IDS = Object.freeze([
  'STUDIO-007', 'ADMIN-001', 'ADMIN-002', 'ADMIN-003', 'ADMIN-004',
  'AI-001', 'AI-002', 'AI-003', 'AI-004', 'AI-005', 'AI-006',
]);
const sha = value => `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const COUNTERS = Object.freeze(['logicalMutations', 'domainWrites', 'receiptWrites', 'auditWrites',
  'secretWrites', 'storageWrites', 'providerCalls', 'paidCalls', 'providerTokens',
  'budgetDebits', 'foreignWrites']);
const measuredCounters = measured => measured && typeof measured === 'object'
  && measured.before && measured.after && measured.beforeState !== undefined && measured.afterState !== undefined
  && COUNTERS.every(name => Number.isSafeInteger(measured.before[name]) && measured.before[name] >= 0
    && Number.isSafeInteger(measured.after[name]) && measured.after[name] >= measured.before[name]);
const expectedDelta = testId => Object.fromEntries(COUNTERS.map(name => [name,
  testId === 'AI-004' && ['logicalMutations', 'domainWrites', 'receiptWrites', 'auditWrites', 'secretWrites'].includes(name) ? 1 : 0]));

const resultStatus = assertions => assertions.some(item => item.status === 'FAIL') ? 'FAIL'
  : assertions.every(item => item.status === 'PASS') ? 'PASS' : 'BLOCKED';

/** Build the controller's common per-case frame without claiming hosted proof. */
export const createAuthenticatedControlFrame = ({
  testId, releaseSha, sourceBinding, measured, assertionResults = {}, api = null,
  browser = null, denials = [], controls = {}, recovery = {}, cleanup = {}, proofMode = 'actual-api',
}) => {
  if (!AUTHENTICATED_CONTROL_CASE_IDS.includes(testId)) throw new Error('AUTHENTICATED_CONTROL_CASE_UNKNOWN');
  const complete = measuredCounters(measured);
  const delta = complete ? Object.fromEntries(COUNTERS.map(name => [name, measured.after[name] - measured.before[name]])) : null;
  const matchesExpected = complete && COUNTERS.every(name => delta[name] === expectedDelta(testId)[name]);
  const assertions = AUTHENTICATED_CASE_ASSERTIONS[testId].map(id => ({
    id, status: complete && matchesExpected ? assertionResults[id] ?? 'BLOCKED' : 'BLOCKED',
  }));
  const measurements = complete ? {
    before: sha(measured.beforeState), after: sha(measured.afterState), delta,
    beforeCounters: { ...measured.before }, afterCounters: { ...measured.after },
  } : null;
  return {
    testId, status: resultStatus(assertions), proofMode: complete ? proofMode : 'not-run', releaseSha,
    scenarioId: authenticatedAcceptanceScenario(testId), sourceBinding,
    preconditions: { authKind: 'fixture_transport', providerRuntime: 'OFF', setupExcluded: true },
    actions: assertions.map(item => item.id), measurements,
    observations: { api, browser }, denials, lineage: null,
    controls: { ...controls, assertions, measurementComplete: complete, expectedCountsMatched: matchesExpected,
      hostedRequirementSatisfied: false }, recovery, cleanup,
  };
};

export const validateAuthenticatedControlFrames = frames => {
  const errors = [];
  if (!Array.isArray(frames)) return ['authenticated-control-frames-array'];
  const seen = new Set();
  for (const frame of frames) {
    if (!AUTHENTICATED_CONTROL_CASE_IDS.includes(frame?.testId) || seen.has(frame.testId)) {
      errors.push(`authenticated-control-frame-identity:${frame?.testId}`); continue;
    }
    seen.add(frame.testId);
    if (!['actual-ui', 'actual-api', 'not-run'].includes(frame.proofMode)) errors.push(`authenticated-control-proof-mode:${frame.testId}`);
    if (frame.preconditions?.authKind !== 'fixture_transport' || frame.controls?.hostedRequirementSatisfied !== false) {
      errors.push(`authenticated-control-local-boundary:${frame.testId}`);
    }
    const serialized = JSON.stringify(frame);
    if (/providerKey|secretReference|secretRef|authorization\s*[:=]|bearer\s+[a-z0-9]/iu.test(serialized)) {
      errors.push(`authenticated-control-sensitive-evidence:${frame.testId}`);
    }
    const m = frame.measurements;
    if (!m || frame.controls?.measurementComplete !== true || frame.controls?.expectedCountsMatched !== true) {
      if (frame.status !== 'BLOCKED' || frame.proofMode !== 'not-run') errors.push(`authenticated-control-missing-measurements:${frame.testId}`);
      continue;
    }
    const d = m.delta ?? {};
    if (COUNTERS.some(name => !Number.isSafeInteger(m.beforeCounters?.[name])
      || !Number.isSafeInteger(m.afterCounters?.[name])
      || d[name] !== m.afterCounters[name] - m.beforeCounters[name])) {
      errors.push(`authenticated-control-counter-derivation:${frame.testId}`);
    }
    if (frame.testId === 'AI-004') {
      if (d.logicalMutations !== 1 || d.domainWrites !== 1 || d.receiptWrites !== 1
        || d.auditWrites !== 1 || d.secretWrites !== 1 || d.providerCalls !== 0) {
        errors.push('authenticated-control-ai004-effects');
      }
    } else if (COUNTERS.some(name => d[name] !== 0)) {
      errors.push(`authenticated-control-zero-effects:${frame.testId}`);
    }
    if (frame.status === 'PASS' && frame.proofMode === 'not-run') errors.push(`authenticated-control-pass-not-run:${frame.testId}`);
  }
  return errors;
};

