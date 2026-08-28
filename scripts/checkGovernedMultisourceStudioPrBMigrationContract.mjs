import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';

const migrationName='20260828120000_governed_multisource_studio_pr_b.sql';
const migrationPath=`supabase/migrations/${migrationName}`;
const sql=readFileSync(migrationPath,'utf8');
const studioAdapterPath='supabase/functions/_shared/studioArtifactDb.ts';
const studioAdapter=readFileSync(studioAdapterPath,'utf8');
const migrations=readdirSync('supabase/migrations').filter(name=>name.endsWith('.sql')).sort();
const prior='20260827173000_governed_transcript_hosted_identity_convergence.sql';

const functionBody=name=>{
  const start=sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  assert.notEqual(start,-1,`missing ${name}`);
  const end=sql.indexOf('\n$$;',start);
  assert.notEqual(end,-1,`unterminated ${name}`);
  return sql.slice(start,end+4);
};

const functionParameterNames=name=>{
  const body=functionBody(name);
  const open=body.indexOf('(');
  const terminator=/\)\s+RETURNS\b/u.exec(body.slice(open));
  assert.ok(terminator,`missing ${name} parameter terminator`);
  const close=open+terminator.index;
  return body.slice(open+1,close).split(',').map(parameter=>parameter.trim().split(/\s+/u)[0]);
};

const adapterRpcArgumentNames=rpcConstant=>{
  const call=`STUDIO_RPC.${rpcConstant}, {`;
  const start=studioAdapter.indexOf(call);
  assert.notEqual(start,-1,`missing ${rpcConstant} adapter call`);
  const open=studioAdapter.indexOf('{',start+call.length-1);
  let depth=0;
  let close=-1;
  for(let index=open;index<studioAdapter.length;index+=1){
    if(studioAdapter[index]==='{')depth+=1;
    else if(studioAdapter[index]==='}'){
      depth-=1;
      if(depth===0){close=index;break;}
    }
  }
  assert.notEqual(close,-1,`unterminated ${rpcConstant} adapter argument map`);
  return [...studioAdapter.slice(open+1,close).matchAll(/\b(p_[a-z0-9_]+)\s*:/gu)].map(match=>match[1]);
};

const marker=(testId,assertionId,lineage)=>console.log(`PR_B_ASSERTION ${JSON.stringify({
  testId,assertionId,fixture:'pr-b-migration-sql-contract',result:'passed',runtimeContext:{
    persona:{id:'synthetic-static-migration-reviewer',state:'active',capabilities:[]},
    organizationId:'synthetic-org-static',workspaceId:'synthetic-workspace-static',lineage,
  },
})}`);

assert.equal(migrations.filter(name=>name===migrationName).length,1);
assert.ok(migrations.indexOf(migrationName)>migrations.indexOf(prior),'PR B migration must sort after PR A tip');
assert.match(sql,/SET migration_tip = '20260828120000'/);
assert.match(sql,/CHECK \(migration_tip = '20260828120000'\)/);
assert.match(sql,/STUDIO_PR_B_BACKFILL_REVIEW_REQUIRED/);
assert.ok(sql.indexOf('DO $$')<sql.indexOf('INSERT INTO public.capabilities'),'dirty ancestry preflight must precede first mutation');
for(const flag of ['studio_multisource_enabled','studio_tenant_templates_enabled','module_handoffs_enabled','direct_studio_planning_enabled']){
  assert.match(sql,new RegExp(`ADD COLUMN ${flag} boolean NOT NULL DEFAULT false`));
}
marker('ROLLBACK-PRB-001','DEFAULT-OFF-READONLY',{
  migration:migrationName,migrationTip:'20260828120000',sourcePackage:null,template:null,handoff:null,artifact:null,
  flags:['direct_studio_planning_enabled','module_handoffs_enabled','studio_multisource_enabled','studio_tenant_templates_enabled'],
});

