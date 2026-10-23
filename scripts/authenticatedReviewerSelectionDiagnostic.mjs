import { isDeepStrictEqual } from 'node:util';

import { reconstructAuthenticatedHostedCaseEvidence } from './authenticatedHostedEvidence.mjs';

export const AUTHENTICATED_REVIEWER_SELECTION_DIAGNOSTIC_SCHEMA =
  'authenticated-reviewer-selection-diagnostic-v2';

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
    'sameReviewerSession', 'assignmentReplayRequestDistinct', 'assignmentReplayCommandDistinct',
    'assignmentReplaySemanticEqual', 'assignmentReplayIdempotencyEqual', 'assignmentReplayEnvelopeEqual',
    'receiptOriginMatchesAssignment', 'assignmentReplayCommandIdEqual', 'assignmentReplayReceiptEqual',
    'staleRequestDistinct', 'staleCommandDistinct',
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
  const after = new Map(frame.after.records.map(row => [row.recordHash, row]));
  return [...new Set([...before.keys(), ...after.keys()])].flatMap(recordHash => {
    const prior = before.get(recordHash) ?? null;
    const current = after.get(recordHash) ?? null;
    return !prior || !current || prior.rowHash !== current.rowHash || prior.active !== current.active
      ? [{ prior, current, row: current ?? prior }] : [];
  });
};
const composeTrustedAssignmentEvidence = ({ server, trustedActionFrames, assignment }) => {
  if (!Array.isArray(trustedActionFrames) || trustedActionFrames.length !== 3
    || trustedActionFrames.some(frame => !record(frame) || !record(frame.before) || !record(frame.after)
      || !Array.isArray(frame.before.records) || !Array.isArray(frame.after.records))) {
    fail('EVIDENCE_COMPOSITION_REJECTED');
  }
  const assignmentChanges = frameChanges(trustedActionFrames[0]);
  if (assignmentChanges.some(change => !change.current)
    || !isDeepStrictEqual(assignmentChanges.map(change => change.row.source).sort(), [
    'assess_command_receipts', 'assess_v2_cases', 'assess_v2_review_assignments', 'privileged_audit_events',
  ])) fail('EVIDENCE_COMPOSITION_REJECTED');
  if (trustedActionFrames.slice(1).some(frame => frameChanges(frame).length !== 0)) {
    fail('EVIDENCE_COMPOSITION_REJECTED');
  }
  for (const { row } of assignmentChanges) {
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
  for (const { row } of assignmentChanges) {
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

const proofFields = Object.freeze([
  'receiptOriginRequestIdHash', 'semanticRequestHash', 'idempotencyKeyHash', 'semanticEnvelopeHash',
]);
const validateTrustedReplayProof = ({ browser, trustedActionProofs }) => {
  if (!record(browser) || !Array.isArray(browser.actions) || browser.actions.length !== 3
    || !Array.isArray(trustedActionProofs) || trustedActionProofs.length !== 3
    || trustedActionProofs[2] !== null) fail('TRUSTED_ACTION_PROOF_REJECTED');
  const [assignment, replay, stale] = browser.actions;
  const [assignmentProof, replayProof] = trustedActionProofs;
  for (const proof of [assignmentProof, replayProof]) {
    exactKeys(proof, proofFields, 'TRUSTED_ACTION_PROOF_REJECTED');
    if (proofFields.some(field => !DIGEST.test(proof[field] ?? ''))) fail('TRUSTED_ACTION_PROOF_REJECTED');
  }
  if ([assignment, replay, stale].some(action => !record(action) || !record(action.response)
      || !DIGEST.test(action.actorHash ?? '') || !DIGEST.test(action.sessionHash ?? '')
      || !DIGEST.test(action.requestIdHash ?? '') || !DIGEST.test(action.commandBindingHash ?? ''))
    || assignment.response?.status !== 200 || assignment.response?.classification !== 'COMMITTED'
    || replay.response?.status !== 200 || replay.response?.classification !== 'REPLAYED'
    || stale.response?.status !== 409 || stale.response?.classification !== 'VERSION_CONFLICT'
    || [replay, stale].some(action => action.actorHash !== assignment.actorHash
      || action.sessionHash !== assignment.sessionHash)
    || assignment.requestIdHash === replay.requestIdHash
    || assignment.commandBindingHash === replay.commandBindingHash
    || !DIGEST.test(assignment.response.commandIdHash ?? '')
    || assignment.response.commandIdHash !== replay.response.commandIdHash
    || !DIGEST.test(assignment.response.receiptIdHash ?? '')
    || assignment.response.receiptIdHash !== replay.response.receiptIdHash
    || stale.response.commandIdHash !== null || stale.response.receiptIdHash !== null
    || [assignment.requestIdHash, replay.requestIdHash].includes(stale.requestIdHash)
    || [assignment.commandBindingHash, replay.commandBindingHash].includes(stale.commandBindingHash)
    || assignmentProof.receiptOriginRequestIdHash !== assignment.requestIdHash
    || replayProof.receiptOriginRequestIdHash !== assignment.requestIdHash
    || assignmentProof.semanticRequestHash !== replayProof.semanticRequestHash
    || assignmentProof.idempotencyKeyHash !== replayProof.idempotencyKeyHash
    || assignmentProof.semanticEnvelopeHash !== replayProof.semanticEnvelopeHash) {
    fail('TRUSTED_ACTION_PROOF_REJECTED');
  }
  return { assignment, replay, stale, assignmentProof, replayProof };
};

export function buildAuthenticatedReviewerSelectionDiagnostic({ source, browser, server, trustedActionFrames,
  trustedActionProofs, candidates, commands, cleanup }) {
  validateCandidateProof(candidates);
  if (!Array.isArray(commands) || !isDeepStrictEqual(commands, [
    'assessment_v2.review.assign', 'assessment_v2.review.assign', 'assessment_v2.review.resolve',
  ])) fail('COMMANDS_REJECTED');
  const rawBrowser = structuredClone(browser);
  const { assignment, replay, stale, assignmentProof, replayProof } = validateTrustedReplayProof({
    browser, trustedActionProofs,
  });
  const composed = composeTrustedAssignmentEvidence({ server, trustedActionFrames, assignment });
  const diagnosticBrowser = structuredClone(browser);
  diagnosticBrowser.actions[1].response.commandIdHash = null;
  diagnosticBrowser.actions[1].response.receiptIdHash = null;
  const reconstructed = reconstructAuthenticatedHostedCaseEvidence({
    browser: diagnosticBrowser,
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
    || stale.response.commandIdHash !== null || stale.response.receiptIdHash !== null
    || !isDeepStrictEqual(browser, rawBrowser)) fail('EFFECTS_REJECTED');
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
        assignmentReplayRequestDistinct: assignment.requestIdHash !== replay.requestIdHash,
        assignmentReplayCommandDistinct: assignment.commandBindingHash !== replay.commandBindingHash,
        assignmentReplaySemanticEqual: assignmentProof.semanticRequestHash === replayProof.semanticRequestHash,
        assignmentReplayIdempotencyEqual: assignmentProof.idempotencyKeyHash === replayProof.idempotencyKeyHash,
        assignmentReplayEnvelopeEqual: assignmentProof.semanticEnvelopeHash === replayProof.semanticEnvelopeHash,
        receiptOriginMatchesAssignment: assignmentProof.receiptOriginRequestIdHash === assignment.requestIdHash
          && replayProof.receiptOriginRequestIdHash === assignment.requestIdHash,
        assignmentReplayCommandIdEqual: assignment.response.commandIdHash !== null
          && assignment.response.commandIdHash === replay.response.commandIdHash,
        assignmentReplayReceiptEqual: assignment.response.receiptIdHash !== null
          && assignment.response.receiptIdHash === replay.response.receiptIdHash,
        staleRequestDistinct: ![assignment.requestIdHash, replay.requestIdHash].includes(stale.requestIdHash),
        staleCommandDistinct: ![assignment.commandBindingHash, replay.commandBindingHash]
          .includes(stale.commandBindingHash),
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
