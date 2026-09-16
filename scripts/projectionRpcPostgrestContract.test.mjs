import assert from 'node:assert/strict';
import {test} from 'node:test';
import {projectionRpcHttpUrl,assertProjectionRpcResult,PROJECTION_RPC_NAMES,PROJECTION_INTENTIONAL_IDENTITY_ADVANCE,PROJECTION_MIGRATION_REJECTION_CASES,selectProjectionNoSideEffectTables,selectProjectionRpcSubnet} from './projectionRpcPostgrestContract.mjs';
test('isolated subnet selection excludes Docker and host routes and fails closed on exhaustion or invalid data',()=>{
  assert.equal(selectProjectionRpcSubnet(['0.0.0.0/0','172.17.0.0/16','10.249.240.1/32']), '10.249.241.0/28');
  for (const prefixes of [['10.0.0.0/8'],['10.249.240.0/20'],['invalid'],['999.1.1.1/24'],['10.0.0.0/33']]) assert.throws(()=>selectProjectionRpcSubnet(prefixes));
  assert.equal(selectProjectionRpcSubnet(['10.249.240.16/28']), '10.249.240.0/28');
});
test('projection RPC runner cannot target remote infrastructure, another RPC or a mutating HTTP method',()=>{
  for(const origin of ['https://example.invalid','http://localhost:3000','http://127.0.0.1','http://user:pass@127.0.0.1:3000','http://127.0.0.1:3000/path','http://127.0.0.1:3000/?scope=x'])assert.throws(()=>projectionRpcHttpUrl(origin,PROJECTION_RPC_NAMES[0],'POST',{}));
  assert.throws(()=>projectionRpcHttpUrl('http://127.0.0.1:3000','enterprise_delivery_monitor_command','POST',{}));
  for(const method of ['PUT','DELETE','PATCH'])assert.throws(()=>projectionRpcHttpUrl('http://127.0.0.1:3000',PROJECTION_RPC_NAMES[0],method,{}));
  assert.equal(projectionRpcHttpUrl('http://127.0.0.1:3000',PROJECTION_RPC_NAMES[0],'POST',{}).pathname,'/rpc/'+PROJECTION_RPC_NAMES[0]);
});
test('projection evidence rejects wrong scope, wrong contract, null success and mutable Monitor claims',()=>{
  const scope={organizationId:'org',workspaceId:'workspace'},value={...scope,contractVersion:'enterprise-monitor-approved-baselines-2',readOnly:true,liveTelemetryConnected:false,actions:[]};
  assertProjectionRpcResult(value,PROJECTION_RPC_NAMES[1],scope);
  for(const change of [{organizationId:'foreign'},{workspaceId:'foreign'},{contractVersion:'fake'},{readOnly:false},{liveTelemetryConnected:true},{actions:['execute']}])assert.throws(()=>assertProjectionRpcResult({...value,...change},PROJECTION_RPC_NAMES[1],scope));
  assert.throws(()=>assertProjectionRpcResult(null,PROJECTION_RPC_NAMES[1],scope));
});
test('no-side-effect inventory includes core authority and process creation tables but excludes the intentional marker advance',()=>{
  const core=['profiles','organizations','workspaces','organization_members','workspace_memberships','roles','capabilities','role_capabilities','authorization_versions','process_creation_workspace_controls','process_creation_template_registry'];
  const selected=selectProjectionNoSideEffectTables([...core,'enterprise_jobs','assess_processes','studio_artifacts','synthetic_admin_targets','audit_events','privileged_audit_events',PROJECTION_INTENTIONAL_IDENTITY_ADVANCE]);
  for(const name of core)assert.ok(selected.includes(name));
  assert.ok(selected.includes('enterprise_jobs'));assert.ok(selected.includes('assess_processes'));
  assert.ok(!selected.includes(PROJECTION_INTENTIONAL_IDENTITY_ADVANCE));
  assert.throws(()=>selectProjectionNoSideEffectTables(core.slice(1)));
  assert.throws(()=>selectProjectionNoSideEffectTables([...core,'roles']));
  assert.throws(()=>selectProjectionNoSideEffectTables([...core,'unsafe-name;drop table']));
});
test('real migration rejection inventory covers cardinality, predecessor constraint, stale and ahead tips, and all unsafe flags',()=>{
  assert.equal(PROJECTION_MIGRATION_REJECTION_CASES.length,16);
  for(const name of ['projection-missing-marker','projection-duplicate-marker','projection-missing-predecessor-constraint','projection-stale-marker','projection-ahead-marker','projection-unsafe-production_authorized','projection-unsafe-customer_data_authorized','projection-unsafe-real_provider_calls_authorized'])assert.ok(PROJECTION_MIGRATION_REJECTION_CASES.includes(name));
  assert.equal(new Set(PROJECTION_MIGRATION_REJECTION_CASES).size,16);
});