for(const token of [
  "source_mode IN('assess_handoff','direct_transcript_bundle','assess_plus_transcript_bundle','manual_brief')",
  "source_mode='direct_transcript_bundle'", "lineage_classification='not_assessed' AND planning_only",
  'studio_artifact_source_package_fk','studio_generation_source_package_fk','studio_version_source_package_fk',
  'studio_generation_template_union_check','studio_version_template_union_check','studio_one_version_per_generation_attempt',
  'studio_tenant_template_review_events','studio_tenant_template_approval_events','STUDIO_SEPARATION_OF_DUTY',
]) assert.ok(sql.includes(token),`missing ${token}`);
assert.doesNotMatch(sql,/ALTER TABLE public\.document_generations/);
const legacyBackfill=sql.indexOf('UPDATE public.studio_artifact_versions version');
const disableLegacyTrigger=sql.indexOf('ALTER TABLE public.studio_artifact_versions DISABLE TRIGGER trg_studio_artifact_version_content_immutable');
const enableLegacyTrigger=sql.indexOf('ALTER TABLE public.studio_artifact_versions ENABLE TRIGGER trg_studio_artifact_version_content_immutable');
assert.ok(disableLegacyTrigger>0&&disableLegacyTrigger<legacyBackfill&&enableLegacyTrigger>legacyBackfill,'legacy additive binding backfill must restore the exact immutability trigger');
const templateProjection=functionBody('studio_tenant_template_projection');
for(const field of ["'ownership'","'templateId'","'templateVersionId'","'version'","'name'","'description'","'artifactClass'","'lifecycle'","'templateHash'","'rendererVersion'","'contentSchemaVersion'","'sections'","'replacement'","'actions'"])assert.ok(templateProjection.includes(field),`template projection missing ${field}`);
assert.match(templateProjection,/'version',system\.template_version/);
assert.match(templateProjection,/'version',version\.version/);
assert.doesNotMatch(templateProjection,/provider_instructions|providerInstructions/);
assert.match(templateProjection,/public\.has_workspace_capability\(p_workspace,p_org,'studio\.templates\.approve'\)/);
assert.match(templateProjection,/public\.has_workspace_capability\(p_workspace,p_org,'studio\.artifacts\.generate'\)/);
const templateCommand=functionBody('studio_tenant_template_command');
assert.match(templateCommand,/WHEN 'studio\.template\.replace' THEN 'studio\.templates\.approve'/);
assert.match(templateCommand,/payload-ARRAY\['templateId','templateVersionId'\]/);
assert.match(templateCommand,/payload->>'templateVersionId' IS DISTINCT FROM aggregate\.current_version_id::text/);
marker('CONTRACT-PRB-001','DTO-RPC-PARITY',{
  migration:migrationName,sourcePackage:{modes:['assess_handoff','assess_plus_transcript_bundle','direct_transcript_bundle','manual_brief']},
  template:{kinds:['system','tenant'],projection:'unified_safe_union',systemVersionType:'string',tenantVersionType:'positive_integer',serverDerivedActions:true,replacement:true},handoff:{edge:'assess_to_studio'},artifact:{generationLifecycle:'request_claim_stage_finalize_v2'},
});

