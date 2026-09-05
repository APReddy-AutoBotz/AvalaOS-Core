import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';

const migrationName='20260831062024_governed_delivery_monitor_pr_c.sql';
const controlledHumanMigrationName='20260904120000_pr_c_controlled_human_exercise_authority.sql';
const sql=readFileSync(`supabase/migrations/${migrationName}`,'utf8');
const migrations=readdirSync('supabase/migrations').filter(name=>name.endsWith('.sql')).sort();
const emit=(testId,assertionId,lineage)=>console.log(`PR_C_ASSERTION ${JSON.stringify({
  testId,assertionId,fixture:'pr-c-migration-sql-contract',owner:'migration-static',result:'passed',runtimeContext:{
    persona:{id:'30000013-0000-4000-8000-000000000013',state:'active',capabilities:[]},organizationId:'97000000-0000-4000-8000-000000000010',workspaceId:'97000000-0000-4000-8000-000000000011',...lineage,
  },
})}`);
const body=name=>{
  const start=sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);assert.notEqual(start,-1,`missing ${name}`);
  const end=sql.indexOf('\n$$;',start);assert.notEqual(end,-1,`unterminated ${name}`);return sql.slice(start,end+4);
};

assert.equal(migrations.filter(name=>name===migrationName).length,1);
assert.equal(migrations.filter(name=>name===controlledHumanMigrationName).length,1);
assert.ok(migrations.indexOf(controlledHumanMigrationName)>migrations.indexOf(migrationName));
assert.equal(migrations.at(-1),controlledHumanMigrationName);
assert.ok(sql.indexOf('DO $pr_c_preflight$')<sql.indexOf('INSERT INTO public.capabilities'));
assert.match(sql,/PR_C_DIRTY_SCHEMA/);assert.match(sql,/PR_C_BACKFILL_PRECONDITION_FAILED/);assert.match(sql,/PR_C_BACKFILL_CARDINALITY_MISMATCH/);
assert.match(sql,/SET migration_tip='20260831062024'/);assert.match(sql,/CHECK\(migration_tip='20260831062024'\)/);
for(const flag of ['direct_delivery_planning_enabled','delivery_item_review_enabled','monitor_approved_baseline_enabled'])assert.match(sql,new RegExp(`ADD COLUMN ${flag} boolean NOT NULL DEFAULT false`));
emit('DELIVERY-TR-006','DEFAULT-OFF-EXACT-BACKFILL-CONTRACT',{migration:migrationName,sourcePackage:{modes:['studio_handoff','manual'],exclusiveUnion:true},package:null,item:null,acceptedSet:null,baseline:null,classification:'not_assessed',flagsDefaultOff:true});

for(const table of ['enterprise_delivery_handoffs','enterprise_delivery_source_packages','enterprise_delivery_work_item_aggregates','enterprise_delivery_work_item_versions',
  'enterprise_delivery_work_item_decisions','enterprise_delivery_package_review_events','enterprise_delivery_package_approval_events','enterprise_delivery_monitor_command_receipts','enterprise_delivery_monitor_command_attempts',
  'enterprise_delivery_monitor_effects','enterprise_monitor_baseline_items'])assert.ok(sql.includes(`public.${table}`),`missing ${table}`);
assert.match(sql,/source_mode IN\('studio_handoff','manual'\)/);assert.match(sql,/lineage_classification='not_assessed' AND planning_only/);
assert.match(sql,/FOREIGN KEY\(parent_aggregate_id,work_package_id,org_id,workspace_id\)/);
assert.match(sql,/status IN\('proposed','edited','accepted','rejected','superseded'\)/);
assert.match(sql,/CREATE TRIGGER enterprise_pr_c_.*_immutable/);
emit('DELIVERY-TR-003','IMMUTABLE-ITEM-VERSION-AND-PARENT-SCOPE-CONTRACT',{migration:migrationName,sourcePackage:null,package:{aggregateVersion:true},item:{stableAggregate:true,immutableVersions:true,samePackageParent:true},acceptedSet:null,baseline:null,classification:'assessed'});
emit('DELIVERY-TR-004','TERMINAL-DECISION-RATIONALE-CONTRACT',{migration:migrationName,sourcePackage:null,package:{terminalDecisionRequired:true},item:{decisions:['accepted','rejected'],rationale:true},acceptedSet:null,baseline:null,classification:'mixed'});

