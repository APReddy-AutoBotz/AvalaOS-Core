import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  AUTHENTICATED_GOVERN_STUDIO_ACTION_CONTRACT,
  AUTHENTICATED_GOVERN_STUDIO_CASE_IDS,
  AUTHENTICATED_GOVERN_STUDIO_TARGET_CASE_IDS,
  buildAuthenticatedGovernStudioDiagnostic,
  validateAuthenticatedGovernStudioDiagnostic,
} from './authenticatedGovernStudioDiagnostic.mjs';

const D = seed => `sha256:${createHash('sha256').update(seed).digest('hex')}`;
const record = (source, seed) => ({ source, recordHash: D(seed), rowHash: D(seed === 'a' ? 'b' : 'a'), active: true });
const frame = (index, records = []) => ({ capturedAt: `2026-10-24T00:00:${String(index).padStart(2, '0')}.000Z`, records });
const actions = () => AUTHENTICATED_GOVERN_STUDIO_ACTION_CONTRACT.map((contract, index) => {
  let beforeRecords = [];
  let afterRecords = [];
  if (contract.key === 'approverGovernResolution') {
    const sources = ['assess_command_receipts', 'assess_v2_cases', 'assess_v2_govern_resolutions', 'privileged_audit_events'];
    afterRecords = sources.map((source, sourceIndex) => record(source, String.fromCharCode(97 + sourceIndex)));
  }
  return {
    actionId: D(String.fromCharCode(97 + index)), complete: true, commandType: contract.commandType,
    persona: contract.persona, status: contract.status, requestIdHash: D('e'), commandBindingHash: D('f'),
    response: { status: contract.status,
      classification: contract.key === 'reviewerGovernDenial' ? 'PERMISSION_DENIED' : 'COMMITTED' },
    before: frame(index * 2, beforeRecords), after: frame(index * 2 + 1, afterRecords),
  };
});
const lineage = () => ({
  schemaVersion: 'authenticated-govern-studio-lineage-v1', verified: true,
  reviewerGovernCapabilityAbsent: true, approverGovernCapabilityPresent: true,
  approvedReviewCount: 1, governResolutionCount: 1, studioHandoffCount: 1,
  moduleHandoffCount: 1, studioSourcePackageCount: 1,
  sameScope: true, sameCase: true, sameDecision: true, sameReviewResolution: true,
  sameGovernResolution: true, sameAssessHandoff: true, sameModuleHandoff: true, sameSourcePackage: true,
  expectedCaseVersionAdvanced: true, governCaseWrites: 1, governResolutionWrites: 1,
  governReceiptWrites: 1, governAuditWrites: 1, governOtherWrites: 0,
  providerCalls: 0, paidCalls: 0, lineageDigest: D('a'),
});
const targetProofRows = () => AUTHENTICATED_GOVERN_STUDIO_TARGET_CASE_IDS.map(testId => ({
  testId,
  observations: { browser: { result: testId === 'GOVERN-005'
    ? { independentApprovalCommitted: true, approvedCurrentVersionVisible: true }
    : testId === 'GOVERN-007'
      ? { reviewerControlDisabled: true, exactCurrentScope: true, exactCurrentVersion: true,
        requestBindingDigest: D('b'), separationDenialZeroEffects: true, independentResolutionCommitted: true }
      : { approvedHandoffConsumed: true, exactSourceAncestryVisible: true } } },
}));
const input = () => ({
  source: { releaseSha: 'a'.repeat(40), runId: '42', attempt: '1', sourceDigest: D('c') },
  browserCases: AUTHENTICATED_GOVERN_STUDIO_CASE_IDS.map(testId => ({ testId, project: 'desktop-chromium' })),
  serverCases: AUTHENTICATED_GOVERN_STUDIO_CASE_IDS.map(testId => ({ testId, project: 'desktop-chromium' })),
  targetProofRows: targetProofRows(), trustedActions: actions(), trustedLineage: lineage(),
  cleanup: { status: 'verified' },
});

