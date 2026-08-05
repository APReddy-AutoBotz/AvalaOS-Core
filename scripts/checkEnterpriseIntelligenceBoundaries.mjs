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
for (const required of ['resolveOrgId', 'resolveAuthority', 'enterprise_claim_or_resume_evidence_extraction_job', 'runGovernedProviderRequest', 'RESOURCE_STALE', 'evidence.assess.promote', 'enterprise_promote_evidence_batch_to_assess_v2']) {
  if (!command.includes(required)) throw new Error(`Enterprise command boundary is missing ${required}.`);
}
if (/payload\.(?:sourceVersionId|assessmentVersionId|studioVersion|studioContentHash|packageVersionId|approvedItemIds)\b/u.test(command)) {
  throw new Error('Enterprise commands may not accept browser-supplied authoritative versions, hashes, or item identifiers.');
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
for (const required of ['requestId', 'idempotencyKey', 'providerLifecycleRequestHash', 'reloadEnterpriseReceipt']) {
  if (!providerEndpoint.includes(required)) throw new Error(`Provider lifecycle receipt boundary is missing ${required}.`);
}
const providerHash = providerEndpoint.match(/export const providerLifecycleRequestHash[\s\S]*?\n\};/u)?.[0] || '';
if (providerHash.includes('expectedAuthorizationVersion') || providerHash.includes('requestId')) {
  throw new Error('Provider receipt identity must exclude attempt authorization versions and request correlation IDs.');
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
if (!(extractionCommand.indexOf('enterprise_claim_or_resume_evidence_extraction_job')
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
const promotionResourceGuard = resourceResolver.indexOf("commandType === 'evidence.assess.promote'");
const sourceIdFallback = resourceResolver.indexOf('typeof resultObject.sourceId');
if (!(resourceResolver.includes('resultObject.assessDraftId !== explicitResourceId')
  && promotionResourceGuard >= 0 && sourceIdFallback > promotionResourceGuard)) {
  throw new Error('Assess promotion must fail closed before sourceId can become its receipt resource.');
}
const browserClient = read('services/enterpriseIntelligenceClient.ts');
for (const required of ['FunctionsFetchError', 'FunctionsRelayError', 'isRetryableTransportError(invocation.error)']) {
  if (!browserClient.includes(required)) throw new Error(`Browser retry contract is missing ${required}.`);
}
if (/if \(invocation\.error\) invocation = await supabase\.functions\.invoke/u.test(browserClient)) {
  throw new Error('Browser retry must not replay application-level HTTP failures.');
}

console.log('Enterprise Intelligence source-boundary scan passed.');