const command=body('enterprise_delivery_monitor_command');
for(const action of ['delivery.handoff.request','delivery.handoff.review.resolve','delivery.handoff.approval.resolve','delivery.handoff.withdraw','delivery.handoff.consume',
  'delivery.package.create.manual','delivery.item.review','delivery.package.revision.commit','delivery.package.review.resolve','delivery.package.approval.resolve','monitor.baseline.create'])assert.ok(command.includes(`'${action}'`),`missing ${action}`);
assert.ok(command.indexOf('pr1b_assert_command_authority')<command.indexOf('SELECT stored.* INTO receipt'));
assert.ok(command.indexOf("pr1b_assert_command_authority(actor,org,target_workspace,'delivery.handoff.request',authorization_version)")<command.indexOf('SELECT stored.* INTO receipt'));
assert.ok(command.indexOf('pg_advisory_xact_lock')<command.indexOf('SELECT stored.* INTO receipt'));
assert.ok(command.indexOf("IF receipt.status='committed' THEN RETURN receipt.response")<command.indexOf("enterprise_assert_writable('delivery')"));
for(const gate of [
  "action LIKE 'delivery.handoff.%' AND NOT flags.module_handoffs_enabled",
  "action='delivery.package.create.manual' AND NOT flags.direct_delivery_planning_enabled",
  "AND NOT flags.delivery_item_review_enabled",
  "action='monitor.baseline.create' AND NOT flags.monitor_approved_baseline_enabled",
])assert.ok(command.indexOf(gate)>command.indexOf("IF receipt.status='committed' THEN RETURN receipt.response"),`new-effect gate must follow exact committed replay: ${gate}`);
assert.ok(command.lastIndexOf('pr1b_assert_command_authority')>command.indexOf('IF result IS NULL'));
assert.match(command,/execution_token/);assert.match(command,/execution_fence/);assert.match(command,/IDEMPOTENCY_CONFLICT/);assert.match(command,/COMMAND_IN_PROGRESS/);
assert.match(command,/p_command-ARRAY\['receiptId','requestId','authorizationVersion','executionToken','executionFence'\]::text\[\]/);
assert.doesNotMatch(command,/receipt\.request_id<>request_id|receipt\.authorization_version<>authorization_version/);
assert.match(command,/enterprise_delivery_monitor_command_attempts/);
assert.match(command,/p_command \? 'proposedItems'/);assert.match(command,/studio-section-/);assert.match(command,/p_command \? 'acceptedItemAggregateIds'/);
assert.match(command,/delivery-accepted-set-2/);assert.match(command,/'acceptedItemCount'/);
assert.match(command,/expectedPackageAggregateVersion/);assert.match(command,/package_aggregate_version/);
assert.match(command,/p_command->'expectedItems'/);assert.match(command,/package\.status<>'blocked'/);
assert.match(command,/expectedItemVersionId/);assert.match(command,/expectedAggregateVersion/);
assert.match(command,/item_payload->>'itemType'=item_version\.item_type/);
assert.match(command,/ENTERPRISE_DELIVERY_RESOURCE_STALE/);
assert.match(command,/UPDATE public\.enterprise_delivery_work_packages SET aggregate_version=aggregate_version\+1/);
assert.match(command,/actor IN\(current_item\.created_by,current_decision\.decided_by\)/);
assert.ok(command.indexOf('enterprise_delivery_monitor_effects')<command.indexOf("SET status='committed'"));
assert.ok(command.indexOf('privileged_audit_events')<command.indexOf('enterprise_delivery_monitor_effects'));
const publicSignals=[...command.matchAll(/RAISE EXCEPTION '(ENTERPRISE_DELIVERY_[A-Z_]+)'/g)].map(match=>match[1]);
assert.deepEqual([...new Set(publicSignals)].sort(),['ENTERPRISE_DELIVERY_COMMAND_IN_PROGRESS','ENTERPRISE_DELIVERY_FEATURE_DISABLED','ENTERPRISE_DELIVERY_HANDOFF_STALE','ENTERPRISE_DELIVERY_IDEMPOTENCY_CONFLICT','ENTERPRISE_DELIVERY_PERMISSION_DENIED','ENTERPRISE_DELIVERY_READ_ONLY','ENTERPRISE_DELIVERY_RESOURCE_STALE','ENTERPRISE_DELIVERY_RESOURCE_UNAVAILABLE'].sort());
emit('HANDOFF-004','TARGET-ACCEPTED-ONE-EFFECT-CONTRACT',{migration:migrationName,edge:'studio_to_delivery',handoff:{edge:'studio_to_delivery',targetAccepted:true,oneConsumption:true,exactStudioVersion:true},sourcePackage:null,package:{createdAtomically:true},item:null,acceptedSet:null,baseline:null,classification:'assessed'});
emit('HANDOFF-005','UPSTREAM-CURRENTNESS-LOCK-CONTRACT',{migration:migrationName,edge:'studio_to_delivery',handoff:{staleBeforeConsumeBlocked:true,artifactLockedBeforeCurrentness:true},sourcePackage:{exactStudioVersionHash:true},package:null,item:null,acceptedSet:null,baseline:null,classification:'mixed'});
emit('IDEMP-003','CHANGED-BINDING-CONFLICT-CONTRACT',{migration:migrationName,receipt:{serverHash:true,exactTokenFence:true,changedBindingConflict:true,authorityBeforeReplay:true,committedReplayBeforeMutableRuntimeGates:true},sourcePackage:null,package:null,item:null,acceptedSet:null,baseline:null,classification:'not_assessed'});

