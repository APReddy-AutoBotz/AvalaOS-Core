import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const migrationPath = path.join(process.cwd(), 'supabase/migrations/20260804120000_enterprise_intelligence_authority.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');
const authorizationAttemptSql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260805120000_provider_lifecycle_authorization_attempts.sql'),
  'utf8',
);
const secretWriteIntentSql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260805130000_provider_secret_write_intent_recovery.sql'),
  'utf8',
);
const readyReviewSql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260805140000_enterprise_intelligence_ready_review_corrections.sql'),
  'utf8',
);
const atomicPromotionSql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260805150000_enterprise_atomic_candidate_promotion.sql'),
  'utf8',
);
const extractionRecoverySql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260805160000_enterprise_rpc_error_and_extraction_recovery.sql'),
  'utf8',
);
const extractionRouteStagingSql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260805170000_enterprise_extraction_route_and_staging.sql'),
  'utf8',
);
const reviewActionReplaySql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260807120000_enterprise_review_action_replay_authority.sql'),
  'utf8',
);
const providerCleanupRecoverySql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260807130000_provider_secret_cleanup_recovery.sql'),
  'utf8',
);
const commandSource = fs.readFileSync(path.join(process.cwd(), 'supabase/functions/_shared/enterpriseIntelligenceCommand.ts'), 'utf8');
const providerLifecycleSource = fs.readFileSync(path.join(process.cwd(), 'supabase/functions/_shared/providerLifecycle.ts'), 'utf8');
const providerLifecycleEndpointSource = fs.readFileSync(path.join(process.cwd(), 'supabase/functions/_shared/providerLifecycleEndpoint.ts'), 'utf8');
const requiredTables = [
  'enterprise_intelligence_runtime_control',
  'enterprise_ai_capability_routes',
  'enterprise_ai_command_receipts',
  'enterprise_ai_receipt_replay_requests',
  'enterprise_ai_effect_journal',
  'enterprise_ai_job_ledger',
  'enterprise_ai_usage_ledger',
  'enterprise_evidence_sources',
  'enterprise_evidence_source_versions',
  'enterprise_evidence_candidates',
  'enterprise_evidence_candidate_edits',
  'enterprise_evidence_questions',
  'enterprise_evidence_assess_promotions',
  'enterprise_studio_delivery_handoffs',
  'enterprise_delivery_work_packages',
  'enterprise_delivery_work_package_versions',
  'enterprise_delivery_work_items',
  'enterprise_monitor_baselines',
  'enterprise_modernization_assessments',
  'enterprise_modernization_decisions',
  'enterprise_assemble_blueprints',
  'enterprise_high_impact_review_events',
  'enterprise_high_impact_approvals',
];

