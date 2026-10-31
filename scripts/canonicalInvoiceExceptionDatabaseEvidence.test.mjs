import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalDatabaseEvidencePassed,canonicalDatabaseLineageEvidencePassed,
  readCanonicalInvoiceExceptionLineageEvidence } from './canonicalInvoiceExceptionDatabaseEvidence.mjs';

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

test('shared canonical lineage reader keeps selectors in SQL and returns only bounded measurements', async () => {
  const selector={organizationId:'11111111-1111-4111-8111-111111111111',
    workspaceId:'22222222-2222-4222-8222-222222222222',processId:'33333333-3333-4333-8333-333333333333'};
  const lineage={baselineCount:1,exactApprovedPackage:true,exactEditedStudioVersion:true,
    exactAssessGovernAncestry:true,singleHandoffConsumption:true,independentPackageApproval:true,
    exactAcceptedItemVersions:true,readOnlyMonitorTruth:true,singleBaselineEffect:true};
  const calls=[];
  const evidence=await readCanonicalInvoiceExceptionLineageEvidence(async(sql,params=[])=>{
    calls.push({sql,params});
    if(sql.includes('FROM public.enterprise_monitor_baselines'))return {rows:[lineage]};
    if(sql.includes('studio_artifact_runtime_control'))return {rows:[{providersOff:true}]};
    throw new Error('unexpected query');
  },selector);
  assert.deepEqual(evidence,{...lineage,providersOff:true});
  assert.equal(canonicalDatabaseLineageEvidencePassed(evidence),true);
  assert.deepEqual(calls[0].params,Object.values(selector));
  assert.deepEqual(calls[1].params,[]);
  assert.equal(Object.hasOwn(evidence,'noProviderEgress'),false);
  await assert.rejects(readCanonicalInvoiceExceptionLineageEvidence(async()=>({rows:[]}),
    {...selector,processId:'not-a-uuid'}),/CANONICAL_PROCESS_BINDING_MISSING/u);
});