const sourcePackageCreate=functionBody('studio_artifact_source_package_create');
assert.match(sourcePackageCreate,/p_command\?&ARRAY\['actorId','organizationId','workspaceId','artifactId','sourcePackageId','requestId','idempotencyKey','authorizationVersion','payload'\]/);
assert.match(sourcePackageCreate,/payload-ARRAY\['sourceMode','artifactType','studioInputBundleId','studioInputBundleVersionId','studioInputBundleVersion','manualBrief'\]/);
assert.doesNotMatch(sourcePackageCreate,/payload->>'manualBriefHash'/);
assert.match(sourcePackageCreate,/manual_brief_hash:=encode\(public\.digest\(convert_to\(payload->>'manualBrief','UTF8'\),'sha256'\),'hex'\)/);
assert.match(sourcePackageCreate,/command_type='studio\.source-package\.create'/);
assert.doesNotMatch(sourcePackageCreate,/studio\.artifact\.source-package\.create|STUDIO_IDEMPOTENCY_CONFLICT/);
assert.match(sourcePackageCreate,/RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'/);
assert.ok(sourcePackageCreate.indexOf('pr1b_assert_command_authority')<sourcePackageCreate.indexOf('SELECT * INTO receipt'));
const manualRetrieve=functionBody('studio_artifact_manual_brief_material_retrieve');
assert.match(manualRetrieve,/JOIN public\.studio_artifact_source_packages package[\s\S]*package\.artifact_id=material\.artifact_id[\s\S]*package\.org_id=material\.org_id AND package\.workspace_id=material\.workspace_id/);
assert.match(manualRetrieve,/package\.source_mode='manual_brief'/);
assert.match(sql,/REVOKE ALL ON FUNCTION public\.studio_artifact_manual_brief_material_retrieve\(uuid,uuid,uuid\) FROM PUBLIC,anon,authenticated,service_role;/);
assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.studio_artifact_manual_brief_material_retrieve\(uuid,uuid,uuid\) TO service_role;/);
const sourceProjection=functionBody('studio_artifact_source_package_projection');
assert.doesNotMatch(sourceProjection,/'manualBrief'|'manualBriefHash'/);
for(const field of ["'artifactId'","'aggregateVersion'","'currentVersionId'","'currentApprovedVersionId'","'sourcePackageId'","'sourcePackageVersion'","'sourcePackageHash'","'sourceMode'","'lineageClassification'","'planningOnly'","'hasAssessAncestry'","'hasStudioTranscriptBundle'","'hasManualBrief'","'routePolicyVersion'","'createdAt'"]){
  assert.ok(sourceProjection.includes(field),`pre-generation source-package projection missing ${field}`);
}
assert.match(sourceProjection,/public\.has_workspace_capability\(p_workspace,p_org,'studio\.artifacts\.read'\)/);
assert.match(sourceProjection,/package\.id=artifact\.source_package_id AND package\.artifact_id=artifact\.id[\s\S]*package\.org_id=artifact\.org_id AND package\.workspace_id=artifact\.workspace_id/);
assert.doesNotMatch(sourceProjection,/provider|storage_path|original_filename/);
marker('SOURCEPKG-PRB-001','MANUAL-MATERIAL-SERVER-HASH-REPLAY-RECOVERY-CONTRACT',{
  migration:migrationName,sourcePackage:{mode:'manual_brief',rawInputAuthority:'service_only',serverHash:'sha256_utf8',receiptCommandType:'studio.source-package.create',idempotencyConflict:'IDEMPOTENCY_CONFLICT',forcedRls:true},
  template:null,handoff:null,artifact:{generationPlanPersistsRawMaterial:false,safeProjectionDisclosesRawMaterial:false},
});
marker('SOURCEPKG-PRB-001','PREGENERATION-SAFE-SELECTOR-CONTRACT',{
  migration:migrationName,sourcePackage:{projection:'tenant_bound_exact_pregeneration_selectors',versionAliasPreserved:true,rawMaterial:false},
  template:null,handoff:{consumeProjection:true},artifact:{aggregateVersion:true,currentVersionNullable:true,currentApprovedVersionNullable:true,capabilityScoped:true},
});

const handoff=functionBody('enterprise_assess_studio_handoff_command');
assert.match(handoff,/enterprise_assess_studio_route_policy\(\)/);
assert.match(handoff,/payload-ARRAY\['upstreamHandoffId','artifactType','targetInputBundleId','targetInputBundleVersion','targetInputBundleVersionId'\]/);
assert.doesNotMatch(handoff,/payload->'routePolicySnapshot'|payload->>'routePolicyVersion'/);
assert.match(handoff,/p_command-ARRAY\['actorId','organizationId','workspaceId','requestId','authorizationVersion','expectedVersion','idempotencyKey','commandType','handoffId','payload'\]/);
assert.ok(handoff.indexOf('pr1b_assert_command_authority')<handoff.indexOf('SELECT * INTO receipt'));
const consumeCaseLock=handoff.indexOf('SELECT * INTO assess_case FROM public.assess_v2_cases');
const consumeReload=handoff.indexOf('SELECT * INTO upstream FROM public.assess_v2_studio_handoffs',consumeCaseLock);
const consumeEffect=handoff.indexOf('INSERT INTO public.studio_artifact_aggregates',consumeReload);
assert.ok(consumeCaseLock>handoff.indexOf('SELECT * INTO handoff')&&consumeReload>consumeCaseLock&&consumeEffect>consumeReload,
  'consume must lock the exact Assess case, reload current upstream truth, then create Studio effects');
