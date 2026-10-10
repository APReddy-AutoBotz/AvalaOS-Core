import assert from 'node:assert/strict';
import test from 'node:test';
import { AUTHENTICATED_CONTROL_CASE_IDS, createAuthenticatedControlFrame, validateAuthenticatedControlFrames } from './authenticatedControlsAcceptance.mjs';

const frame = testId => createAuthenticatedControlFrame({
  testId, releaseSha: 'working-tree', sourceBinding: 'local-authenticated-controls-v1',
  measured: (() => {
    const before = Object.fromEntries(['logicalMutations','domainWrites','receiptWrites','auditWrites','secretWrites','storageWrites','providerCalls','paidCalls','providerTokens','budgetDebits','foreignWrites'].map(name => [name, 4]));
    const after = { ...before };
    if (testId === 'AI-004') for (const name of ['logicalMutations','domainWrites','receiptWrites','auditWrites','secretWrites']) after[name] += 1;
    return { before, after, beforeState: { rows: 4 }, afterState: { rows: testId === 'AI-004' ? 5 : 4 } };
  })(),
  assertionResults: Object.fromEntries((testId === 'AI-004'
    ? ['synthetic-secret-command-committed', 'configuration-receipt-audit-exact', 'secret-absent-from-browser-and-response']
    : []).map(id => [id, 'PASS'])),
  api: { executed: true }, cleanup: { attempted: true, succeeded: true },
});

test('local authenticated control frames keep hosted proof false and exact AI-004 effects', () => {
  const frames = AUTHENTICATED_CONTROL_CASE_IDS.map(frame);
  assert.deepEqual(validateAuthenticatedControlFrames(frames), []);
  const secret = frames.find(item => item.testId === 'AI-004');
  assert.equal(secret.status, 'PASS');
  assert.equal(secret.measurements.delta.logicalMutations, 1);
  assert.equal(secret.measurements.delta.receiptWrites, 1);
  assert.equal(secret.measurements.delta.auditWrites, 1);
  assert.equal(secret.measurements.delta.secretWrites, 1);
  assert.equal(secret.measurements.delta.providerCalls, 0);
  assert.equal(secret.controls.hostedRequirementSatisfied, false);
});

test('evidence rejects secret/reference field names and non-AI mutations', () => {
  const secretLeak = frame('AI-004');
  secretLeak.observations.api = { secretReference: 'forbidden' };
  assert.match(validateAuthenticatedControlFrames([secretLeak]).join(','), /sensitive-evidence/u);
  const admin = frame('ADMIN-003');
  admin.measurements.delta.domainWrites = 1;
  assert.match(validateAuthenticatedControlFrames([admin]).join(','), /zero-effects/u);
});

test('missing or mismatched measurements block requested PASS assertions', () => {
  const missing = createAuthenticatedControlFrame({ testId: 'AI-004', releaseSha: 'working-tree',
    sourceBinding: 'local-authenticated-controls-v1', assertionResults: {
      'synthetic-secret-command-committed': 'PASS', 'configuration-receipt-audit-exact': 'PASS',
      'secret-absent-from-browser-and-response': 'PASS',
    } });
  assert.equal(missing.status, 'BLOCKED');
  assert.equal(missing.proofMode, 'not-run');
  assert.equal(missing.measurements, null);
  const mismatched = frame('AI-004');
  mismatched.measurements.afterCounters.receiptWrites += 1;
  mismatched.measurements.delta.receiptWrites += 1;
  assert.match(validateAuthenticatedControlFrames([mismatched]).join(','), /ai004-effects/u);
});

