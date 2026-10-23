import { isDeepStrictEqual } from 'node:util';

import { reconstructAuthenticatedHostedCaseEvidence } from './authenticatedHostedEvidence.mjs';

export const AUTHENTICATED_REVIEWER_SELECTION_DIAGNOSTIC_SCHEMA =
  'authenticated-reviewer-selection-diagnostic-v1';

const SHA = /^[0-9a-f]{40}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const POSITIVE_INTEGER = /^[1-9][0-9]{0,19}$/u;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = code => { throw new Error(`AUTHENTICATED_REVIEWER_SELECTION_DIAGNOSTIC_${code}`); };
const exactKeys = (value, expected, code = 'SHAPE_REJECTED') => {
  if (!record(value) || !isDeepStrictEqual(Object.keys(value).sort(), [...expected].sort())) fail(code);
};

const validateSource = source => {
  exactKeys(source, ['releaseSha', 'runId', 'attempt', 'sourceDigest'], 'SOURCE_REJECTED');
  if (typeof source.releaseSha !== 'string' || typeof source.runId !== 'string'
    || typeof source.attempt !== 'string' || typeof source.sourceDigest !== 'string'
    || !SHA.test(source.releaseSha) || !POSITIVE_INTEGER.test(source.runId)
    || !POSITIVE_INTEGER.test(source.attempt) || !DIGEST.test(source.sourceDigest)) fail('SOURCE_REJECTED');
};

const validateCandidateProof = candidates => {
  exactKeys(candidates, [
    'count', 'reviewerIncluded', 'ownerExcluded', 'approverExcluded', 'outsiderExcluded',
  ], 'CANDIDATES_REJECTED');
  if (candidates.count !== 1 || candidates.reviewerIncluded !== true || candidates.ownerExcluded !== true
    || candidates.approverExcluded !== true || candidates.outsiderExcluded !== true) fail('CANDIDATES_REJECTED');
};

const validateActions = actions => {
  exactKeys(actions, ['assignment', 'replay', 'stale', 'bindings'], 'ACTIONS_REJECTED');
  for (const key of ['assignment', 'replay', 'stale']) {
    exactKeys(actions[key], ['command', 'status', 'classification'], 'ACTIONS_REJECTED');
  }
  if (actions.assignment.command !== 'assessment_v2.review.assign' || actions.assignment.status !== 200
    || actions.assignment.classification !== 'COMMITTED'
    || actions.replay.command !== 'assessment_v2.review.assign' || actions.replay.status !== 200
    || actions.replay.classification !== 'REPLAYED'
    || actions.stale.command !== 'assessment_v2.review.resolve' || actions.stale.status !== 409
    || actions.stale.classification !== 'VERSION_CONFLICT') fail('ACTIONS_REJECTED');
  exactKeys(actions.bindings, [
    'sameReviewerSession', 'assignmentReplayRequestEqual', 'assignmentReplayCommandEqual',
    'assignmentReplayCommandIdEqual', 'assignmentReplayReceiptEqual', 'staleRequestDistinct',
    'staleCommandDistinct',
  ], 'BINDINGS_REJECTED');
  if (Object.values(actions.bindings).some(value => value !== true)) fail('BINDINGS_REJECTED');
};

export function validateAuthenticatedReviewerSelectionDiagnostic(document) {
  exactKeys(document, [
    'schemaVersion', 'mode', 'source', 'scope', 'candidates', 'actions', 'effects',
    'evidenceComposition', 'providers', 'cleanup', 'diagnosticCompleted', 'acceptancePromoted',
  ]);
  if (document.schemaVersion !== AUTHENTICATED_REVIEWER_SELECTION_DIAGNOSTIC_SCHEMA
    || document.mode !== 'reviewer_selection_diagnostic') fail('MODE_REJECTED');
  validateSource(document.source);
  exactKeys(document.scope, ['project', 'persona', 'testId'], 'SCOPE_REJECTED');
  if (document.scope.project !== 'desktop-chromium' || document.scope.persona !== 'reviewer'
    || document.scope.testId !== 'E2E-004') fail('SCOPE_REJECTED');
  validateCandidateProof(document.candidates);
  validateActions(document.actions);
  exactKeys(document.evidenceComposition,
    ['kind', 'carriedRecords', 'rawFinalFrameAnchored'], 'EVIDENCE_COMPOSITION_REJECTED');
  if (document.evidenceComposition.kind !== 'trusted-server-action-frame-carry-forward'
    || document.evidenceComposition.carriedRecords !== 4
    || document.evidenceComposition.rawFinalFrameAnchored !== false) fail('EVIDENCE_COMPOSITION_REJECTED');
  exactKeys(document.effects, ['assignmentWrites', 'receiptWrites', 'auditWrites', 'otherWrites'], 'EFFECTS_REJECTED');
  if (!isDeepStrictEqual(document.effects, {
    assignmentWrites: 1, receiptWrites: 1, auditWrites: 1, otherWrites: 0,
  })) fail('EFFECTS_REJECTED');
  exactKeys(document.providers, ['enabled', 'providerCalls', 'paidCalls'], 'PROVIDERS_REJECTED');
  if (!isDeepStrictEqual(document.providers, { enabled: false, providerCalls: 0, paidCalls: 0 })) {
    fail('PROVIDERS_REJECTED');
  }
  exactKeys(document.cleanup, ['status'], 'CLEANUP_REJECTED');
  if (document.cleanup.status !== 'verified') fail('CLEANUP_REJECTED');
  if (document.diagnosticCompleted !== true || document.acceptancePromoted !== false) fail('PROMOTION_REJECTED');
  const serialized = JSON.stringify(document);
  if (/access[_-]?token|refresh[_-]?token|service[_-]?role|password|https?:\/\/|requestBody|rawRequest|actorId|sessionId|caseId|decisionId|reviewerId/iu
    .test(serialized)) fail('PRIVATE_FIELD_REJECTED');
  return structuredClone(document);
}