assert.match(sql,/enterprise_pr_c_assert_package_resolved/);assert.match(sql,/ENTERPRISE_DELIVERY_COMMAND_BLOCKED/);
assert.match(sql,/enterprise_pr_c_reject_legacy_generic_approval/);
assert.match(sql,/delivery_work_package_version/);
assert.match(sql,/created_by<>reviewed_by AND created_by<>approved_by AND reviewed_by<>approved_by/);
assert.match(sql,/package_aggregate_version bigint NOT NULL/);
emit('DELIVERY-TR-005','BLOCKERS-RECOVERY-AND-THREE-PERSON-APPROVAL-CONTRACT',{migration:migrationName,sourcePackage:{currentnessRechecked:true},package:{allItemsTerminal:true,threePersonSeparation:true,currentItemActorSeparation:true,snapshotGenerationBound:true,blockersAuthoritative:true,recoveryBlockedOnly:true,completeExpectedDescendants:true},item:{selectedChangesOnly:true,materialChangeRequired:true,freshDecisionsRequired:true},acceptedSet:{digestBound:true},baseline:{draftRejectedStaleBlockedDenied:true,unchangedUntilFreshApproval:true},classification:'assessed'});

assert.match(sql,/baseline_contract='delivery-monitor-2'/);assert.match(sql,/package_approval_id IS NOT NULL/);assert.match(sql,/accepted_set_hash/);assert.match(command,/'liveTelemetryConnected',false/);
assert.match(command,/manifest_hash<>approval\.accepted_set_hash OR selector_count<>approval\.accepted_item_count/);assert.match(command,/acceptedItemAggregateIds/);
assert.match(sql,/enterprise_pr_c_baseline_binding_validate/);assert.match(sql,/enterprise_monitor_baseline_items_scope_fk/);
emit('MONITOR-TR-001','EXACT-APPROVED-RELATIONAL-ACCEPTED-SET-CONTRACT',{migration:migrationName,sourcePackage:{exactIdHash:true},package:{exactVersionHash:true,approvalId:true},item:null,acceptedSet:{relational:true,digest:true,duplicatesRejected:true},baseline:{immutable:true,idempotentUnique:true},classification:'assessed'});
emit('MONITOR-TR-002','READONLY-NO-LIVE-TELEMETRY-CONTRACT',{migration:migrationName,sourcePackage:null,package:null,item:null,acceptedSet:null,baseline:{readOnly:true,liveTelemetryConnected:false,readiness:['not_ready','review_required']},classification:'not_assessed'});

