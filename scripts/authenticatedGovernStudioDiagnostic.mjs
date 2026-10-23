import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

export const AUTHENTICATED_GOVERN_STUDIO_DIAGNOSTIC_SCHEMA = 'authenticated-govern-studio-diagnostic-v1';
export const AUTHENTICATED_GOVERN_STUDIO_DIAGNOSTIC_MAX_BYTES = 24_576;
export const AUTHENTICATED_GOVERN_STUDIO_ACTOR_LIMIT_MS = 15_000;

export const AUTHENTICATED_GOVERN_STUDIO_PREREQUISITE_CASE_IDS = Object.freeze([
  'ASSESS-002', 'ASSESS-003', 'ASSESS-018', 'ASSESS-019', 'ASSESS-020', 'E2E-004',
  'GOVERN-001', 'GOVERN-002', 'GOVERN-003', 'GOVERN-004',
  'SAFETY-001', 'SAFETY-002', 'SAFETY-003',
]);
export const AUTHENTICATED_GOVERN_STUDIO_TARGET_CASE_IDS = Object.freeze([
  'GOVERN-005', 'GOVERN-007', 'STUDIO-001',
]);
export const AUTHENTICATED_GOVERN_STUDIO_CASE_IDS = Object.freeze([
  ...AUTHENTICATED_GOVERN_STUDIO_PREREQUISITE_CASE_IDS,
  ...AUTHENTICATED_GOVERN_STUDIO_TARGET_CASE_IDS,
]);