let assertions = 0;
const check = (condition, message) => { assert.ok(condition, message); assertions += 1; };
for (const table of requiredTables) {
  check(sql.includes(`CREATE TABLE public.${table}`), `Missing strict table creation for ${table}`);
}
check(!/CREATE TABLE IF NOT EXISTS public\.enterprise_/i.test(sql), 'Enterprise tables must reject dirty drift instead of accepting IF NOT EXISTS.');
check(sql.includes('ENTERPRISE_INTELLIGENCE_DIRTY_SCHEMA'), 'A fail-fast dirty-schema preflight is required.');
check(sql.indexOf('ENTERPRISE_INTELLIGENCE_DIRTY_SCHEMA') < sql.indexOf('INSERT INTO public.capabilities'), 'Dirty-schema rejection must precede all feature mutations.');
check(sql.includes("ON DELETE SET NULL (provider_config_id)"), 'Provider deletion must retain the job and null only its provider reference.');
check(sql.includes("ON DELETE SET NULL (key_ref_id)"), 'Key deletion must retain provider configuration lineage.');
check(sql.includes("content_bytes <= 12582912"), 'The 12 MiB source authority limit is required.');
for (const token of [
  "'text/plain'", "'text/markdown'", "'text/csv'", "'text/vtt'", "'application/x-subrip'",
  "'application/pdf'", "'application/vnd.openxmlformats-officedocument.wordprocessingml.document'",
  "'text_native'", "'csv'", "'vtt'", "'srt'", "'pdf_text'", "'docx'",
  "'failed_ocr_required'", "'OCR_REQUIRED'",
]) check(sql.includes(token), `Missing source/provenance contract token ${token}`);
for (const signature of [
  'enterprise_evidence_source_projection', 'enterprise_delivery_package_projection',
  'enterprise_monitor_projection', 'enterprise_assemble_blueprint_projection',
]) check(sql.includes(`FUNCTION public.${signature}`), `Missing safe projection ${signature}`);
check(sql.includes('enterprise_high_impact_approval_separation_check'), 'Three-person approval separation is required.');
check(sql.includes('enterprise_evidence_assess_promotions'), 'Accepted evidence must have immutable Assess promotion lineage.');
check(sql.includes('enterprise_provider_lifecycle_transition'), 'The service-only provider lifecycle transition RPC is required.');
check(authorizationAttemptSql.includes('current_authorization IS DISTINCT FROM p_authorization_version'), 'Provider authorization version must be an attempt precondition.');
check(authorizationAttemptSql.includes('ENTERPRISE_PROVIDER_AUTHORIZATION_VERSION_STALE'), 'Stale-but-authorized provider attempts require a recoverable signal.');
check(authorizationAttemptSql.includes('ENTERPRISE_PROVIDER_ORGANIZATION_AUTHORITY_REQUIRED'), 'Removed provider authority requires a terminal non-disclosing signal.');
check(authorizationAttemptSql.includes('enterprise_ai_record_effect'), 'Corrected provider transitions must retain fenced effect evidence.');
check(secretWriteIntentSql.includes("old_write_state='planned' AND new_write_state='written'"), 'Receipt plans must permit only the managed planned-to-written state advance.');
check(secretWriteIntentSql.includes("p_plan @> (receipt.execution_plan - 'writeState')"), 'Write-state advancement must preserve every other receipt-plan field.');
check(secretWriteIntentSql.includes('ENTERPRISE_AI_STALE_EXECUTION_FENCE'), 'Secret intent persistence must retain execution fencing.');
for (const required of [
  'enterprise_ai_claim_provider_secret_cleanup',
  "p_operation NOT IN ('provider.secret.bind','provider.secret.rotate')",
  'actor_id=p_actor',
  'initial_request_id IS DISTINCT FROM p_request',
  "plan->>'secretOwnership' IS DISTINCT FROM 'managed_write'",
  "plan->>'secretPlanReceiptId' IS DISTINCT FROM receipt.id::text",
  "plan->>'providerConfigId' IS DISTINCT FROM p_provider_config_id::text",
  "secret_ref=plan->>'secretReference' AND status='active'",
  "effect_key='command'",
  'execution_fence=execution_fence+1',
  "'cleanupTerminalCode','PERMISSION_DENIED'",
  "receipt.response#>>'{error,code}' IS DISTINCT FROM 'PERMISSION_DENIED'",
]) check(providerCleanupRecoverySql.includes(required), `Provider cleanup recovery is missing ${required}.`);
check(providerCleanupRecoverySql.includes('FROM PUBLIC,anon,authenticated'), 'Provider cleanup recovery must reject browser roles.');
check(providerCleanupRecoverySql.includes('TO service_role'), 'Provider cleanup recovery must remain service-only.');
check(!/(?:providerKey|rawKey|secretValue)/u.test(providerCleanupRecoverySql), 'Provider cleanup recovery must not accept raw key material.');
check(providerLifecycleSource.indexOf("secretOwnership: 'managed_write'") < providerLifecycleSource.indexOf('await deps.secretBackend.write'), 'Managed secret ownership must be persisted before the external write.');
check(providerLifecycleSource.includes("execution.plan.secretPlanReceiptId === execution.receiptId"), 'Cleanup ownership must be bound to the current receipt plan.');
check(providerLifecycleSource.includes('await fingerprintProviderSecret(existing) !== safeFingerprint'), 'Cleanup must verify the resolved secret fingerprint before deletion.');
check(providerLifecycleSource.includes('protectedSecretReferenceHash'), 'Cleanup must protect the prior active secret reference.');
check(providerLifecycleEndpointSource.includes("claimedReceipt.execution_plan?.secretOwnership === 'managed_write'"), 'A planned managed write must keep persistence failures claimed for reconciliation.');
check(readyReviewSql.includes('enterprise_provider_route_role_guard'), 'Route-role writes require exact active scope validation.');
check(readyReviewSql.includes("capability.capability_key = 'org.admin'"), 'Organization route roles must be organization administrators.');
check(readyReviewSql.includes("'source-record'"), 'Source/version persistence must be journaled before parsing.');
check(readyReviewSql.includes('enterprise_record_source_extraction_success'), 'Successful parsing requires a receipt-aware terminal transition.');
check(readyReviewSql.includes("p_failure_code, 'command'" ) || readyReviewSql.includes("'evidence.source.create', 'command'"), 'Deterministic parse failure requires a receipt-aware terminal effect.');
check(readyReviewSql.includes("candidate.suggestion_status NOT IN ('accepted', 'edited')"), 'Reviewed edited candidates must be eligible for promotion.');
check(readyReviewSql.includes('ENTERPRISE_EVIDENCE_EDIT_HISTORY_REQUIRED'), 'Edited promotion requires append-only edit history.');
check(atomicPromotionSql.includes('FUNCTION public.enterprise_promote_evidence_batch_to_assess_v2'), 'One service-only batch promotion RPC is required.');
check(atomicPromotionSql.includes("'evidence.assess.promote', 'command'"), 'Batch promotion requires one command effect for response-loss recovery.');
check(atomicPromotionSql.indexOf('-- All preconditions are now locked and valid.') < atomicPromotionSql.indexOf('INSERT INTO public.assess_v2_case_versions'), 'Every candidate must validate before the first promotion mutation.');
const promotionCommand = commandSource.slice(
  commandSource.indexOf('const commandEvidenceAssessPromote'),
  commandSource.indexOf('const assertApprovedApplicationAssessment'),
);
check(!/for\s*\([^)]*candidate[^)]*\)[\s\S]*?rpc\(['"]enterprise_promote_evidence_to_assess_v2/iu.test(promotionCommand), 'The command handler must not loop over the single-candidate promotion RPC.');
check((promotionCommand.match(/enterprise_promote_evidence_batch_to_assess_v2/gu) || []).length === 1, 'The command handler must make exactly one promotion RPC call.');
check(atomicPromotionSql.indexOf('PERFORM public.enterprise_ai_record_effect') < atomicPromotionSql.indexOf('RETURN result;'), 'Batch success requires a durable receipt effect.');
check(atomicPromotionSql.includes("'resourceId', assess_case.id"), 'Batch response must identify the Assess draft as its canonical resource.');
for (const required of [
  'enterprise_claim_or_resume_evidence_extraction_job', 'enterprise_fail_evidence_extraction_job',
  'enterprise_ai_job_attempts', 'attempt_lease_expires_at', 'execution_fence',
  "'evidence.extract','command',p_job_id,p_result,'committed'",
]) check(extractionRecoverySql.includes(required), `Extraction recovery migration is missing ${required}.`);
check(extractionRecoverySql.includes("job.status IN ('succeeded','failed','blocked')"), 'Terminal extraction jobs must replay durable effect truth.');
check(extractionRecoverySql.includes('p_execution_fence<=job.execution_fence'), 'Only a newer fence may resume an expired job.');
check(extractionRecoverySql.includes("attempt_kind IN ('claimed','resumed')"), 'Every provider attempt requires append-only safe audit evidence.');
const extractionClaimSql = extractionRecoverySql.slice(
  extractionRecoverySql.indexOf('CREATE OR REPLACE FUNCTION public.enterprise_claim_or_resume_evidence_extraction_job'),
  extractionRecoverySql.indexOf('CREATE OR REPLACE FUNCTION public.enterprise_fail_evidence_extraction_job'),
);
check(extractionClaimSql.includes('p_job_id,p_org,p_workspace,p_capability'), 'Recovery must insert the planned job ID, never a replacement.');
check(!extractionClaimSql.includes('gen_random_uuid()'), 'Recovery must not generate a second job ID.');
for (const forbidden of ['raw_prompt', 'prompt_body', 'raw_completion', 'completion_body', 'provider_key', 'authorization']) {
  check(!extractionRecoverySql.includes(forbidden), `Extraction ledgers must reject ${forbidden}.`);
}
for (const required of [
  'enterprise_claim_or_resume_evidence_extraction_job_v2',
  'enterprise_ai_extraction_staged_results',
  'enterprise_stage_evidence_extraction_result',
  'enterprise_commit_staged_evidence_extraction',
  "'state','staged'",
  "receipt.execution_plan->>'routeId'",
  "receipt.execution_plan->>'providerConfigId'",
  "receipt.execution_plan->>'model'",
  'stage.safe_result',
]) check(extractionRouteStagingSql.includes(required), `Extraction route/staging correction is missing ${required}.`);
check(extractionRouteStagingSql.indexOf("effect_key='command'")
  < extractionRouteStagingSql.indexOf("job.status IN ('succeeded','failed','blocked')"),
'Recovery must check the canonical effect before terminal job state.');
check(extractionRouteStagingSql.indexOf('enterprise_ai_extraction_staged_results')
  < extractionRouteStagingSql.lastIndexOf("attempt_lease_expires_at>statement_timestamp()"),
'Recovery must inspect staged sanitized output before deciding whether another provider attempt may start.');
check(extractionRouteStagingSql.includes('staged_payload_hash IS DISTINCT FROM p_staged_payload_hash'),
  'Changed staged payloads must conflict.');
check(extractionRouteStagingSql.includes('enterprise_extraction_stage_immutable'),
  'Staged sanitized extraction output must be immutable.');
check(extractionRouteStagingSql.includes('REVOKE ALL ON TABLE public.enterprise_ai_extraction_staged_results FROM PUBLIC,anon,authenticated'),
  'Browser roles must not read staged extraction output.');
for (const forbidden of ['raw_prompt', 'prompt_body', 'raw_completion', 'completion_body', 'provider_key']) {
  check(!extractionRouteStagingSql.includes(forbidden), `Staging schema must not define forbidden field ${forbidden}.`);
}
const extractionCommand = commandSource.slice(
  commandSource.indexOf('const commandEvidenceExtract'),
  commandSource.indexOf('const commandEvidenceCandidateReview'),
);
check(!/insertRow\(['"]enterprise_ai_job_ledger/iu.test(extractionCommand), 'Extraction must not directly insert its job row.');
check(!/updateRows\(['"]enterprise_ai_job_ledger/iu.test(extractionCommand), 'Extraction must not directly patch terminal job state.');
check(extractionCommand.indexOf('enterprise_claim_or_resume_evidence_extraction_job_v2') < extractionCommand.indexOf('runGovernedProviderRequest'), 'Job ownership must precede provider invocation.');
check(extractionCommand.indexOf('readEvidenceExtractionRoutePlan') < extractionCommand.indexOf('resolveRoute('), 'Recovery must read the immutable route plan before any default route resolution.');
check(extractionCommand.includes('{ routeId: routePlan.routeId, model: routePlan.model }'), 'Recovery must request the exact planned route and model.');
check(extractionRouteStagingSql.includes("p_result->>'resourceId' IS DISTINCT FROM p_job_id::text"), 'Staging must bind response resourceId to the planned extraction job.');
check(extractionCommand.includes('const safeResult = { resourceId: jobId, jobId,'), 'Extraction must return an explicit canonical job resourceId.');
check(commandSource.includes("disposition = 'preserve_claimed_receipt'"), 'Transport uncertainty must carry an explicit internal recoverable disposition.');
check(!commandSource.includes("typeof claimedReceipt.execution_plan?.jobId === 'string'"), 'Receipt recovery must not infer transport uncertainty from execution-plan shape.');
check(extractionCommand.indexOf('enterprise_stage_evidence_extraction_result') < extractionCommand.lastIndexOf('commitStagedEvidenceExtraction'), 'Sanitized staging must precede canonical commit.');
const uncertainCommit = commandSource.slice(
  commandSource.indexOf('const commitStagedEvidenceExtraction'),
  commandSource.indexOf('const commandEvidenceExtract'),
);
check(!uncertainCommit.includes('enterprise_fail_evidence_extraction_job'), 'Generic commit uncertainty must never call the extraction failure RPC.');
const resourceResolver = commandSource.slice(
  commandSource.indexOf('export const resolveEnterpriseCommandResourceId'),
  commandSource.indexOf('const ensureExecutionPlan'),
);
check(resourceResolver.includes("commandType === 'evidence.assess.promote'")
  && resourceResolver.includes('? resultObject.assessDraftId'),
'Promotion finalization must bind explicit resourceId to assessDraftId.');
check(resourceResolver.includes('lineageResourceId !== explicitResourceId')
  && !/return\s+resultObject\.sourceId/u.test(resourceResolver),
'Every Enterprise result must fail closed unless explicit resourceId equals command lineage.');
for (const operation of [
  'provider.register', 'provider.secret.bind', 'provider.validate', 'provider.activate',
  'provider.route.toggle', 'provider.secret.rotate', 'provider.revoke',
]) check(sql.includes(`'${operation}'`), `Missing provider lifecycle operation ${operation}`);
check(sql.includes('p_payload ?| forbidden_keys'), 'Provider lifecycle SQL must reject raw secret-bearing payload keys.');
check(sql.includes('rawCompletion|raw_completion'), 'Provider lifecycle SQL must reject nested raw secret/prompt/completion keys.');
check(sql.includes("last_validated_at < statement_timestamp() - interval '24 hours'"), 'Provider activation and route enablement require fresh validation.');
check(sql.includes('roles := route.allowed_roles'), 'Route toggles must preserve allowed roles when omitted.');
check(sql.includes("SET status = 'retired', rotation_status = 'rotated'"), 'Rotation must retire the prior key reference.');
check(sql.includes('SET enabled = false, version = version + 1'), 'Provider revocation must disable routes atomically.');
check(sql.includes('WHERE provider_config_id = config.id AND org_id = p_org AND deleted_at IS NULL'), 'Provider revocation must disable all organization routes across workspaces.');
check(sql.includes('candidate_provenance_hash'), 'Candidate provenance must be retained through promotion.');
check(sql.includes('resource_version') && sql.includes('resource_hash'), 'Review and approval authority must bind exact versions and hashes.');
check(sql.includes('enterprise_reject_mutation'), 'Immutable lineage tables require mutation rejection triggers.');
check(sql.includes("read_only stops all Enterprise Intelligence mutation"), 'A documented read-only rollback fallback is required.');
check(!/live_telemetry_connected\s+BOOLEAN\s+NOT NULL\s+DEFAULT\s+true/i.test(sql), 'Live telemetry must remain disabled.');
check(!/runtime_agents_enabled\s+BOOLEAN\s+NOT NULL\s+DEFAULT\s+true/i.test(sql), 'Runtime agents must remain disabled.');
check(!/deployment_enabled\s+BOOLEAN\s+NOT NULL\s+DEFAULT\s+true/i.test(sql), 'Deployment must remain disabled.');
check(!/readiness\s+TEXT\s+NOT NULL\s+CHECK\s*\([^)]*\bready\b/i.test(sql), 'Monitor authority cannot claim ready in this slice.');
check(sql.includes('FOREIGN KEY (workspace_id, org_id)'), 'Workspace/org composite foreign keys are required.');
check(sql.includes('enterprise_final_acl'), 'Final least-privilege ACL reconciliation is required.');
const finalAcl = sql.indexOf('DO $enterprise_final_acl$');
check(finalAcl > sql.lastIndexOf('GRANT SELECT ON TABLE public.enterprise_'), 'Final ACL revocation must follow all legacy grants.');
check(sql.slice(finalAcl).includes('GRANT SELECT ON TABLE public.%I TO service_role'), 'Service role must receive read-only table access.');
check(!sql.slice(finalAcl).includes('GRANT SELECT ON TABLE public.%I TO authenticated'), 'Authenticated users must not receive raw Enterprise table access.');
check(sql.includes('DROP FUNCTION public.enterprise_commit_delivery_handoff_legacy_untrusted'), 'Untrusted Delivery mutation entry point must be removed.');
check(sql.includes('DROP FUNCTION public.enterprise_commit_modernization_assessment_legacy_untrusted'), 'Untrusted modernization entry point must be removed.');
check(sql.includes('DROP FUNCTION public.enterprise_commit_high_impact_approval_legacy_untrusted'), 'Untrusted approval entry point must be removed.');
check(sql.includes('FUNCTION public.enterprise_command_runtime_area'), 'One exhaustive command-to-runtime-area classifier is required.');
const classifierStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.enterprise_command_runtime_area');
const classifierEnd = sql.indexOf('$$;', classifierStart);
const classifier = sql.slice(classifierStart, classifierEnd);
for (const commandType of [
  'provider.register', 'provider.secret.bind', 'provider.validate', 'provider.activate', 'provider.route.toggle', 'provider.secret.rotate', 'provider.revoke',
  'evidence.source.create', 'evidence.extract', 'evidence.candidate.review', 'evidence.assess.promote',
  'modernization.evaluate', 'studio.delivery.handoff', 'monitor.baseline.create',
  'approval.review.record', 'approval.record', 'assemble.blueprint.create',
]) check(classifier.includes(`'${commandType}'`), `Runtime-area classifier is missing ${commandType}.`);
for (const area of ['provider', 'ingestion', 'delivery', 'assemble']) check(classifier.includes(`'${area}'`), `Runtime-area classifier is missing ${area}.`);
check(classifier.includes("p_resource_type = 'assemble_blueprint'"), 'Approval commands must classify Assemble blueprints separately.');
const receiptFunctions = name => [...sql.matchAll(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$\\$;`, 'g'))].map(match => match[0]);
for (const name of ['enterprise_ai_complete_command', 'enterprise_ai_fail_command']) {
  const bodies = receiptFunctions(name);
  check(bodies.length > 0, `${name} must exist.`);
  check(bodies.every(body => !body.includes('enterprise_assert_writable')), `${name} must finalize durable truth without runtime gating.`);
}
const claims = receiptFunctions('enterprise_ai_claim_command');
const effectiveClaim = claims.findLast(body => body.includes('p_execution_token UUID') && body.includes('enterprise_assert_writable')) || '';
check(effectiveClaim.includes('enterprise_command_runtime_area'), 'Effective claim must use the exhaustive runtime-area classifier.');
check(effectiveClaim.indexOf('SELECT * INTO receipt') < effectiveClaim.indexOf('enterprise_assert_writable'), 'Exact replay must be resolved before runtime validation.');
check(effectiveClaim.indexOf('enterprise_assert_writable') < effectiveClaim.indexOf('INSERT INTO public.enterprise_ai_command_receipts'), 'New commands must be runtime-validated before receipt creation.');
check(sql.includes("runtime_area TEXT NOT NULL CHECK (runtime_area IN ('provider', 'ingestion', 'delivery', 'assemble'))"), 'Receipts must persist their classified runtime area.');
check(!/enterprise_ai_fail_command[\s\S]{0,800}\.catch\(\(\) => undefined\)/u.test(commandSource), 'Receipt failure finalization must not be silently swallowed.');
check(commandSource.includes("RECEIPT_FINALIZATION_FAILED"), 'Genuine finalization failure requires an explicit stable error.');
for (const token of ['initial_request_id', 'execution_fence', 'lease_expires_at', 'reconciliation_count', 'enterprise_ai_effect_journal', 'enterprise_ai_reconcile_command', 'enterprise_ai_reload_command', 'enterprise_effect_journal_immutable']) {
  check(sql.includes(token), `Receipt recovery contract is missing ${token}.`);
}
check(!effectiveClaim.includes('request_id IS DISTINCT FROM p_request'), 'requestId must not be part of logical replay identity.');
check(sql.includes('UNIQUE (org_id, workspace_id, actor_id, command_type, idempotency_key)'), 'Logical receipt identity must include workspace scope.');
check(commandSource.includes('claimEnterpriseReceipt'), 'Command handler must use the shared request-ID-independent receipt coordinator.');
check(commandSource.includes('reloadEnterpriseReceipt'), 'Command handler must reload durable effect truth before reporting finalization failure.');
for (const mutation of [
  'enterprise_create_evidence_source', 'enterprise_commit_evidence_extraction',
  'enterprise_review_evidence_candidate', 'enterprise_promote_evidence_to_assess_v2',
  'enterprise_commit_modernization_assessment', 'enterprise_record_high_impact_review',
  'enterprise_commit_high_impact_approval', 'enterprise_commit_delivery_handoff',
  'enterprise_commit_monitor_baseline', 'enterprise_commit_assemble_blueprint',
]) check(sql.includes(`FUNCTION public.${mutation}`), `Receipt-aware mutation RPC is missing ${mutation}.`);
check(sql.includes('receipt-unaware implementations are private implementation details'), 'Receipt-unaware mutation overloads must be revoked from Edge service authority.');
for (const required of [
  'enterprise_resolve_high_impact_review_authority', 'enterprise_resource_snapshot',
  'enterprise_record_high_impact_review_v2', 'enterprise_commit_high_impact_approval_v2',
  "authority->>'reviewEventId' IS DISTINCT FROM p_review_event_id::text",
  "'resourceHash', event.resource_hash", "'resourceVersion', event.resource_version",
]) check(reviewActionReplaySql.includes(required), `Review/action/replay correction is missing ${required}.`);
check(reviewActionReplaySql.includes('FROM PUBLIC, anon, authenticated'), 'Canonical review authority RPCs must reject browser roles.');
check(reviewActionReplaySql.includes('FROM service_role'), 'Legacy hash-accepting Edge wrappers must be revoked.');
check(reviewActionReplaySql.includes("'approval.review.record', 'command', p_resource_id, result, 'committed'"),
  'Review effect identity must be the reviewed canonical resource.');
const approvalCommandSource = commandSource.slice(
  commandSource.indexOf('const approvalResourceTypes'),
  commandSource.indexOf('type StudioAggregateRow'),
);
check(!approvalCommandSource.includes('sha256Json'), 'Edge approval commands must not compute canonical resource hashes.');
check(!approvalCommandSource.includes('resource_hash=eq.'), 'Edge approval commands must not select reviews by an application hash.');
check(commandSource.includes('requiredCapabilitiesForEnterpriseCommand'), 'Replay authority requires one command-capability map.');
check(commandSource.includes('assertCurrentEnterpriseCommandAuthority'), 'Receipt disclosure requires current operation authority.');
check(commandSource.includes('assertProviderLifecycleOperationAuthority(providerOperation, lifecycleAuthority(current))'),
  'Generic provider commands require provider-specific scope and capability authority.');
check(providerLifecycleEndpointSource.includes('assertProviderLifecycleOperationAuthority'), 'Provider terminal receipt disclosure requires current lifecycle authority.');
check(providerLifecycleEndpointSource.includes('authenticateProviderLifecycle(request, envelope, false)')
  && providerLifecycleEndpointSource.includes('enforceAttemptAuthorizationVersion'),
'Provider replay and finalization must use current authority after authorization-version changes.');
const enterpriseSuccessFinalization = commandSource.slice(
  commandSource.indexOf('const result = await executeCommand'),
  commandSource.indexOf('} catch (error)', commandSource.indexOf('const result = await executeCommand')),
);
check(enterpriseSuccessFinalization.indexOf('await assertCurrentAuthority')
  < enterpriseSuccessFinalization.indexOf('await completeReceipt')
  && enterpriseSuccessFinalization.lastIndexOf('await assertCurrentAuthority')
    > enterpriseSuccessFinalization.indexOf('await completeReceipt'),
'Enterprise success finalization must reauthorize before commit and disclosure.');
const enterpriseFailureFinalization = commandSource.slice(
  commandSource.indexOf("if (claimedReceipt && claimedAuthority && claimedCommandType && commandError.code !== 'RECEIPT_FINALIZATION_FAILED')"),
  commandSource.indexOf('export const handleEnterpriseIntelligenceOptions'),
);
check(enterpriseFailureFinalization.indexOf('await assertCurrentAuthority')
  < enterpriseFailureFinalization.indexOf('await failReceipt')
  && enterpriseFailureFinalization.lastIndexOf('await assertCurrentAuthority')
    > enterpriseFailureFinalization.indexOf('await failReceipt'),
'Enterprise failure finalization must reauthorize before commit and disclosure.');
const providerSuccessFinalization = providerLifecycleEndpointSource.slice(
  providerLifecycleEndpointSource.indexOf('const result = await (overrides.executeCommand || executeProviderLifecycleCommand)'),
  providerLifecycleEndpointSource.indexOf('} catch (error)', providerLifecycleEndpointSource.indexOf('const result = await (overrides.executeCommand || executeProviderLifecycleCommand)')),
);
check(providerSuccessFinalization.indexOf('await reauthorizeProviderLifecycle')
  < providerSuccessFinalization.indexOf('overrides.completeReceipt || completeEnterpriseReceipt')
  && providerSuccessFinalization.lastIndexOf('await reauthorizeProviderLifecycle')
    > providerSuccessFinalization.indexOf('overrides.completeReceipt || completeEnterpriseReceipt'),
'Provider success finalization must reauthorize before commit and disclosure.');
const providerFailureFinalization = providerLifecycleEndpointSource.slice(
  providerLifecycleEndpointSource.indexOf("safeError.code !== 'AUTHORIZATION_STALE'"),
  providerLifecycleEndpointSource.indexOf('if (claimedReceipt && claimedAuthority && claimedEnvelope) {', providerLifecycleEndpointSource.indexOf("safeError.code !== 'AUTHORIZATION_STALE'")),
);
check(providerFailureFinalization.indexOf('await reauthorizeProviderLifecycle')
  < providerFailureFinalization.indexOf('overrides.failReceipt || failEnterpriseReceipt')
  && providerFailureFinalization.lastIndexOf('await reauthorizeProviderLifecycle')
    > providerFailureFinalization.indexOf('overrides.failReceipt || failEnterpriseReceipt'),
'Provider failure finalization must reauthorize before commit and disclosure.');

console.log(`Enterprise Intelligence migration contract: ${assertions} strict schema, provenance, lifecycle, ACL, and rollback assertions passed.`);