const deliveryProjection=body('enterprise_delivery_workspace_projection');
const monitorProjection=body('enterprise_monitor_approved_baselines_projection');
assert.match(deliveryProjection,/itemCursorVersion/);assert.match(deliveryProjection,/itemCursorId/);assert.match(deliveryProjection,/LEAST\(GREATEST/);
assert.match(deliveryProjection,/baselineEligibilityCursorUpdatedAt/);assert.match(deliveryProjection,/baselineEligibilityCursorPackageId/);
assert.match(deliveryProjection,/LIMIT baseline_eligibility_limit\+1/);assert.match(deliveryProjection,/'baselineEligibilityHasMore'/);assert.match(deliveryProjection,/'baselineEligibilityNextCursor'/);
assert.match(deliveryProjection,/'isComplete'/);assert.match(deliveryProjection,/'eligibleStudioArtifacts'/);assert.match(deliveryProjection,/'baselineEligibility'/);
assert.match(deliveryProjection,/NOT page\.current_item_actor_conflict/);
assert.doesNotMatch(deliveryProjection,/page\.status='draft' THEN jsonb_build_array\('delivery\.item\.review','delivery\.package\.revision\.commit'\)/);
assert.match(deliveryProjection,/AND can_project_read/);
for(const capability of ['request','review','approve','consume']){
  assert.match(deliveryProjection,new RegExp(`can_handoff_${capability}_read:=can_handoff_${capability}`));
}
assert.match(deliveryProjection,/stored\.workspace_id=p_workspace AND stored\.requested_by=actor AND can_handoff_request_read/);
assert.match(deliveryProjection,/stored\.target_workspace_id=p_workspace AND \(can_handoff_review_read OR can_handoff_approve_read OR can_handoff_consume_read\)/);
assert.match(deliveryProjection,/CASE WHEN can_handoff_request AND handoff\.workspace_id=p_workspace AND handoff\.requested_by=actor[\s\S]*delivery\.handoff\.withdraw/);
assert.doesNotMatch(deliveryProjection,/CASE WHEN writable AND handoff\.workspace_id=p_workspace[\s\S]{0,250}delivery\.handoff\.withdraw/);
for(const key of ['currentVersionHash','packageHash','itemHash','acceptedSetHash','proposalHash','requestedBy','sourceWorkspaceId','sourcePackageId'])assert.doesNotMatch(deliveryProjection,new RegExp(`'${key}'`));
assert.match(deliveryProjection,/'readOnly'/);assert.match(monitorProjection,/'actions','\[\]'::jsonb/);assert.match(monitorProjection,/'liveTelemetryConnected',false/);
for(const key of ['workPackageHash','acceptedSetHash','resourceHash','packageApprovalId','itemHash'])assert.doesNotMatch(monitorProjection,new RegExp(`'${key}'`));
assert.doesNotMatch(monitorProjection,/delivery\.item\.review|delivery\.package\.revision\.commit|transcriptUpload|sourceUpload/);
emit('MONITOR-TR-003','SAFE-MONITOR-PROJECTION-SUPPRESSES-MUTATION-CONTRACT',{migration:migrationName,sourcePackage:null,package:null,item:null,acceptedSet:null,baseline:{projection:'enterprise-monitor-approved-baselines-2',actions:[],transcriptControls:false,itemMutationControls:false},classification:'mixed'});

for(const marker of ['ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY','ALTER TABLE public.%I FORCE ROW LEVEL SECURITY','REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated,service_role'])assert.ok(sql.includes(marker));
assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.enterprise_delivery_monitor_command\(jsonb\) TO service_role/);
assert.match(sql,/enterprise_commit_delivery_handoff\(jsonb,jsonb,jsonb,jsonb,uuid,uuid,bigint,jsonb\)/);
assert.match(sql,/enterprise_delivery_package_projection\(uuid,uuid,uuid\),public\.enterprise_monitor_projection\(uuid,uuid,uuid\)/);
assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.enterprise_delivery_workspace_projection\(uuid,uuid,jsonb\),public\.enterprise_monitor_approved_baselines_projection\(uuid,uuid,jsonb\)[\s\S]*TO authenticated,service_role/);
emit('AUTH-002','RLS-ACL-SERVICE-MUTATION-SAFE-PROJECTION-CONTRACT',{migration:migrationName,tenantBoundary:{compositeWorkspaceOrg:true,forcedRls:true,authenticatedTableGrants:false},sourcePackage:null,package:null,item:null,acceptedSet:null,baseline:null,classification:'assessed'});

console.log('Governed Delivery/Monitor PR C migration contract passed.');
