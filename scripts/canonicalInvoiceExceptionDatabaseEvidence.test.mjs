import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalDatabaseEvidencePassed } from './canonicalInvoiceExceptionDatabaseEvidence.mjs';

test('canonical evidence cannot pass missing lineage, duplicate effects or provider activity', () => {
  const valid = { baselineCount: 1, exactApprovedPackage: true, exactEditedStudioVersion: true,
    exactAssessGovernAncestry: true, singleHandoffConsumption: true, independentPackageApproval: true,
    exactAcceptedItemVersions: true, readOnlyMonitorTruth: true, singleBaselineEffect: true,
    providersOff: true, noProviderEgress: true };
  assert.equal(canonicalDatabaseEvidencePassed(valid), true);
  assert.equal(canonicalDatabaseEvidencePassed(null), false);
  for (const key of Object.keys(valid)) {
    const missing = { ...valid }; delete missing[key];
    assert.equal(canonicalDatabaseEvidencePassed(missing), false, key);
    assert.equal(canonicalDatabaseEvidencePassed({ ...valid, [key]: key === 'baselineCount' ? 2 : false }), false, key);
  }
});
