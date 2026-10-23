import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAuthenticatedReviewerSelectionDiagnostic,
  validateAuthenticatedReviewerSelectionDiagnostic } from './authenticatedReviewerSelectionDiagnostic.mjs';

const valid = () => ({
  schemaVersion: 'authenticated-reviewer-selection-diagnostic-v2',
  mode: 'reviewer_selection_diagnostic',
  source: { releaseSha: 'a'.repeat(40), runId: '123', attempt: '1', sourceDigest: `sha256:${'b'.repeat(64)}` },
  scope: { project: 'desktop-chromium', persona: 'reviewer', testId: 'E2E-004' },
  candidates: { count: 1, reviewerIncluded: true, ownerExcluded: true, approverExcluded: true, outsiderExcluded: true },
  evidenceComposition: { kind: 'trusted-server-action-frame-carry-forward', carriedRecords: 4,
    rawFinalFrameAnchored: false },
  actions: {
    assignment: { command: 'assessment_v2.review.assign', status: 200, classification: 'COMMITTED' },
    replay: { command: 'assessment_v2.review.assign', status: 200, classification: 'REPLAYED' },
    stale: { command: 'assessment_v2.review.resolve', status: 409, classification: 'VERSION_CONFLICT' },
    bindings: { sameReviewerSession: true, assignmentReplayRequestDistinct: true,
      assignmentReplayCommandDistinct: true, assignmentReplaySemanticEqual: true,
      assignmentReplayIdempotencyEqual: true, assignmentReplayEnvelopeEqual: true,
      receiptOriginMatchesAssignment: true, assignmentReplayCommandIdEqual: true,
      assignmentReplayReceiptEqual: true, staleRequestDistinct: true, staleCommandDistinct: true },
  },
  effects: { assignmentWrites: 1, receiptWrites: 1, auditWrites: 1, otherWrites: 0 },
  providers: { enabled: false, providerCalls: 0, paidCalls: 0 },
  cleanup: { status: 'verified' },
  diagnosticCompleted: true,
  acceptancePromoted: false,
});

test('validates and returns a detached canonical reviewer-selection diagnostic', () => {
  const input = valid();
  const result = validateAuthenticatedReviewerSelectionDiagnostic(input);
  assert.deepEqual(result, input);
  assert.notEqual(result, input);
});

const h = value => `sha256:${value.repeat(64)}`;
const buildInput = () => {
  const startedAt = '2026-10-22T00:00:00.000Z';
  const completedAt = '2026-10-22T00:00:03.000Z';
  const participant = { persona: 'reviewer', actorHash: h('1'), sessionHash: h('2') };
  const assignment = { requestIdHash: h('3'), commandBindingHash: h('4'), actorHash: h('1'), sessionHash: h('2'),
    browserPayloadHash: h('5'), response: { status: 200, classification: 'COMMITTED',
      commandIdHash: h('6'), receiptIdHash: h('7') } };
  const replay = structuredClone(assignment);
  replay.requestIdHash = h('d');
  replay.commandBindingHash = h('e');
  replay.response.classification = 'REPLAYED';
  const stale = { requestIdHash: h('8'), commandBindingHash: h('9'), actorHash: h('1'), sessionHash: h('2'),
    browserPayloadHash: h('a'), response: { status: 409, classification: 'VERSION_CONFLICT',
      commandIdHash: null, receiptIdHash: null } };
  const changed = (source, effectKind, recordHash, rowHash, extra = {}) => ({
    source, effectKind, recordHash, rowHash, businessRowHash: rowHash, active: true,
    classification: 'immutable_history', requestIdHash: h('3'), commandBindingHash: h('4'),
    actorHash: h('1'), sessionHash: h('2'), commandIdHash: h('6'), receiptIdHash: h('7'),
    organizationHash: h('b'), workspaceHash: h('c'), occurredAt: completedAt, ...extra,
  });
  const browser = { testId: 'E2E-004', project: 'desktop-chromium', scenario: 'authenticated-e2e-004',
    window: { startedAt, completedAt }, participants: [participant], actions: [assignment, replay, stale],
    assertions: [
      { id: 'stale-command-denied', comparator: 'equals', expected: true, actual: true,
        observedAt: completedAt, source: 'actual-product-browser' },
      { id: 'same-command-reconciled-with-one-effect', comparator: 'equals', expected: true, actual: true,
        observedAt: completedAt, source: 'actual-product-browser' },
    ], source: 'actual-product-browser' };
  const server = { testId: 'E2E-004', project: 'desktop-chromium', scenario: 'authenticated-e2e-004',
    window: { startedAt, completedAt }, participants: [participant],
    before: { capturedAt: startedAt, records: [] },
    after: { capturedAt: completedAt, records: [
      changed('assess_v2_cases', 'domain', h('c'), h('b')),
      changed('assess_v2_review_assignments', 'domain', h('d'), h('e')),
      changed('assess_command_receipts', 'receipt', h('f'), h('0')),
      changed('privileged_audit_events', 'audit', h('9'), h('8'), { auditIdHash: h('7') }),
    ] } };
  const trustedAssignmentAfter=structuredClone(server.after);
  const clearBindings=frame=>{
    const copy=structuredClone(frame);
    for(const row of copy.records)for(const field of ['actorHash','sessionHash','requestIdHash','persistedRequestHash',
      'commandBindingHash','commandIdHash','receiptIdHash','auditIdHash'])row[field]=null;
    return copy;
  };
  server.after=clearBindings(server.after);
  const trustedActionFrames=[
    {before:structuredClone(server.before),after:trustedAssignmentAfter},
    {before:clearBindings(trustedAssignmentAfter),after:clearBindings(trustedAssignmentAfter)},
    {before:clearBindings(trustedAssignmentAfter),after:clearBindings(trustedAssignmentAfter)},
  ];
  const trustedActionProofs = [
    { receiptOriginRequestIdHash: assignment.requestIdHash, semanticRequestHash: h('a'),
      idempotencyKeyHash: h('b'), semanticEnvelopeHash: h('c') },
    { receiptOriginRequestIdHash: assignment.requestIdHash, semanticRequestHash: h('a'),
      idempotencyKeyHash: h('b'), semanticEnvelopeHash: h('c') },
    null,
  ];
  return { source: valid().source, browser, server, trustedActionFrames, trustedActionProofs,
    candidates: valid().candidates,
    commands: ['assessment_v2.review.assign', 'assessment_v2.review.assign', 'assessment_v2.review.resolve'],
    cleanup: { status: 'verified' } };
};

