import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const requiredFiles = [
  'services/enterpriseIntelligence.ts',
  'services/enterpriseIntelligenceClient.ts',
  'components/enterprise/EnterpriseIntelligenceView.tsx',
  'supabase/functions/_shared/enterpriseIntelligenceAi.ts',
  'supabase/functions/_shared/enterpriseIntelligenceCommand.ts',
  'supabase/functions/_shared/enterpriseIntelligenceQuery.ts',
  'supabase/functions/_shared/enterpriseReceipt.ts',
  'supabase/functions/_shared/providerLifecycle.ts',
  'supabase/functions/_shared/providerLifecycleEndpoint.ts',
  'supabase/functions/enterprise-intelligence-command/index.ts',
  'supabase/functions/enterprise-intelligence-query/index.ts',
  'supabase/functions/enterprise-provider-lifecycle/index.ts',
  'supabase/migrations/20260804120000_enterprise_intelligence_authority.sql',
  'supabase/migrations/20260805120000_provider_lifecycle_authorization_attempts.sql',
  'supabase/migrations/20260805140000_enterprise_intelligence_ready_review_corrections.sql',
  'supabase/migrations/20260805150000_enterprise_atomic_candidate_promotion.sql',
  'supabase/migrations/20260805160000_enterprise_rpc_error_and_extraction_recovery.sql',
  'supabase/migrations/20260807120000_enterprise_review_action_replay_authority.sql',
];

const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const missing = requiredFiles.filter(relativePath => !fs.existsSync(path.join(root, relativePath)));
if (missing.length) throw new Error(`Missing Enterprise Intelligence files: ${missing.join(', ')}`);

const featureText = requiredFiles.map(read).join('\n');
const forbidden = [
  /VITE_(?:GEMINI|GROQ)_API_KEY/i,
  /StorageKeys\.API_KEY/,
  /localStorage/,
  /new\s+(?:Gemini|Groq)Provider/,
  /fallbackProvider/,
  /Falling back/i,
];
const hits = forbidden.filter(pattern => pattern.test(featureText));
if (hits.length) throw new Error(`Enterprise Intelligence boundary scan failed: ${hits.map(String).join(', ')}`);