const bindingFields = Object.freeze([
  'actorHash', 'sessionHash', 'requestIdHash', 'persistedRequestHash', 'commandBindingHash',
  'commandIdHash', 'receiptIdHash', 'auditIdHash',
]);
const completeAnchor = row => ['actorHash', 'sessionHash', 'requestIdHash', 'commandBindingHash',
  'commandIdHash', 'receiptIdHash'].every(field => DIGEST.test(row?.[field] ?? ''));
const rowIdentity = row => ({
  source: row.source, recordHash: row.recordHash, rowHash: row.rowHash,
  businessRowHash: row.businessRowHash, active: row.active, effectKind: row.effectKind,
  classification: row.classification, organizationHash: row.organizationHash, workspaceHash: row.workspaceHash,
});
const frameChanges = frame => {
  const before = new Map(frame.before.records.map(row => [row.recordHash, row]));
  return frame.after.records.filter(row => {
    const prior = before.get(row.recordHash);
    return !prior || prior.rowHash !== row.rowHash || prior.active !== row.active;
  });
};
const composeTrustedAssignmentEvidence = ({ server, trustedActionFrames, assignment }) => {
  if (!Array.isArray(trustedActionFrames) || trustedActionFrames.length !== 3
    || trustedActionFrames.some(frame => !record(frame) || !record(frame.before) || !record(frame.after)
      || !Array.isArray(frame.before.records) || !Array.isArray(frame.after.records))) {
    fail('EVIDENCE_COMPOSITION_REJECTED');
  }
  const assignmentChanges = frameChanges(trustedActionFrames[0]);
  if (!isDeepStrictEqual(assignmentChanges.map(row => row.source).sort(), [
    'assess_command_receipts', 'assess_v2_cases', 'assess_v2_review_assignments', 'privileged_audit_events',
  ])) fail('EVIDENCE_COMPOSITION_REJECTED');
  for (const row of assignmentChanges) {
    if (!completeAnchor(row) || row.actorHash !== assignment.actorHash || row.sessionHash !== assignment.sessionHash
      || row.requestIdHash !== assignment.requestIdHash || row.commandBindingHash !== assignment.commandBindingHash
      || row.commandIdHash !== assignment.response.commandIdHash
      || row.receiptIdHash !== assignment.response.receiptIdHash) fail('EVIDENCE_COMPOSITION_REJECTED');
    for (const frame of trustedActionFrames.slice(1)) {
      const matches = frame.after.records.filter(candidate => isDeepStrictEqual(rowIdentity(candidate), rowIdentity(row)));
      if (matches.length !== 1) fail('EVIDENCE_COMPOSITION_REJECTED');
      const conflicting = matches.filter(completeAnchor).some(candidate => bindingFields.some(field => candidate[field] !== row[field]));
      if (conflicting) fail('EVIDENCE_COMPOSITION_REJECTED');
    }
  }
  const composed = structuredClone(server);
  let carriedRecords = 0;
  for (const row of assignmentChanges) {
    const matches = composed.after.records.filter(candidate => isDeepStrictEqual(rowIdentity(candidate), rowIdentity(row)));
    if (matches.length !== 1) fail('EVIDENCE_COMPOSITION_REJECTED');
    const target = matches[0];
    if (completeAnchor(target) && bindingFields.some(field => target[field] !== row[field])) {
      fail('EVIDENCE_COMPOSITION_REJECTED');
    }
    if (!completeAnchor(target)) {
      for (const field of bindingFields) target[field] = row[field];
      carriedRecords += 1;
    }
  }
  if (carriedRecords !== 4) fail('EVIDENCE_COMPOSITION_REJECTED');
  return { server: composed, evidenceComposition: {
    kind: 'trusted-server-action-frame-carry-forward', carriedRecords, rawFinalFrameAnchored: false,
  } };
};