export const AUTHENTICATED_GOVERN_STUDIO_ACTION_CONTRACT = Object.freeze([
  Object.freeze({ key: 'reviewerApproval', commandType: 'assessment_v2.review.resolve', persona: 'reviewer', status: 200 }),
  Object.freeze({ key: 'reviewerGovernDenial', commandType: 'assessment_v2.govern.resolve', persona: 'reviewer', status: 403 }),
  Object.freeze({ key: 'approverGovernResolution', commandType: 'assessment_v2.govern.resolve', persona: 'approver', status: 200 }),
  Object.freeze({ key: 'assessStudioHandoff', commandType: 'assessment_v2.studio.handoff', persona: 'approver', status: 200 }),
  Object.freeze({ key: 'studioRequest', commandType: 'studio.handoff.request', persona: 'approver', status: 201 }),
  Object.freeze({ key: 'studioReview', commandType: 'studio.handoff.review.resolve', persona: 'reviewer', status: 201 }),
  Object.freeze({ key: 'studioFinalAccept', commandType: 'studio.handoff.approval.resolve', persona: 'author', status: 201 }),
  Object.freeze({ key: 'studioConsume', commandType: 'studio.handoff.consume', persona: 'approver', status: 201 }),
]);

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const SHA = /^[0-9a-f]{40}$/u;
const expectedClassification = contract => contract.key === 'reviewerGovernDenial'
  ? 'PERMISSION_DENIED' : 'COMMITTED';
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = code => { throw new Error(`AUTHENTICATED_GOVERN_STUDIO_${code}`); };
const exactKeys = (value, keys, code) => {
  if (!record(value) || !isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort())) fail(code);
};
const digest = value => `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

const changedRecords = action => {
  const before = new Map(action.before.records.map(row => [row.recordHash, row]));
  const after = new Map(action.after.records.map(row => [row.recordHash, row]));
  return [...new Set([...before.keys(), ...after.keys()])].filter(key => {
    const left = before.get(key); const right = after.get(key);
    return !left || !right || left.rowHash !== right.rowHash || left.active !== right.active;
  }).map(key => after.get(key) ?? before.get(key)).sort((a, b) =>
    `${a.source}:${a.recordHash}`.localeCompare(`${b.source}:${b.recordHash}`));
};

const validateAction = (action, contract) => {
  if (!record(action) || action.complete !== true || action.commandType !== contract.commandType
    || action.persona !== contract.persona || action.status !== contract.status
    || !DIGEST.test(action.actionId ?? '') || !record(action.response)
    || action.response.status !== contract.status
    || action.response.classification !== expectedClassification(contract)
    || !record(action.before) || !record(action.after)
    || !Array.isArray(action.before.records) || !Array.isArray(action.after.records)) fail('ACTION_REJECTED');
  if (contract.key === 'reviewerGovernDenial') {
    if (changedRecords(action).length !== 0) {
      fail('REVIEWER_DENIAL_REJECTED');
    }
  }
  if (contract.key === 'approverGovernResolution') {
    const sources = changedRecords(action).map(row => row.source).sort();
    if (!isDeepStrictEqual(sources, [
      'assess_command_receipts', 'assess_v2_cases', 'assess_v2_govern_resolutions', 'privileged_audit_events',
    ])) fail('GOVERN_EFFECTS_REJECTED');
  }
  return Object.freeze({ key: contract.key, commandType: contract.commandType, persona: contract.persona,
    status: contract.status, classification: action.response.classification, actionDigest: digest({
      actionId: action.actionId, requestIdHash: action.requestIdHash,
      commandBindingHash: action.commandBindingHash, before: action.before.capturedAt, after: action.after.capturedAt,
    }) });
};

const validateLineage = value => {
  exactKeys(value, [
    'schemaVersion', 'verified', 'reviewerGovernCapabilityAbsent', 'approverGovernCapabilityPresent',
    'approvedReviewCount', 'governResolutionCount', 'studioHandoffCount', 'moduleHandoffCount',
    'studioSourcePackageCount', 'sameScope', 'sameCase', 'sameDecision', 'sameReviewResolution',
    'sameGovernResolution', 'sameAssessHandoff', 'sameModuleHandoff', 'sameSourcePackage',
    'expectedCaseVersionAdvanced', 'governCaseWrites', 'governResolutionWrites', 'governReceiptWrites',
    'governAuditWrites', 'governOtherWrites', 'providerCalls', 'paidCalls', 'lineageDigest',
  ], 'LINEAGE_SHAPE_REJECTED');
  if (value.schemaVersion !== 'authenticated-govern-studio-lineage-v1' || value.verified !== true
    || value.reviewerGovernCapabilityAbsent !== true || value.approverGovernCapabilityPresent !== true
    || value.approvedReviewCount !== 1 || value.governResolutionCount !== 1 || value.studioHandoffCount !== 1
    || value.moduleHandoffCount !== 1 || value.studioSourcePackageCount !== 1
    || !['sameScope', 'sameCase', 'sameDecision', 'sameReviewResolution', 'sameGovernResolution',
      'sameAssessHandoff', 'sameModuleHandoff', 'sameSourcePackage', 'expectedCaseVersionAdvanced']
      .every(key => value[key] === true)
    || value.governCaseWrites !== 1 || value.governResolutionWrites !== 1
    || value.governReceiptWrites !== 1 || value.governAuditWrites !== 1 || value.governOtherWrites !== 0
    || value.providerCalls !== 0 || value.paidCalls !== 0 || !DIGEST.test(value.lineageDigest ?? '')) {
    fail('LINEAGE_REJECTED');
  }
  return Object.freeze({ ...value });
};

const validateCases = (browserCases, serverCases, targetProofRows) => {
  if (!Array.isArray(browserCases) || !Array.isArray(serverCases)
    || browserCases.length !== AUTHENTICATED_GOVERN_STUDIO_CASE_IDS.length
    || serverCases.length !== AUTHENTICATED_GOVERN_STUDIO_CASE_IDS.length) fail('CASE_INVENTORY_REJECTED');
  for (const rows of [browserCases, serverCases]) {
    const ids = rows.map(row => row?.testId);
    if (!isDeepStrictEqual([...ids].sort(), [...AUTHENTICATED_GOVERN_STUDIO_CASE_IDS].sort())
      || rows.some(row => row?.project !== 'desktop-chromium')) fail('CASE_INVENTORY_REJECTED');
  }
  if (!Array.isArray(targetProofRows) || targetProofRows.length !== 3
    || !isDeepStrictEqual(targetProofRows.map(row => row?.testId).sort(), [...AUTHENTICATED_GOVERN_STUDIO_TARGET_CASE_IDS].sort())) {
    fail('TARGET_PROOF_INVENTORY_REJECTED');
  }
  const govern = targetProofRows.find(row => row.testId === 'GOVERN-007');
  const approval = targetProofRows.find(row => row.testId === 'GOVERN-005');
  const studio = targetProofRows.find(row => row.testId === 'STUDIO-001');
  const approvalResult = approval?.observations?.browser?.result;
  const result = govern?.observations?.browser?.result;
  const studioResult = studio?.observations?.browser?.result;
  if (approvalResult?.independentApprovalCommitted !== true
    || approvalResult?.approvedCurrentVersionVisible !== true
    || result?.reviewerControlDisabled !== true || result?.exactCurrentScope !== true
    || result?.exactCurrentVersion !== true || result?.separationDenialZeroEffects !== true
    || result?.independentResolutionCommitted !== true || !DIGEST.test(result?.requestBindingDigest ?? '')) {
    fail('BROWSER_GOVERN_PROOF_REJECTED');
  }
  if (studioResult?.approvedHandoffConsumed !== true || studioResult?.exactSourceAncestryVisible !== true) {
    fail('BROWSER_STUDIO_PROOF_REJECTED');
  }
  return Object.freeze({ prerequisiteCaseCount: AUTHENTICATED_GOVERN_STUDIO_PREREQUISITE_CASE_IDS.length,
    targetCaseCount: AUTHENTICATED_GOVERN_STUDIO_TARGET_CASE_IDS.length,
    totalCaseCount: AUTHENTICATED_GOVERN_STUDIO_CASE_IDS.length,
    prerequisiteCaseIds: AUTHENTICATED_GOVERN_STUDIO_PREREQUISITE_CASE_IDS,
    targetCaseIds: AUTHENTICATED_GOVERN_STUDIO_TARGET_CASE_IDS });
};

export function buildAuthenticatedGovernStudioDiagnostic(input) {
  exactKeys(input, ['source', 'browserCases', 'serverCases', 'targetProofRows', 'trustedActions', 'trustedLineage', 'cleanup'], 'INPUT_REJECTED');
  const rawInput = JSON.stringify(input);
  if (Buffer.byteLength(rawInput) > 2_000_000
    || /https?:\/\/|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|access[_-]?token|authorization|service[_-]?role/iu.test(rawInput)) {
    fail('UNSAFE_OUTPUT_REJECTED');
  }
  exactKeys(input.source, ['releaseSha', 'runId', 'attempt', 'sourceDigest'], 'SOURCE_REJECTED');
  if (!SHA.test(input.source.releaseSha ?? '') || !/^[1-9][0-9]*$/u.test(input.source.runId ?? '')
    || !/^[1-9][0-9]*$/u.test(input.source.attempt ?? '') || !DIGEST.test(input.source.sourceDigest ?? '')) {
    fail('SOURCE_REJECTED');
  }
  if (!Array.isArray(input.trustedActions)
    || input.trustedActions.length !== AUTHENTICATED_GOVERN_STUDIO_ACTION_CONTRACT.length) fail('ACTION_REJECTED');
  const actions = AUTHENTICATED_GOVERN_STUDIO_ACTION_CONTRACT.map((contract, index) =>
    validateAction(input.trustedActions[index], contract));
  const inventory = validateCases(input.browserCases, input.serverCases, input.targetProofRows);
  const lineage = validateLineage(input.trustedLineage);
  exactKeys(input.cleanup, ['status'], 'CLEANUP_REJECTED');
  if (input.cleanup.status !== 'verified') fail('CLEANUP_REJECTED');
  const document = Object.freeze({
    schemaVersion: AUTHENTICATED_GOVERN_STUDIO_DIAGNOSTIC_SCHEMA,
    mode: 'govern_studio_diagnostic',
    source: Object.freeze({ ...input.source }),
    scope: Object.freeze({ project: 'desktop-chromium' }),
    inventory,
    actions: Object.freeze({ count: actions.length, ordered: Object.freeze(actions) }),
    govern: Object.freeze({ reviewerGovernCapabilityAbsent: true, reviewerControlDisabled: true,
      denialStatus: 403, denialClassification: 'PERMISSION_DENIED', denialZeroEffects: true,
      approverStatus: 200, independentResolutionCommitted: true,
      caseVersionWrites: 1, resolutionWrites: 1, receiptWrites: 1, auditWrites: 1, otherWrites: 0 }),
    lineage,
    policy: Object.freeze({ providersEnabled: false, providerCalls: 0, paidCalls: 0,
      actorLimitMs: AUTHENTICATED_GOVERN_STUDIO_ACTOR_LIMIT_MS }),
    cleanup: Object.freeze({ status: 'verified' }),
    diagnosticCompleted: true,
    acceptancePromoted: false,
    fullAcceptanceExecuted: false,
    providerGenerationExecuted: false,
  });
  const serialized = JSON.stringify(document);
  if (Buffer.byteLength(serialized) > AUTHENTICATED_GOVERN_STUDIO_DIAGNOSTIC_MAX_BYTES
    || /https?:\/\/|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|access[_-]?token|authorization|service[_-]?role/iu.test(serialized)) {
    fail('UNSAFE_OUTPUT_REJECTED');
  }
  return document;
}

export function validateAuthenticatedGovernStudioDiagnostic(value) {
  try {
    exactKeys(value, [
      'schemaVersion', 'mode', 'source', 'scope', 'inventory', 'actions', 'govern', 'lineage', 'policy',
      'cleanup', 'diagnosticCompleted', 'acceptancePromoted', 'fullAcceptanceExecuted',
      'providerGenerationExecuted',
    ], 'OUTPUT_REJECTED');
    exactKeys(value.source, ['releaseSha', 'runId', 'attempt', 'sourceDigest'], 'OUTPUT_SOURCE_REJECTED');
    exactKeys(value.scope, ['project'], 'OUTPUT_SCOPE_REJECTED');
    exactKeys(value.inventory, [
      'prerequisiteCaseCount', 'targetCaseCount', 'totalCaseCount',
      'prerequisiteCaseIds', 'targetCaseIds',
    ], 'OUTPUT_INVENTORY_REJECTED');
    exactKeys(value.actions, ['count', 'ordered'], 'OUTPUT_ACTIONS_REJECTED');
    exactKeys(value.govern, [
      'reviewerGovernCapabilityAbsent', 'reviewerControlDisabled', 'denialStatus',
      'denialClassification', 'denialZeroEffects', 'approverStatus',
      'independentResolutionCommitted', 'caseVersionWrites', 'resolutionWrites',
      'receiptWrites', 'auditWrites', 'otherWrites',
    ], 'OUTPUT_GOVERN_REJECTED');
    exactKeys(value.policy, ['providersEnabled', 'providerCalls', 'paidCalls', 'actorLimitMs'], 'OUTPUT_POLICY_REJECTED');
    exactKeys(value.cleanup, ['status'], 'OUTPUT_CLEANUP_REJECTED');
    if (value.schemaVersion !== AUTHENTICATED_GOVERN_STUDIO_DIAGNOSTIC_SCHEMA
      || value.mode !== 'govern_studio_diagnostic' || value.scope?.project !== 'desktop-chromium'
      || !SHA.test(value.source?.releaseSha ?? '') || !/^[1-9][0-9]*$/u.test(value.source?.runId ?? '')
      || !/^[1-9][0-9]*$/u.test(value.source?.attempt ?? '') || !DIGEST.test(value.source?.sourceDigest ?? '')
      || value.inventory?.prerequisiteCaseCount !== AUTHENTICATED_GOVERN_STUDIO_PREREQUISITE_CASE_IDS.length
      || value.inventory?.targetCaseCount !== AUTHENTICATED_GOVERN_STUDIO_TARGET_CASE_IDS.length
      || value.inventory?.totalCaseCount !== AUTHENTICATED_GOVERN_STUDIO_CASE_IDS.length
      || !isDeepStrictEqual(value.inventory?.prerequisiteCaseIds, AUTHENTICATED_GOVERN_STUDIO_PREREQUISITE_CASE_IDS)
      || !isDeepStrictEqual(value.inventory?.targetCaseIds, AUTHENTICATED_GOVERN_STUDIO_TARGET_CASE_IDS)
      || value.actions?.count !== AUTHENTICATED_GOVERN_STUDIO_ACTION_CONTRACT.length
      || !Array.isArray(value.actions?.ordered)
      || value.actions.ordered.length !== AUTHENTICATED_GOVERN_STUDIO_ACTION_CONTRACT.length
      || value.actions.ordered.some((action, index) => {
        const contract = AUTHENTICATED_GOVERN_STUDIO_ACTION_CONTRACT[index];
        try {
          exactKeys(action, ['key', 'commandType', 'persona', 'status', 'classification', 'actionDigest'], 'OUTPUT_ACTION_REJECTED');
        } catch {
          return true;
        }
        return action.key !== contract.key || action.commandType !== contract.commandType
          || action.persona !== contract.persona || action.status !== contract.status
          || action.classification !== expectedClassification(contract) || !DIGEST.test(action.actionDigest ?? '');
      })
      || new Set(value.actions.ordered.map(action => action.actionDigest)).size !== value.actions.ordered.length
      || value.govern?.reviewerGovernCapabilityAbsent !== true
      || value.govern?.reviewerControlDisabled !== true || value.govern?.denialStatus !== 403
      || value.govern?.denialClassification !== 'PERMISSION_DENIED'
      || value.govern?.denialZeroEffects !== true || value.govern?.approverStatus !== 200
      || value.govern?.independentResolutionCommitted !== true
      || value.govern?.caseVersionWrites !== 1 || value.govern?.resolutionWrites !== 1
      || value.govern?.receiptWrites !== 1 || value.govern?.auditWrites !== 1
      || value.govern?.otherWrites !== 0 || value.policy?.providersEnabled !== false
      || value.policy?.providerCalls !== 0 || value.policy?.paidCalls !== 0
      || value.policy?.actorLimitMs !== AUTHENTICATED_GOVERN_STUDIO_ACTOR_LIMIT_MS
      || value.cleanup?.status !== 'verified' || value.diagnosticCompleted !== true
      || value.acceptancePromoted !== false || value.fullAcceptanceExecuted !== false
      || value.providerGenerationExecuted !== false) return null;
    validateLineage(value.lineage);
    const serialized = JSON.stringify(value);
    if (Buffer.byteLength(serialized) > AUTHENTICATED_GOVERN_STUDIO_DIAGNOSTIC_MAX_BYTES
      || /https?:\/\/|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|access[_-]?token|authorization|service[_-]?role/iu.test(serialized)) return null;
    return Object.freeze(structuredClone(value));
  } catch {
    return null;
  }
}