const command = read('supabase/functions/_shared/enterpriseIntelligenceCommand.ts');
const client = read('services/enterpriseIntelligenceClient.ts');
const providerResolver = read('supabase/functions/_shared/providerResolver.ts');
const supabaseRpc = read('supabase/functions/_shared/supabase.ts');
for (const required of ['resolveOrgId', 'resolveAuthority', 'enterprise_claim_or_resume_evidence_extraction_job', 'runGovernedProviderRequest', 'RESOURCE_STALE', 'evidence.assess.promote', 'enterprise_promote_evidence_batch_to_assess_v2']) {
  if (!command.includes(required)) throw new Error(`Enterprise command boundary is missing ${required}.`);
}
if (/payload\.(?:sourceVersionId|assessmentVersionId|studioVersion|studioContentHash|packageVersionId|approvedItemIds)\b/u.test(command)) {
  throw new Error('Enterprise commands may not accept browser-supplied authoritative versions, hashes, or item identifiers.');
}
const approvalCommands = command.slice(
  command.indexOf('const approvalResourceTypes'),
  command.indexOf('type StudioAggregateRow'),
);
if (approvalCommands.includes('sha256Json') || approvalCommands.includes('resource_hash=eq.')) {
  throw new Error('Approval authority must not use an application-computed hash or an Edge hash-filtered review lookup.');
}
for (const required of [
  'enterprise_resolve_high_impact_review_authority',
  'enterprise_record_high_impact_review_v2',
  'enterprise_commit_high_impact_approval_v2',
]) {
  if (!approvalCommands.includes(required)) throw new Error(`Canonical approval command flow is missing ${required}.`);
}
if (client.includes('stableFingerprint(material)') || client.includes("subtle.digest('SHA-256'")) {
  throw new Error('Browser action idempotency keys must not be deterministic payload hashes.');
}
if (!client.includes('createEnterpriseActionIdempotencyKey(input.commandType)')
  || !client.includes('createEnterpriseActionIdempotencyKey(input.operation)')) {
  throw new Error('Both command surfaces require fresh cryptographic per-action keys.');
}
for (const invocation of ['enterprise-intelligence-command', 'enterprise-provider-lifecycle']) {
  const start = client.indexOf(`supabase.functions.invoke('${invocation}'`);
  const retry = client.indexOf(`supabase.functions.invoke('${invocation}'`, start + 1);
  if (start < 0 || retry < 0 || !client.slice(start, retry + 120).includes('{ body }')) {
    throw new Error(`${invocation} transport retry must reuse the exact constructed body.`);
  }
}
if (!command.includes('requiredCapabilitiesForEnterpriseCommand')
  || !command.includes('assertCurrentEnterpriseCommandAuthority')) {
  throw new Error('Enterprise receipt replay requires one reusable operation-specific authority mapping.');
}
if (!command.includes('assertProviderLifecycleOperationAuthority(providerOperation, lifecycleAuthority(current))')
  || !command.includes('const enterpriseProviderOperations')) {
  throw new Error('Generic provider commands must use exact provider lifecycle authority.');
}
const claimIndex = command.indexOf('const { receipt, ownsExecution } = await (overrides.claimReceipt || claimEnterpriseReceipt)');
const authorityAlias = command.lastIndexOf(
  'const assertCurrentAuthority = overrides.assertCurrentAuthority || assertCurrentEnterpriseCommandAuthority',
  claimIndex,
);
const preclaimAuthority = command.lastIndexOf('await assertCurrentAuthority', claimIndex);
const committedReturn = command.indexOf("if (receipt.status === 'committed')", claimIndex);
const postclaimAuthority = command.indexOf('await assertCurrentAuthority', claimIndex);
if (!(authorityAlias >= 0 && authorityAlias < preclaimAuthority
  && preclaimAuthority >= 0 && preclaimAuthority < claimIndex
  && postclaimAuthority > claimIndex && postclaimAuthority < committedReturn)) {
  throw new Error('Current operation authority must be checked before claim and before terminal receipt disclosure.');
}
const enterpriseSuccessFinalization = command.slice(
  command.indexOf('const result = await executeCommand'),
  command.indexOf('} catch (error)', command.indexOf('const result = await executeCommand')),
);
if (!(enterpriseSuccessFinalization.indexOf('await assertCurrentAuthority')
  < enterpriseSuccessFinalization.indexOf('await completeReceipt')
  && enterpriseSuccessFinalization.lastIndexOf('await assertCurrentAuthority')
    > enterpriseSuccessFinalization.indexOf('await completeReceipt'))) {
  throw new Error('Enterprise success finalization requires current authority both before commit and before disclosure.');
}
const enterpriseFailureFinalization = command.slice(
  command.indexOf("if (claimedReceipt && claimedAuthority && claimedCommandType && commandError.code !== 'RECEIPT_FINALIZATION_FAILED')"),
  command.indexOf('export const handleEnterpriseIntelligenceOptions'),
);
if (!(enterpriseFailureFinalization.indexOf('await assertCurrentAuthority')
  < enterpriseFailureFinalization.indexOf('await failReceipt')
  && enterpriseFailureFinalization.lastIndexOf('await assertCurrentAuthority')
    > enterpriseFailureFinalization.indexOf('await failReceipt'))) {
  throw new Error('Enterprise failure finalization requires current authority both before commit and before disclosure.');
}
const enterpriseRecovery = command.slice(
  command.indexOf('if (claimedReceipt && claimedAuthority && claimedCommandType) {'),
  command.indexOf("if (claimedReceipt && claimedAuthority && claimedCommandType && commandError.code !== 'RECEIPT_FINALIZATION_FAILED')"),
);
if (!(enterpriseRecovery.indexOf('await assertCurrentAuthority') >= 0
  && enterpriseRecovery.indexOf('await assertCurrentAuthority') < enterpriseRecovery.indexOf('reloadEnterpriseReceipt')
  && enterpriseRecovery.lastIndexOf('await assertCurrentAuthority') > enterpriseRecovery.indexOf('reloadEnterpriseReceipt'))) {
  throw new Error('Enterprise effect recovery requires exact current authority before reconciliation and again before disclosure.');
}
if (!command.includes('enterpriseCommandStatusForTerminalReceipt(receipt)')
  || !command.includes('enterpriseCommandStatusForTerminalReceipt(recovered)')) {
  throw new Error('Enterprise terminal replay must derive HTTP status from the persisted stable product error.');
}
if (!command.includes("new RecoverableEnterpriseCommandError('AUTHORIZATION_STALE')")
  || !command.includes("error.code === 'AUTHORIZATION_STALE'")) {
  throw new Error('Authorization-stale Enterprise receipts must retain the recoverable claimed disposition.');
}