assert.match(handoff.slice(consumeCaseLock,consumeReload),/FOR UPDATE/);
assert.match(handoff.slice(consumeReload,consumeEffect),/studio_pr_b_upstream_handoff_is_current/);
const handoffProjection=functionBody('enterprise_assess_studio_handoff_projection');
for(const action of ['studio.handoff.review.resolve','studio.handoff.approval.resolve','studio.handoff.withdraw','studio.handoff.consume'])assert.ok(handoffProjection.includes(`'${action}'`),`handoff projection missing ${action}`);
for(const field of ["'handoffId'","'handoffVersionId'","'upstreamHandoffId'","'direction'","'lifecycle'","'version'","'expiresAt'","'eligibleHandoffs'"])assert.ok(handoffProjection.includes(field),`handoff projection missing ${field}`);
assert.match(handoffProjection,/JOIN public\.enterprise_module_handoff_versions version ON version\.handoff_id=handoff\.id AND version\.version=handoff\.current_version/);
assert.match(handoffProjection,/FROM public\.assess_v2_studio_handoffs upstream/);
assert.match(handoffProjection,/'studio\.handoff\.request'/);
assert.match(handoffProjection,/handoff\.expires_at<=statement_timestamp\(\)[\s\S]*THEN 'expired'/);
assert.doesNotMatch(handoffProjection,/upstream\.package|upstream_package_hash|target_package_hash|route_policy_snapshot/);
assert.match(handoffProjection,/flags\.module_handoffs_enabled/);
const routePolicy=functionBody('enterprise_assess_studio_route_policy');
assert.match(routePolicy,/'expiryPolicy','fixed_from_request','handoffTtlSeconds',604800/);
for(const operation of ["command_type IN('handoff.review.resolve','handoff.approval.resolve','handoff.consume')","RAISE EXCEPTION 'HANDOFF_EXPIRED'"])assert.ok(handoff.includes(operation),`handoff expiry guard missing ${operation}`);
marker('HANDOFF-POLICY-001','SERVER-DERIVED-ROUTE-POLICY',{
  migration:migrationName,sourcePackage:null,template:null,
  handoff:{edge:'assess_to_studio',policyVersion:1,clientPolicyAuthority:false,oneTimeConsumption:true,expiryPolicy:'fixed_from_request',ttlSeconds:604800},artifact:null,
});