test('reconstructs exact assignment replay credit without losing strict bindings', () => {
  const input = buildInput();
  const retainedBrowser = structuredClone(input.browser);
  assert.deepEqual(buildAuthenticatedReviewerSelectionDiagnostic(input), valid());
  assert.deepEqual(input.browser, retainedBrowser);
  assert.notEqual(input.browser.actions[1].response.commandIdHash, null);
  assert.notEqual(input.browser.actions[1].response.receiptIdHash, null);
});

for (const [name, mutate] of [
  ['replay request', input => { input.browser.actions[1].requestIdHash = input.browser.actions[0].requestIdHash; }],
  ['replay command', input => {
    input.browser.actions[1].commandBindingHash = input.browser.actions[0].commandBindingHash;
  }],
  ['replay session', input => { input.browser.actions[1].sessionHash = h('0'); }],
  ['stale session', input => { input.browser.actions[2].sessionHash = h('0'); }],
  ['replay receipt', input => { input.browser.actions[1].response.receiptIdHash = h('0'); }],
  ['missing replay response', input => { delete input.browser.actions[1].response; }],
  ['assignment proof origin', input => { input.trustedActionProofs[0].receiptOriginRequestIdHash = h('0'); }],
  ['replay proof origin', input => { input.trustedActionProofs[1].receiptOriginRequestIdHash = h('0'); }],
  ['semantic request proof', input => { input.trustedActionProofs[1].semanticRequestHash = h('0'); }],
  ['idempotency proof', input => { input.trustedActionProofs[1].idempotencyKeyHash = h('0'); }],
  ['semantic envelope proof', input => { input.trustedActionProofs[1].semanticEnvelopeHash = h('0'); }],
  ['invalid proof hash', input => { input.trustedActionProofs[1].semanticEnvelopeHash = 'sha256:no'; }],
  ['extra proof field', input => { input.trustedActionProofs[1].extra = h('0'); }],
  ['stale request matching replay', input => {
    input.browser.actions[2].requestIdHash = input.browser.actions[1].requestIdHash;
  }],
  ['stale command matching replay', input => {
    input.browser.actions[2].commandBindingHash = input.browser.actions[1].commandBindingHash;
  }],
  ['stale persisted identifiers', input => { input.browser.actions[2].response.commandIdHash = h('0'); }],
  ['unexpected domain source', input => { input.server.after.records[0].source = 'assess_v2_review_resolutions'; }],
  ['missing final row', input => { input.server.after.records.pop(); }],
  ['changed retained row', input => { input.trustedActionFrames[2].after.records[0].rowHash = h('0'); }],
  ['replay row deletion', input => { input.trustedActionFrames[1].after.records.pop(); }],
  ['stale row insertion', input => {
    input.trustedActionFrames[2].after.records.push({
      ...input.trustedActionFrames[0].after.records[0], recordHash: h('0'), rowHash: h('1'),
    });
  }],
  ['conflicting complete anchor', input => {
    const source=input.trustedActionFrames[0].after.records[0];
    const target=input.trustedActionFrames[2].after.records[0];
    for(const field of ['actorHash','sessionHash','requestIdHash','persistedRequestHash','commandBindingHash',
      'commandIdHash','receiptIdHash','auditIdHash'])target[field]=source[field];
    target.requestIdHash=h('0');
  }],
]) test(`rejects mismatched ${name}`, () => {
  const input = buildInput();
  mutate(input);
  assert.throws(() => buildAuthenticatedReviewerSelectionDiagnostic(input));
});

for (const [name, mutate] of [
  ['wrong mode', value => { value.mode = 'full_acceptance'; }],
  ['wrong project', value => { value.scope.project = 'pixel-7-chromium'; }],
  ['extra action', value => { value.actions.extra = {}; }],
  ['wrong replay', value => { value.actions.replay.classification = 'COMMITTED'; }],
  ['wrong stale status', value => { value.actions.stale.status = 200; }],
  ['wrong stale classification', value => { value.actions.stale.classification = 'STALE_VERSION'; }],
  ['binding mismatch', value => { value.actions.bindings.assignmentReplayReceiptEqual = false; }],
  ['extra effect', value => { value.effects.otherWrites = 1; }],
  ['provider enabled', value => { value.providers.enabled = true; }],
  ['promotion', value => { value.acceptancePromoted = true; }],
  ['incomplete', value => { value.diagnosticCompleted = false; }],
  ['cleanup incomplete', value => { value.cleanup.status = 'failed'; }],
  ['private field', value => { value.accessToken = 'must-not-escape'; }],
]) test(`rejects ${name}`, () => {
  const input = valid();
  mutate(input);
  assert.throws(() => validateAuthenticatedReviewerSelectionDiagnostic(input),
    /AUTHENTICATED_REVIEWER_SELECTION_DIAGNOSTIC_/u);
});
