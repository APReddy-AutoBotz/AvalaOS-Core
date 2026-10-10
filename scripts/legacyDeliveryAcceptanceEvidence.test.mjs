import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildLegacyDeliveryAcceptanceProducer,
  validateLegacyDeliveryAcceptanceProducer,
} from './legacyDeliveryAcceptanceEvidence.mjs';

// Validator-only synthetic measurements. These are never emitted as execution evidence.
const actualByTestId = {
  'DELIVERY-007': {
    logicalMutationCount: 1, itemDelta: 2, importDelta: 1, receiptDelta: 1, auditDelta: 1,
    exactReplay: true, replayEffectDelta: 0, freshKeyDuplicateDenied: true,
    duplicateEffectDelta: 0, changedPayloadConflict: true, sourceDriftDenied: true,
    serverLineageBound: true, foreignTenantDenied: true, nonServiceDenied: true, deniedEffectDelta: 0,
  },
  'DELIVERY-008': {
    logicalMutationCount: 1, taskDelta: 0, versionDelta: 1, retentionTransition: true,
    receiptDelta: 1, auditDelta: 1, hardDeleteDenied: true, physicalDeleteDelta: 0,
    lineageUnchanged: true, retainedQueryVisible: true, foreignTenantDenied: true,
    nonServiceDenied: true, deniedEffectDelta: 0,
  },
};
const identity = {
  releaseSha: 'a'.repeat(40), workflowRunId: '123', workflowAttempt: '1',
  environment: 'ci-disposable-postgres', workflowPath: '.github/workflows/exhaustive-acceptance.yml',
};
const command = 'node scripts/legacyDeliveryAuthorityPostgres.mjs';
const build = (options = {}) => buildLegacyDeliveryAcceptanceProducer({
  actualByTestId, identity, command, cleanupVerified: true, ...options,
});
const validate = emitted => validateLegacyDeliveryAcceptanceProducer({ emitted, identity, command });

test('rejects an aggregate success without both exact legacy task results', () => {
  assert.ok(validate({ schemaVersion: 2, results: [] }).length);
  const valid = build();
  assert.deepEqual(validate(valid), []);
  valid.results.pop();
  assert.ok(validate(valid).length);
  const duplicate = build();
  duplicate.results[1] = structuredClone(duplicate.results[0]);
  assert.ok(validate(duplicate).length);
});

test('every missing/changed measured invariant prevents a case PASS', () => {
  for (const [testId, actual] of Object.entries(actualByTestId)) {
    for (const [field, value] of Object.entries(actual)) {
      for (const remove of [false, true]) {
        const tampered = structuredClone(build());
        const result = tampered.results.find(item => item.testId === testId);
        if (remove) delete result.actual[field];
        else result.actual[field] = typeof value === 'boolean' ? !value : value + 1;
        assert.ok(validate(tampered).length, `${testId}:${field}:${remove}`);
      }
    }
  }
});

test('rejects different source, scope, command, execution identity and cleanup', () => {
  const mutations = [
    result => { result.releaseSha = 'b'.repeat(40); },
    result => { result.workflowRunId = '124'; },
    result => { result.workflowAttempt = '2'; },
    result => { result.workflowPath = '.github/workflows/another.yml'; },
    result => { result.environment = 'hosted_sandbox'; },
    result => { result.command = 'node unrelated.mjs'; },
    result => { result.scope.organizationId = 'a2000000-0000-4000-8000-000000000099'; },
    result => { result.sourceReferences.pop(); },
    result => { result.sourceDigests[result.sourceReferences[0]] = '0'.repeat(64); },
    result => { result.branchIds = ['DELIVERY-PACKAGE_REPLAY']; },
    result => { result.assertionIds = ['pr-c::duplicate-package']; },
    result => { result.cleanupVerified = false; },
  ];
  for (const mutate of mutations) {
    const tampered = structuredClone(build());
    mutate(tampered.results[0]);
    assert.ok(validate(tampered).length);
  }
});

test('records a real assertion failure or setup block without promoting it', () => {
  for (const [status, field, failureCode] of [
    ['FAIL', 'failuresByTestId', 'assertion_failed'],
    ['BLOCKED', 'blockedByTestId', 'setup_failed'],
  ]) {
    const measured = structuredClone(actualByTestId);
    delete measured['DELIVERY-008'];
    const result = build({ actualByTestId: measured, [field]: { 'DELIVERY-008': { failureCode } } });
    assert.deepEqual(validate(result), []);
    assert.equal(result.results[1].status, status);
    assert.equal(result.results[1].actual, null);
    result.results[1].status = 'PASS';
    assert.ok(validate(result).length);
  }
  assert.throws(() => build({ cleanupVerified: false }), /cleanup/);
  assert.throws(() => build({ actualByTestId: {} }), /result-set|missing/);
});