const transcriptProjection=functionBody('enterprise_transcript_module_projection');
for(const field of ["'sourceVersions'","'sourceVersionId'","'characterCount'","'inputBundleVersionId'","'bundleHash'","'sourceSetId'","'sourceSetVersionId'","'sourceSetVersion'","'manifestHash'"])assert.ok(transcriptProjection.includes(field),`transcript module projection missing ${field}`);
assert.match(transcriptProjection,/version\.extraction_status='parsed'/);
assert.match(transcriptProjection,/source\.org_id=p_org AND source\.workspace_id=p_workspace/);
assert.doesNotMatch(transcriptProjection,/original_filename|storage_path|storage_bucket|extracted_text_hash'|content_hash/);

const artifactV2=functionBody('studio_artifact_projection_v2');
for(const field of ["'contractVersion'","'sourcePackage'","'template'","'sections'","'assessmentLabel'","'planningLabel'","'sourcePackageId'","'sourcePackageVersion'","'studioInputBundleVersionId'","'manualBriefPresent'","'coverage'","'stale'"])assert.ok(artifactV2.includes(field),`artifact v2 projection missing ${field}`);
assert.match(artifactV2,/package\.lineage_classification='not_assessed'[\s\S]*THEN NULL/);
assert.match(artifactV2,/'sourceMode',package\.source_mode/);
assert.match(artifactV2,/current_version\.template_kind='system'/);
assert.match(artifactV2,/'ownership','tenant'/);
assert.match(artifactV2,/'ownership','system'/);
assert.match(artifactV2,/'sourceAnchors',CASE WHEN jsonb_typeof\(section\.value->'sourceAnchors'\)='array'/);
assert.doesNotMatch(artifactV2,/'anchors','\[\]'::jsonb/);
assert.match(artifactV2,/'sourceAnchors',CASE WHEN jsonb_typeof\(section\.value->'sourceAnchors'\)='array' THEN section\.value->'sourceAnchors'/,
  'artifact sections must project their validated canonical persisted anchors without display enrichment');
assert.match(artifactV2,/package\.source_mode='assess_plus_transcript_bundle'[\s\S]*count\(DISTINCT anchor->>'sourceVersionId'\)/,
  'hybrid artifact coverage must count distinct persisted canonical source-version identities');
assert.match(artifactV2,/package\.source_mode='manual_brief' THEN[\s\S]*selected_sources:=0/,
  'manual brief coverage must report zero immutable selected source identities');
const workspaceV2=functionBody('studio_artifact_workspace_projection_v2');
for(const field of ["'contractVersion','studio-workspace-2'","'sourcePackage'","'selectedSources'","'coverage'","'citations'","'conflicts'","'providerAvailability'","'actions'"]){
  assert.ok(workspaceV2.includes(field),`Studio workspace projection missing ${field}`);
}
assert.match(workspaceV2,/has_workspace_capability\(p_workspace,p_org,'studio\.artifacts\.read'\)/);
assert.doesNotMatch(workspaceV2,/'manualBrief'|'storagePath'|'keyRefId'|'endpointUrl'|'providerConfigId'/);
assert.match(workspaceV2,/WITH selected_raw AS/);
assert.match(workspaceV2,/SELECT DISTINCT ON\(source_version_id\)/,
  'hybrid Assess/transcript overlap must be deterministic and distinct');
assert.doesNotMatch(workspaceV2,/source\.deleted_at IS NULL/,
  'historical artifact projection must retain immutable soft-deleted package sources');
assert.match(workspaceV2,/control\.singleton IS NOT NULL AND control\.enabled AND NOT control\.read_only[\s\S]*studio\.artifacts\.edit/,
  'workspace mutation actions must be suppressed by disabled/read-only runtime control');
assert.doesNotMatch(artifactV2,/'manualBrief'|'manualBriefHash'|provider_instructions|storage_path|original_filename/);
assert.match(sql,/REVOKE ALL ON FUNCTION[\s\S]*public\.studio_artifact_projection_v2\(uuid,uuid,uuid\)[\s\S]*FROM PUBLIC,anon,authenticated,service_role;/);
assert.match(sql,/GRANT EXECUTE ON FUNCTION[\s\S]*public\.studio_artifact_projection_v2\(uuid,uuid,uuid\)[\s\S]*TO authenticated;/);
marker('CONTRACT-PRB-002','SAFE-PROJECTION-V2-PARITY',{
  migration:migrationName,sourcePackage:{projection:'exact_union_coverage_stale',rawManualBrief:false},
  template:{projection:'exact_system_tenant_identity_hash_actions',providerInstructions:false},
  handoff:{projection:'eligible_inbox_outbox_exact_version_expiry'},artifact:{contractVersion:'studio-artifact-2',truthfulDiscriminatedAncestry:true,legacyProjectionUnchanged:true},
});

const summaryV2=functionBody('studio_artifact_summary_projection_v2');
for(const field of ["'contractVersion','studio-artifact-summary-2'","'id'","'artifactType'","'aggregateVersion'","'lifecycle'","'currentVersionId'","'currentApprovedVersionId'","'sourceMode'","'lineageClassification'","'planningOnly'","'displayLabel'","'updatedAt'","'actions'","'total'","'offset'","'limit'","'hasMore'"]){
  assert.ok(summaryV2.includes(field),`artifact summary projection missing ${field}`);
}
assert.match(summaryV2,/has_workspace_capability\(p_workspace,p_org,'studio\.artifacts\.read'\)/);
assert.match(summaryV2,/SELECT \* INTO control FROM public\.studio_artifact_runtime_control WHERE singleton/);
assert.match(summaryV2,/can_edit:=control\.singleton IS NOT NULL AND control\.enabled AND NOT control\.read_only[\s\S]*studio\.artifacts\.edit/,
  'summary mutation actions must be suppressed by disabled/read-only runtime control');
assert.doesNotMatch(summaryV2,/'manualBrief'|'providerInstructions'|'storagePath'|'originalFilename'|'packageHash'|'anchorManifest'/);
assert.match(sql,/REVOKE ALL ON FUNCTION[\s\S]*public\.studio_artifact_summary_projection_v2\(uuid,uuid,integer,integer\)[\s\S]*FROM PUBLIC,anon,authenticated,service_role;/);
assert.match(sql,/GRANT EXECUTE ON FUNCTION[\s\S]*public\.studio_artifact_summary_projection_v2\(uuid,uuid,integer,integer\)[\s\S]*TO authenticated;/);

const request=functionBody('studio_artifact_generation_request_v2');
for(const forbidden of ['providerId','providerConfigId','provider','model','routeId','prompt','promptVersion','budget','maximumOutputTokens','routePolicyVersion','routePolicySnapshot']){
  assert.ok(!request.slice(0,request.indexOf("PERFORM public.studio_assert_actor")).includes(`'${forbidden}'`),`public request accepts ${forbidden}`);
}
for(const required of ['studio.document.generate','studio-multisource-generation','studio-pr-b-1','provider_plan_hash','source_package_hash','expected_aggregate_version'])assert.ok(request.includes(required));
assert.doesNotMatch(request,/manual_brief|manualBrief/);
assert.ok(request.indexOf('PERFORM public.studio_assert_actor')<request.indexOf('SELECT * INTO receipt'));
assert.doesNotMatch(request,/SELECT provider_route,provider_config INTO route,config/);
assert.match(request,/SELECT provider_route\.\* INTO route[\s\S]*FOR SHARE OF provider_route,provider_config/);
assert.match(request,/SELECT \* INTO config FROM public\.ai_provider_configs provider_config/);
const claimV2=functionBody('studio_artifact_generation_claim_v2');
assert.match(claimV2,/'providerAllowed',true,'reconcileOnly',false,'providerEffectKey'/);
assert.match(claimV2,/UPDATE public\.studio_generation_staged_responses[\s\S]*SET execution_token=attempt\.execution_token,execution_fence=attempt\.execution_fence/);
assert.deepEqual(
  adapterRpcArgumentNames('generationStage'),
  functionParameterNames('studio_artifact_generation_stage_v2'),
  'generation stage adapter named arguments must exactly match the SQL signature',
);
assert.deepEqual(
  adapterRpcArgumentNames('generationFinalize'),
  functionParameterNames('studio_artifact_generation_finalize_v2'),
  'generation finalize adapter named arguments must exactly match the SQL signature',
);
const transitionV2=functionBody('studio_artifact_provider_budget_transition_v2');
const reserveV2=functionBody('studio_artifact_reserve_provider_budget_v2');
for(const body of [transitionV2,claimV2]){
  assert.ok(body.indexOf('SELECT * INTO attempt FROM public.studio_artifact_generation_attempts')
    <body.indexOf('SELECT * INTO reservation FROM public.enterprise_ai_budget_reservations'),
  'all lease/takeover and settlement paths must lock attempt before reservation');
}
assert.ok(reserveV2.indexOf('pg_advisory_xact_lock')<reserveV2.indexOf('SELECT * INTO receipt')
  &&reserveV2.indexOf('SELECT * INTO receipt')<reserveV2.indexOf('SELECT * INTO attempt')
  &&reserveV2.indexOf('SELECT * INTO attempt')<reserveV2.indexOf('SELECT * INTO reservation'),
  'reserve lock order must remain advisory -> receipt -> attempt -> reservation');
assert.match(claimV2,/reservation\.state IN\('reserved','uncertain','settled','released'\)/);
assert.match(claimV2,/reservation\.release_reason='before_provider_effect'[\s\S]*studio_transfer_pending/);
assert.match(claimV2,/studio_transfer_count=studio_transfer_count\+1[\s\S]*studio_transfer_pending=true/);
assert.match(reserveV2,/reservation\.state='reserved' AND reservation\.studio_transfer_pending[\s\S]*studio_transfer_pending=false/);
assert.match(sql,/CREATE OR REPLACE FUNCTION public\.studio_pr_b_anchor_manifest_safe/);
assert.match(sql,/'assess:accepted-handoff'/);
assert.match(sql,/anchor-ARRAY\['sourceVersionId','locator','anchorHash'\]/);
const finalizeV2=functionBody('studio_artifact_generation_finalize_v2');
assert.match(finalizeV2,/attempt\.state NOT IN\('response_staged','reconciling'\)/);
assert.match(finalizeV2,/template_stale:=system_template\.id IS NULL OR system_template\.superseded_at IS NOT NULL/);
assert.match(finalizeV2,/tenant_aggregate\.current_approved_version_id IS DISTINCT FROM tenant_template\.id/);
assert.match(finalizeV2,/attempt\.cancellation_requested_at IS NOT NULL OR template_stale/);
const timeoutV2=functionBody('studio_artifact_generation_timeout_v2');
assert.match(timeoutV2,/GENERATION_TIMEOUT_NOT_DUE/);
assert.ok(timeoutV2.indexOf('SELECT * INTO attempt FROM public.studio_artifact_generation_attempts')
  <timeoutV2.indexOf('SELECT * INTO reservation FROM public.enterprise_ai_budget_reservations'),
  'timeout must preserve the global attempt-before-reservation lock order');
assert.match(timeoutV2,/reservation\.state='released'[\s\S]*reservation\.release_reason='before_provider_effect'[\s\S]*NOT reservation\.studio_transfer_pending/);
assert.match(timeoutV2,/reservation\.id IS NOT NULL AND NOT released_before_effect[\s\S]*GENERATION_RECONCILIATION_REQUIRED/,
  'timeout must preserve authoritative reserved/uncertain/settled/non-before-effect released reservations');
const failV2=functionBody('studio_artifact_generation_fail_v2');
for(const code of ['PROVIDER_GOVERNANCE_BLOCKED','PROVIDER_REQUEST_FAILED','PROVIDER_RATE_LIMITED','PROVIDER_TIMEOUT','PROVIDER_CANCELLED','PROVIDER_OUTPUT_INVALID','PROVIDER_OUTPUT_OVERSIZED','PROVIDER_MODEL_MISMATCH','PROVIDER_USAGE_INVALID','SOURCE_COVERAGE_INCOMPLETE','GENERATION_COMPLETION_CONFLICT','GENERATION_START_CONFLICT']){
  assert.ok(failV2.includes(`'${code}'`),`fenced failure allowlist missing ${code}`);
}
assert.match(failV2,/p_failure_code='GENERATION_UNCERTAIN'[\s\S]*RAISE EXCEPTION 'INVALID_COMMAND'/);
assert.match(failV2,/p_attempt_id uuid,p_execution_token uuid,p_fence bigint,p_failure_code text/);
assert.match(failV2,/execution_token IS DISTINCT FROM p_execution_token OR attempt\.execution_fence IS DISTINCT FROM p_fence[\s\S]*RAISE EXCEPTION 'STALE_EXECUTION_FENCE'/);
assert.match(failV2,/attempt\.state<>'generating' OR attempt\.response_hash IS NOT NULL[\s\S]*studio_generation_staged_responses staged WHERE staged\.attempt_id=attempt\.id[\s\S]*RAISE EXCEPTION 'VERSION_CONFLICT'/);
assert.match(failV2,/execution_lease_expires_at IS NULL OR attempt\.execution_lease_expires_at<=statement_timestamp\(\)/);
assert.ok(failV2.indexOf('SELECT * INTO attempt FROM public.studio_artifact_generation_attempts')
  <failV2.indexOf('SELECT * INTO reservation FROM public.enterprise_ai_budget_reservations'),
  'terminal failure must preserve the global attempt-before-reservation lock order');
assert.ok(failV2.indexOf('execution_lease_expires_at IS NULL')
  <failV2.indexOf('SELECT * INTO reservation FROM public.enterprise_ai_budget_reservations'),
  'terminal failure must complete existing fence/state/staged/lease guards before locking reservation');
assert.match(failV2,/reservation\.state='released'[\s\S]*reservation\.release_reason='before_provider_effect'[\s\S]*NOT reservation\.studio_transfer_pending/);
assert.match(failV2,/reservation\.id IS NOT NULL AND NOT released_before_effect[\s\S]*GENERATION_RECONCILIATION_REQUIRED/,
  'terminal failure must preserve authoritative reserved/uncertain/settled/non-before-effect released reservations');
assert.match(failV2,/SET state='failed',failure_code=safe_code,completed_at=statement_timestamp\(\),execution_lease_expires_at=NULL/);
assert.match(failV2,/'studio\.artifact\.generation\.fail\.v2'[\s\S]*jsonb_build_object\('artifactId',attempt\.artifact_id,'failureCode',safe_code,'terminalState','failed','executionFence',attempt\.execution_fence\)/);
assert.match(failV2,/studio_generation_recovery_events[\s\S]*'failed',safe_code,audit_id/);
assert.ok(failV2.indexOf("RAISE EXCEPTION 'STALE_EXECUTION_FENCE'")<failV2.indexOf("SET state='failed'"),'fence validation must precede terminal mutation');
assert.match(sql,/REVOKE ALL ON FUNCTION[\s\S]*public\.studio_artifact_generation_fail_v2\(uuid,uuid,bigint,text\)[\s\S]*FROM PUBLIC,anon,authenticated,service_role;/);
assert.match(sql,/GRANT EXECUTE ON FUNCTION[\s\S]*public\.studio_artifact_generation_fail_v2\(uuid,uuid,bigint,text\)[\s\S]*TO service_role;/);
marker('GENERATION-PRB-001','SERVER-OWNED-ATOMIC-PLAN',{
  migration:migrationName,sourcePackage:{binding:'exact_id_hash'},template:{binding:'exact_kind_id_version_hash'},handoff:null,
  artifact:{expectedHeads:['aggregate','current','approved'],providerPlan:'server_owned',promptVersion:'studio-pr-b-1',
    responseLossRecovery:'effect_key_and_staged_refence',templateRevalidatedAtFinalize:true,cancellationAndTimeout:true},
});
marker('GENERATION-PRB-003','FENCED-FAILURE-RPC-CONTRACT',{
  migration:migrationName,sourcePackage:null,template:null,handoff:null,
  artifact:{signature:'studio_artifact_generation_fail_v2(uuid,uuid,bigint,text)',exactFence:true,terminalReplay:true,invalidCodeSanitized:true,uncertainTerminalizationRejected:true,serviceOnly:true},
});

for(const table of ['studio_artifact_source_packages','studio_artifact_manual_brief_materials','studio_tenant_template_aggregates','studio_tenant_template_versions','enterprise_module_handoffs','enterprise_module_handoff_consumptions','studio_generation_staged_responses','studio_generation_recovery_events']){
  assert.match(sql,new RegExp(`'${table}'`));
}
assert.match(sql,/GRANT EXECUTE ON FUNCTION[\s\S]*public\.studio_artifact_source_package_create\(jsonb\)[\s\S]*TO service_role;/);
assert.match(sql,/ALTER TABLE public\.%I ENABLE ROW LEVEL SECURITY/);
assert.match(sql,/ALTER TABLE public\.%I FORCE ROW LEVEL SECURITY/);
assert.match(sql,/STUDIO_PR_B_DELIVERY_PATH_DISABLED/);
assert.match(sql,/package\.source_mode<>'assess_handoff'/);
marker('DELIVERY-PRB-GUARD','NON-ASSESS-FAIL-CLOSED',{
  migration:migrationName,sourcePackage:{allowedMode:'assess_handoff'},template:null,handoff:null,artifact:{deliveryMutation:'guarded'},
});

console.log('Governed multi-source Studio PR B migration contract passed.');