export function buildAuthenticatedReviewerSelectionDiagnostic({ source, browser, server, trustedActionFrames,
  candidates, commands, cleanup }) {
  validateCandidateProof(candidates);
  if (!Array.isArray(commands) || !isDeepStrictEqual(commands, [
    'assessment_v2.review.assign', 'assessment_v2.review.assign', 'assessment_v2.review.resolve',
  ])) fail('COMMANDS_REJECTED');
  const [assignment] = browser.actions;
  const composed = composeTrustedAssignmentEvidence({ server, trustedActionFrames, assignment });
  const reconstructed = reconstructAuthenticatedHostedCaseEvidence({
    browser,
    server: composed.server,
    definition: {
      expectedMutationCount: 1,
      expectedAudit: 'not applicable',
      expectedDenial: false,
      expectedLineage: 'preserved and tenant scoped',
    },
  });
  if (reconstructed.testId !== 'E2E-004' || reconstructed.project !== 'desktop-chromium'
    || reconstructed.status !== 'PASS' || reconstructed.ui.actionCount !== 3
    || browser.actions.length !== 3 || browser.participants.length !== 1
    || browser.participants[0].persona !== 'reviewer') fail('CASE_REJECTED');
  const [, replay, stale] = browser.actions;
  const beforeByHash = new Map(composed.server.before.records.map(row => [row.recordHash, row]));
  const changedRows = composed.server.after.records.filter(row => {
    const before = beforeByHash.get(row.recordHash);
    return !before || before.rowHash !== row.rowHash || before.active !== row.active;
  });
  const changedDomainSources = changedRows.filter(row => row.effectKind === 'domain').map(row => row.source).sort();
  const otherWrites = reconstructed.measurements.generationAttemptWrites
    + reconstructed.measurements.secretWrites + reconstructed.measurements.storageWrites
    + reconstructed.measurements.providerCalls + reconstructed.measurements.paidCalls
    + reconstructed.measurements.providerTokens + reconstructed.measurements.budgetReservations
    + reconstructed.measurements.budgetDebits + reconstructed.measurements.foreignWrites
    + reconstructed.measurements.concurrencyWrites;
  if (reconstructed.measurements.logicalMutations !== 1 || reconstructed.measurements.domainWrites !== 2
    || !isDeepStrictEqual(changedDomainSources, ['assess_v2_cases', 'assess_v2_review_assignments'])
    || stale.response.commandIdHash !== null || stale.response.receiptIdHash !== null) fail('EFFECTS_REJECTED');
  const document = {
    schemaVersion: AUTHENTICATED_REVIEWER_SELECTION_DIAGNOSTIC_SCHEMA,
    mode: 'reviewer_selection_diagnostic',
    source: structuredClone(source),
    scope: { project: 'desktop-chromium', persona: 'reviewer', testId: 'E2E-004' },
    candidates: structuredClone(candidates),
    evidenceComposition: composed.evidenceComposition,
    actions: {
      assignment: { command: commands[0], status: assignment.response.status,
        classification: assignment.response.classification },
      replay: { command: commands[1], status: replay.response.status,
        classification: replay.response.classification },
      stale: { command: commands[2], status: stale.response.status,
        classification: stale.response.classification },
      bindings: {
        sameReviewerSession: [replay, stale].every(action => action.actorHash === assignment.actorHash
          && action.sessionHash === assignment.sessionHash),
        assignmentReplayRequestEqual: assignment.requestIdHash === replay.requestIdHash,
        assignmentReplayCommandEqual: assignment.commandBindingHash === replay.commandBindingHash,
        assignmentReplayCommandIdEqual: assignment.response.commandIdHash !== null
          && assignment.response.commandIdHash === replay.response.commandIdHash,
        assignmentReplayReceiptEqual: assignment.response.receiptIdHash !== null
          && assignment.response.receiptIdHash === replay.response.receiptIdHash,
        staleRequestDistinct: stale.requestIdHash !== assignment.requestIdHash,
        staleCommandDistinct: stale.commandBindingHash !== assignment.commandBindingHash,
      },
    },
    effects: {
      assignmentWrites: changedDomainSources.filter(source => source === 'assess_v2_review_assignments').length,
      receiptWrites: reconstructed.measurements.receiptWrites,
      auditWrites: reconstructed.measurements.auditWrites,
      otherWrites,
    },
    providers: { enabled: false, providerCalls: reconstructed.measurements.providerCalls,
      paidCalls: reconstructed.measurements.paidCalls },
    cleanup: structuredClone(cleanup),
    diagnosticCompleted: true,
    acceptancePromoted: false,
  };
  return validateAuthenticatedReviewerSelectionDiagnostic(document);
}