const view = read('components/enterprise/EnterpriseIntelligenceView.tsx');
for (const pattern of [/placeholder=["'`]UUID/iu, /\b(?:studioContentHash|studioVersion|assessmentVersionId|packageVersionId|approvedItemIds|secretReference)\b/u]) {
  if (pattern.test(view)) throw new Error(`Enterprise UI exposes a raw authority input: ${pattern}.`);
}
for (const required of ['loadProjection', 'Reload committed state', 'projection reload failed', 'type="password"']) {
  if (!view.includes(required)) throw new Error(`Enterprise UI is missing reloadable projection behavior: ${required}.`);
}

const migration = read('supabase/migrations/20260804120000_enterprise_intelligence_authority.sql');
for (const required of ['FORCE ROW LEVEL SECURITY', 'enterprise_ai_command_receipts', 'enterprise_evidence_source_versions', 'enterprise_high_impact_approval_separation_check', 'live_telemetry_connected BOOLEAN NOT NULL DEFAULT false']) {
  if (!migration.includes(required)) throw new Error(`Enterprise migration invariant is missing ${required}.`);
}
const functionBodies = name => [...migration.matchAll(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$\\$;`, 'g'))].map(match => match[0]);
const classifier = functionBodies('enterprise_command_runtime_area').at(-1) || '';
for (const commandType of [
  'provider.register', 'provider.secret.bind', 'provider.validate', 'provider.activate', 'provider.route.toggle', 'provider.secret.rotate', 'provider.revoke',
  'evidence.source.create', 'evidence.extract', 'evidence.candidate.review', 'evidence.assess.promote',
  'modernization.evaluate', 'studio.delivery.handoff', 'monitor.baseline.create',
  'approval.review.record', 'approval.record', 'assemble.blueprint.create',
]) {
  if (!classifier.includes(`'${commandType}'`)) throw new Error(`Runtime-area classifier is missing ${commandType}.`);
}
for (const name of ['enterprise_ai_complete_command', 'enterprise_ai_fail_command']) {
  if (functionBodies(name).some(body => body.includes('enterprise_assert_writable'))) {
    throw new Error(`${name} must not gate durable receipt finalization on runtime controls.`);
  }
}
const effectiveClaim = functionBodies('enterprise_ai_claim_command').findLast(body => body.includes('p_execution_token UUID') && body.includes('enterprise_assert_writable')) || '';
if (!effectiveClaim.includes('enterprise_command_runtime_area')) throw new Error('New receipt claims require exhaustive runtime-area classification.');
if (effectiveClaim.indexOf('SELECT * INTO receipt') > effectiveClaim.indexOf('enterprise_assert_writable')) throw new Error('Exact replay must be resolved before current runtime controls.');
if (effectiveClaim.indexOf('enterprise_assert_writable') > effectiveClaim.indexOf('INSERT INTO public.enterprise_ai_command_receipts')) throw new Error('New receipt claims must validate runtime controls before insertion.');
if (/enterprise_ai_fail_command[\s\S]{0,800}\.catch\(\(\) => undefined\)/u.test(command)) throw new Error('Receipt finalization errors must not be silently swallowed.');
if (!command.includes('RECEIPT_FINALIZATION_FAILED')) throw new Error('Receipt finalization failure requires explicit sanitized evidence.');
if (!command.includes('reloadEnterpriseReceipt')) throw new Error('Command recovery must reload terminal receipts and durable effect evidence.');
const providerEndpoint = read('supabase/functions/_shared/providerLifecycleEndpoint.ts');
const receiptHelper = read('supabase/functions/_shared/enterpriseReceipt.ts');
for (const required of ['requestId', 'idempotencyKey', 'providerLifecycleRequestHash', 'reloadEnterpriseReceipt']) {
  if (!providerEndpoint.includes(required)) throw new Error(`Provider lifecycle receipt boundary is missing ${required}.`);
}
const providerHash = providerEndpoint.match(/export const providerLifecycleRequestHash[\s\S]*?\n\};/u)?.[0] || '';
if (providerHash.includes('expectedAuthorizationVersion') || providerHash.includes('requestId')) {
  throw new Error('Provider receipt identity must exclude attempt authorization versions and request correlation IDs.');
}
if (!providerEndpoint.includes('authenticateProviderLifecycle(request, envelope, false)')
  || !providerEndpoint.includes('enforceAttemptAuthorizationVersion')) {
  throw new Error('Provider replay/finalization must resolve current authority without pinning the original attempt version.');
}
const providerClaimIndex = providerEndpoint.indexOf('const { receipt, ownsExecution }');
if (!(providerEndpoint.lastIndexOf('assertProviderLifecycleOperationAuthority(envelope.operation, authority)', providerClaimIndex)
  < providerClaimIndex
  && providerEndpoint.lastIndexOf('assertProviderLifecycleOperationAuthority(envelope.operation, authority)', providerClaimIndex) >= 0)) {
  throw new Error('Provider claim-time effect reconciliation requires exact operation authority before the claim RPC.');
}
const providerRecovery = providerEndpoint.slice(
  providerEndpoint.indexOf('if (claimedReceipt && claimedAuthority && claimedOperation && claimedEnvelope) {'),
  providerEndpoint.indexOf("safeError.code !== 'RECEIPT_FINALIZATION_FAILED'"),
);
if (!(providerRecovery.indexOf('await reauthorizeProviderLifecycle') >= 0
  && providerRecovery.indexOf('await reauthorizeProviderLifecycle') < providerRecovery.indexOf('reloadEnterpriseReceipt')
  && providerRecovery.lastIndexOf('await reauthorizeProviderLifecycle') > providerRecovery.indexOf('reloadEnterpriseReceipt'))) {
  throw new Error('Provider effect recovery requires exact operation authority before reconciliation and again before disclosure.');
}
for (const helper of ['completeEnterpriseReceipt', 'failEnterpriseReceipt']) {
  const body = receiptHelper.slice(receiptHelper.indexOf(`export const ${helper}`), receiptHelper.indexOf('\n};', receiptHelper.indexOf(`export const ${helper}`)) + 3);
  if (!(body.includes('authorizeReconciliation: EnterpriseReceiptReconciliationAuthorizer')
    && body.indexOf('await authorizeReconciliation()') < body.indexOf('reconcileEnterpriseReceipt('))) {
    throw new Error(`${helper} must reauthorize before any effect-journal reconciliation.`);
  }
}
const providerSuccessFinalization = providerEndpoint.slice(
  providerEndpoint.indexOf('const result = await (overrides.executeCommand || executeProviderLifecycleCommand)'),
  providerEndpoint.indexOf('} catch (error)', providerEndpoint.indexOf('const result = await (overrides.executeCommand || executeProviderLifecycleCommand)')),
);
if (!(providerSuccessFinalization.indexOf('await reauthorizeProviderLifecycle')
  < providerSuccessFinalization.indexOf('overrides.completeReceipt || completeEnterpriseReceipt')
  && providerSuccessFinalization.lastIndexOf('await reauthorizeProviderLifecycle')
    > providerSuccessFinalization.indexOf('overrides.completeReceipt || completeEnterpriseReceipt'))) {
  throw new Error('Provider success finalization requires operation authority both before commit and before disclosure.');
}
const providerFailureFinalization = providerEndpoint.slice(
  providerEndpoint.indexOf("safeError.code !== 'AUTHORIZATION_STALE'"),
  providerEndpoint.indexOf('if (claimedReceipt && claimedAuthority && claimedEnvelope) {', providerEndpoint.indexOf("safeError.code !== 'AUTHORIZATION_STALE'")),
);
if (!(providerFailureFinalization.indexOf('await reauthorizeProviderLifecycle')
  < providerFailureFinalization.indexOf('overrides.failReceipt || failEnterpriseReceipt')
  && providerFailureFinalization.lastIndexOf('await reauthorizeProviderLifecycle')
    > providerFailureFinalization.indexOf('overrides.failReceipt || failEnterpriseReceipt'))) {
  throw new Error('Provider failure finalization requires operation authority both before commit and before disclosure.');
}
const providerLifecycle = read('supabase/functions/_shared/providerLifecycle.ts');
for (const required of ['cleanupRequired', 'cleanupCompleted', 'cleanupTerminalCode', 'AUTHORIZATION_STALE']) {
  if (!providerLifecycle.includes(required)) throw new Error(`Provider cleanup/recovery boundary is missing ${required}.`);
}
const providerAuthorizationCorrection = read('supabase/migrations/20260805120000_provider_lifecycle_authorization_attempts.sql');
for (const required of [
  'current_authorization IS DISTINCT FROM p_authorization_version',
  'ENTERPRISE_PROVIDER_AUTHORIZATION_VERSION_STALE',
  'ENTERPRISE_PROVIDER_ORGANIZATION_AUTHORITY_REQUIRED',
  'enterprise_ai_record_effect',
]) {
  if (!providerAuthorizationCorrection.includes(required)) {
    throw new Error(`Provider authorization-attempt correction is missing ${required}.`);
  }
}
const readyReviewCorrection = read('supabase/migrations/20260805140000_enterprise_intelligence_ready_review_corrections.sql');
for (const required of [
  'enterprise_provider_route_role_guard', 'enterprise_create_evidence_source_record',
  'enterprise_record_source_extraction_success', 'ENTERPRISE_EVIDENCE_EDIT_HISTORY_REQUIRED',
]) {
  if (!readyReviewCorrection.includes(required)) throw new Error(`Ready-review correction is missing ${required}.`);
}
const providerCommittedReturn = providerEndpoint.indexOf("if (receipt.status === 'committed')");
const providerReplayAuthority = providerEndpoint.indexOf('reauthorizeProviderLifecycle', providerCommittedReturn);
const providerReauthorizeHelper = providerEndpoint.slice(
  providerEndpoint.indexOf('const reauthorizeProviderLifecycle'),
  providerEndpoint.indexOf('export const providerLifecycleRequestHash'),
);
if (!(providerCommittedReturn >= 0 && providerReplayAuthority > providerCommittedReturn)
  || !providerReauthorizeHelper.includes('assertProviderLifecycleOperationAuthority')) {
  throw new Error('Provider terminal receipt disclosure requires operation-specific authorization.');
}
const extractionCommand = command.slice(
  command.indexOf('const commandEvidenceExtract'),
  command.indexOf('const commandEvidenceCandidateReview'),
);
if (/insertRow\(['"]enterprise_ai_job_ledger/iu.test(extractionCommand)) {
  throw new Error('Evidence extraction jobs must be claimed or resumed through the fenced service RPC.');
}
if (/updateRows\(['"]enterprise_ai_job_ledger/iu.test(extractionCommand)) {
  throw new Error('Evidence extraction terminal state must be receipt-atomic, not a direct table patch.');
}
if (!(extractionCommand.indexOf('enterprise_claim_or_resume_evidence_extraction_job_v2')
  < extractionCommand.indexOf('runGovernedProviderRequest'))) {
  throw new Error('Evidence extraction must own the fenced job attempt before provider invocation.');
}
const supabaseTransport = read('supabase/functions/_shared/supabase.ts');
if (!supabaseTransport.includes('class SupabaseRpcError') || !supabaseTransport.includes('await response.text()')) {
  throw new Error('RPC failures require one typed, single-read internal error boundary.');
}
if (/message\.includes\(['"]ENTERPRISE_/u.test(command)
  || /message\.includes\(['"]ENTERPRISE_/u.test(read('supabase/functions/_shared/enterpriseReceipt.ts'))
  || /message\.includes\(['"]ENTERPRISE_/u.test(read('supabase/functions/_shared/providerLifecycle.ts'))) {
  throw new Error('Domain errors must be mapped from structured RPC fields, not flattened message strings.');
}
const atomicPromotion = read('supabase/migrations/20260805150000_enterprise_atomic_candidate_promotion.sql');
const extractionRecovery = read('supabase/migrations/20260805160000_enterprise_rpc_error_and_extraction_recovery.sql');
const reviewAuthorityCorrection = read('supabase/migrations/20260807120000_enterprise_review_action_replay_authority.sql');
for (const required of [
  'enterprise_resource_snapshot', 'enterprise_resolve_high_impact_review_authority',
  'enterprise_record_high_impact_review_v2', 'enterprise_commit_high_impact_approval_v2',
  'FROM PUBLIC, anon, authenticated', 'TO service_role',
]) {
  if (!reviewAuthorityCorrection.includes(required)) {
    throw new Error(`Canonical review authority correction is missing ${required}.`);
  }
}
if (!reviewAuthorityCorrection.includes('FROM service_role')) {
  throw new Error('Legacy Edge hash/review-identity wrappers must be revoked from service_role.');
}
const extractionRouteStaging = read('supabase/migrations/20260805170000_enterprise_extraction_route_and_staging.sql');
for (const required of [
  'enterprise_claim_or_resume_evidence_extraction_job', 'enterprise_fail_evidence_extraction_job',
  'receipt_id', 'source_version_id', 'request_hash', 'execution_token', 'execution_fence',
  'attempt_lease_expires_at', 'attempt_count', 'recovery_count', 'enterprise_ai_job_attempts',
  'does not claim exactly-once provider invocation',
]) {
  if (!extractionRecovery.includes(required)) throw new Error(`Extraction recovery contract is missing ${required}.`);
}
const extractionClaimSql = extractionRecovery.slice(
  extractionRecovery.indexOf('CREATE OR REPLACE FUNCTION public.enterprise_claim_or_resume_evidence_extraction_job'),
  extractionRecovery.indexOf('CREATE OR REPLACE FUNCTION public.enterprise_fail_evidence_extraction_job'),
);
if (!extractionClaimSql.includes('p_job_id,p_org,p_workspace,p_capability')) {
  throw new Error('Extraction recovery must insert only the stable planned job ID.');
}
if (extractionClaimSql.includes('gen_random_uuid()')) {
  throw new Error('Extraction recovery must never generate a replacement job ID.');
}
for (const forbidden of ['raw_prompt', 'prompt_body', 'raw_completion', 'completion_body', 'provider_key', 'authorization']) {
  if (extractionRecovery.includes(forbidden)) throw new Error(`Extraction job/attempt ledger contains forbidden field ${forbidden}.`);
}
for (const required of [
  'enterprise_claim_or_resume_evidence_extraction_job_v2',
  'enterprise_ai_extraction_staged_results',
  'enterprise_stage_evidence_extraction_result',
  'enterprise_commit_staged_evidence_extraction',
  "receipt.execution_plan->>'routeId'",
  "receipt.execution_plan->>'model'",
]) {
  if (!extractionRouteStaging.includes(required)) throw new Error(`Extraction route/staging contract is missing ${required}.`);
}
if (!(extractionCommand.indexOf('readEvidenceExtractionRoutePlan') < extractionCommand.indexOf('resolveRoute('))) {
  throw new Error('Recovered extraction must read its immutable route plan before route resolution.');
}
if (!extractionCommand.includes('{ routeId: routePlan.routeId, model: routePlan.model }')) {
  throw new Error('Recovered extraction must revalidate the exact planned route and model.');
}
if (!providerResolver.includes('validateEnterpriseExactRouteModel')
  || !providerResolver.includes('plannedModel !== currentRouteModel')) {
  throw new Error('A planned extraction model must equal the exact route current model.');
}
const exactRouteModelValidation = providerResolver.slice(
  providerResolver.indexOf('export const validateEnterpriseExactRouteModel'),
  providerResolver.indexOf('const normalizeProvider'),
);
if (exactRouteModelValidation.includes('default_model')) {
  throw new Error('Exact-route validation must not substitute the provider-config default model.');
}
if (!supabaseRpc.includes('class SupabaseRpcTransportError')
  || !supabaseRpc.includes("'response_decode_failed'")
  || !supabaseRpc.includes("'response_read_failed'")
  || !supabaseRpc.includes("'transient_http_502'")
  || !supabaseRpc.includes("'transient_http_503'")
  || !supabaseRpc.includes("'transient_http_504'")) {
  throw new Error('RPC transport and response-decode uncertainty must remain typed and bounded.');
}
if (!supabaseRpc.includes('governedRpcDomainSignals')
  || !supabaseRpc.includes('rpcErrorHasGovernedDomainSignal')
  || !supabaseRpc.includes('transientRpcHttpClassification(response.status)')) {
  throw new Error('Transient RPC responses require exact governed-domain classification.');
}
if (/catch\s*\{\s*\/\* discard unreadable response bodies \*\/\s*\}/u.test(supabaseRpc)
  || /throw parseRpcFailure\(response\.status, body\)/u.test(supabaseRpc)) {
  throw new Error('Unreadable or transient RPC responses must not become unconditional database failures.');
}
if (!command.includes("disposition = 'preserve_claimed_receipt'")
  || command.includes("typeof claimedReceipt.execution_plan?.jobId === 'string'")) {
  throw new Error('Extraction uncertainty must use an explicit internal disposition, not receipt-shape inference.');
}
if (!extractionCommand.includes('const safeResult = { resourceId: jobId, jobId,')) {
  throw new Error('Extraction responses must identify the job as the canonical receipt resource.');
}
if (!extractionRouteStaging.includes("p_result->>'resourceId' IS DISTINCT FROM p_job_id::text")) {
  throw new Error('Staging must bind the sanitized response resource to the extraction job.');
}
if (!(extractionCommand.indexOf('enterprise_stage_evidence_extraction_result')
  < extractionCommand.lastIndexOf('commitStagedEvidenceExtraction'))) {
  throw new Error('A sanitized staged result must exist before canonical extraction commit.');
}
const uncertainCommit = command.slice(
  command.indexOf('const commitStagedEvidenceExtraction'),
  command.indexOf('const commandEvidenceExtract'),
);
if (uncertainCommit.includes('enterprise_fail_evidence_extraction_job')) {
  throw new Error('Generic staging/commit uncertainty must not terminalize the extraction job.');
}
if (!uncertainCommit.includes('throw mapExtractionPersistenceError(error)')) {
  throw new Error('Canonical extraction commit uncertainty must preserve the claimed receipt.');
}
const stageUncertainty = extractionCommand.slice(
  extractionCommand.indexOf("rpc('enterprise_stage_evidence_extraction_result'"),
  extractionCommand.lastIndexOf('await commitStagedEvidenceExtraction'),
);
if (!stageUncertainty.includes('throw mapExtractionPersistenceError(error)')
  || stageUncertainty.includes('failEvidenceExtractionAttempt')) {
  throw new Error('Extraction staging uncertainty must preserve the receipt without failure authority.');
}
const promotionCommand = command.slice(
  command.indexOf('const commandEvidenceAssessPromote'),
  command.indexOf('const assertApprovedApplicationAssessment'),
);
if (/for\s*\([^)]*candidate[^)]*\)[\s\S]*?rpc\(['"]enterprise_promote_evidence_to_assess_v2/iu.test(promotionCommand)) {
  throw new Error('Assess candidate promotion must not loop over the single-candidate RPC.');
}
if ((promotionCommand.match(/enterprise_promote_evidence_batch_to_assess_v2/gu) || []).length !== 1) {
  throw new Error('One Assess promotion command must issue exactly one batch promotion RPC.');
}
const completeValidation = atomicPromotion.indexOf('-- All preconditions are now locked and valid.');
const firstPromotionMutation = atomicPromotion.indexOf('INSERT INTO public.assess_v2_case_versions');
if (!(completeValidation >= 0 && firstPromotionMutation > completeValidation)) {
  throw new Error('Assess batch promotion must complete set validation before its first mutation.');
}
const batchEffect = atomicPromotion.indexOf('PERFORM public.enterprise_ai_record_effect');
const batchReturn = atomicPromotion.indexOf('RETURN result;', batchEffect);
if (!(batchEffect > firstPromotionMutation && batchReturn > batchEffect)) {
  throw new Error('Assess batch promotion must journal its one receipt effect before success.');
}
if (!atomicPromotion.includes("'resourceId', assess_case.id")) {
  throw new Error('Assess batch promotion must return the Assess draft as its canonical resource ID.');
}
const resourceResolver = command.slice(
  command.indexOf('export const resolveEnterpriseCommandResourceId'),
  command.indexOf('const ensureExecutionPlan'),
);
if (!resourceResolver.includes("commandType === 'evidence.assess.promote'")
  || !resourceResolver.includes('? resultObject.assessDraftId')
  || !resourceResolver.includes('lineageResourceId !== explicitResourceId')
  || /return\s+resultObject\.sourceId/u.test(resourceResolver)) {
  throw new Error('Every Enterprise command must require explicit canonical resource identity and exact lineage equality.');
}
if (!reviewAuthorityCorrection.includes("'approval.review.record', 'command', p_resource_id, result, 'committed'")) {
  throw new Error('Review effects must journal the reviewed resource, not the review-event row.');
}
const browserClient = read('services/enterpriseIntelligenceClient.ts');
for (const required of ['FunctionsFetchError', 'FunctionsRelayError', 'isRetryableTransportError(invocation.error)']) {
  if (!browserClient.includes(required)) throw new Error(`Browser retry contract is missing ${required}.`);
}
if (/if \(invocation\.error\) invocation = await supabase\.functions\.invoke/u.test(browserClient)) {
  throw new Error('Browser retry must not replay application-level HTTP failures.');
}

console.log('Enterprise Intelligence source-boundary scan passed.');