test('builds bounded non-promoting Govern and Studio diagnostic evidence', () => {
  const result = buildAuthenticatedGovernStudioDiagnostic(input());
  assert.equal(result.schemaVersion, 'authenticated-govern-studio-diagnostic-v1');
  assert.equal(result.inventory.totalCaseCount, 16);
  assert.equal(result.actions.count, 8);
  assert.equal(result.govern.denialStatus, 403);
  assert.equal(result.policy.actorLimitMs, 15_000);
  assert.equal(result.acceptancePromoted, false);
  assert.equal(result.fullAcceptanceExecuted, false);
  assert.equal(result.providerGenerationExecuted, false);
  assert.deepEqual(validateAuthenticatedGovernStudioDiagnostic(result), result);
  assert.doesNotMatch(JSON.stringify(result), /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}/iu);
});

for (const [name, mutate, code] of [
  ['wrong inventory', value => { value.browserCases.pop(); }, 'CASE_INVENTORY_REJECTED'],
  ['wrong action order', value => { [value.trustedActions[0], value.trustedActions[1]] = [value.trustedActions[1], value.trustedActions[0]]; }, 'ACTION_REJECTED'],
  ['wrong persona', value => { value.trustedActions[1].persona = 'approver'; }, 'ACTION_REJECTED'],
  ['wrong denial status', value => { value.trustedActions[1].status = 200; value.trustedActions[1].response.status = 200; }, 'ACTION_REJECTED'],
  ['unexpected success classification', value => { value.trustedActions[0].response.classification = 'SUCCEEDED'; }, 'ACTION_REJECTED'],
  ['denial effect', value => { value.trustedActions[1].after.records.push(record('assess_v2_cases', 'f')); }, 'REVIEWER_DENIAL_REJECTED'],
  ['missing govern receipt', value => { value.trustedActions[2].after.records.splice(0, 1); }, 'GOVERN_EFFECTS_REJECTED'],
  ['broken lineage', value => { value.trustedLineage.sameCase = false; }, 'LINEAGE_REJECTED'],
  ['provider call', value => { value.trustedLineage.providerCalls = 1; }, 'LINEAGE_REJECTED'],
  ['unsafe target proof', value => { value.targetProofRows[0].unsafe = 'https://invalid.example'; }, 'UNSAFE_OUTPUT_REJECTED'],
  ['missing approval fact', value => { delete value.targetProofRows[0].observations.browser.result.independentApprovalCommitted; }, 'BROWSER_GOVERN_PROOF_REJECTED'],
  ['missing Studio lineage fact', value => { delete value.targetProofRows[2].observations.browser.result.exactSourceAncestryVisible; }, 'BROWSER_STUDIO_PROOF_REJECTED'],
  ['missing cleanup', value => { value.cleanup.status = 'incomplete'; }, 'CLEANUP_REJECTED'],
]) test(`rejects ${name}`, () => {
  const value = structuredClone(input()); mutate(value);
  assert.throws(() => buildAuthenticatedGovernStudioDiagnostic(value), new RegExp(code, 'u'));
});

test('validator rejects attempted acceptance promotion', () => {
  const value = structuredClone(buildAuthenticatedGovernStudioDiagnostic(input()));
  value.acceptancePromoted = true;
  assert.equal(validateAuthenticatedGovernStudioDiagnostic(value), null);
});

for (const [name, mutate] of [
  ['unexpected source field', value => { value.source.url = 'omitted'; }],
  ['substituted prerequisite inventory', value => { value.inventory.prerequisiteCaseIds[0] = 'GOVERN-999'; }],
  ['reordered action contract', value => {
    [value.actions.ordered[0], value.actions.ordered[1]] = [value.actions.ordered[1], value.actions.ordered[0]];
  }],
  ['mutated action persona', value => { value.actions.ordered[1].persona = 'approver'; }],
  ['mutated action status', value => { value.actions.ordered[7].status = 200; }],
  ['mutated action classification', value => { value.actions.ordered[0].classification = 'SUCCEEDED'; }],
  ['duplicate action digest', value => { value.actions.ordered[1].actionDigest = value.actions.ordered[0].actionDigest; }],
  ['mutated Govern write delta', value => { value.govern.auditWrites = 0; }],
  ['unexpected cleanup field', value => { value.cleanup.residue = 0; }],
]) test(`validator rejects ${name}`, () => {
  const value = structuredClone(buildAuthenticatedGovernStudioDiagnostic(input()));
  mutate(value);
  assert.equal(validateAuthenticatedGovernStudioDiagnostic(value), null);
});
