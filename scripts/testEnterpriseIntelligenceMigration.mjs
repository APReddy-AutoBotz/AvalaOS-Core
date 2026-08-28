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
const providerCleanupDeadlineSql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260807140000_provider_secret_cleanup_deadline.sql'),
  'utf8',
);
const modernizationCurrentSql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260808120000_enterprise_modernization_current_assessment.sql'),
  'utf8',
);
const modernizationCanonicalSql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260808130000_enterprise_modernization_canonical_projection.sql'),
  'utf8',
);
const sourceUploadRecoverySql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260808140000_enterprise_source_upload_recovery.sql'),
  'utf8',
);
const evidenceLocatorAuthoritySql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260808150000_enterprise_evidence_locator_authority.sql'),
  'utf8',
);
const assessEvidenceSubmissionSql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260808160000_enterprise_assess_evidence_submission_contract.sql'),
  'utf8',
);
const promotionAncestrySql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260808170000_enterprise_promotion_ancestry_preservation.sql'),
  'utf8',
);
const promotionAncestryPreflightSql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260808180000_enterprise_promotion_ancestry_dirty_history_preflight.sql'),
  'utf8',
);
const enterpriseDomainSource = fs.readFileSync(path.join(process.cwd(), 'services/enterpriseIntelligence.ts'), 'utf8');
const commandSource = fs.readFileSync(path.join(process.cwd(), 'supabase/functions/_shared/enterpriseIntelligenceCommand.ts'), 'utf8');
const storageSource = fs.readFileSync(path.join(process.cwd(), 'supabase/functions/_shared/storage.ts'), 'utf8');
const storageBoundarySource = fs.readFileSync(path.join(process.cwd(), 'supabase/functions/_shared/storageBoundary.ts'), 'utf8');
const ingestionSource = fs.readFileSync(path.join(process.cwd(), 'supabase/functions/_shared/enterpriseIntelligenceIngestion.ts'), 'utf8');
const querySource = fs.readFileSync(path.join(process.cwd(), 'supabase/functions/_shared/enterpriseIntelligenceQuery.ts'), 'utf8');
const providerLifecycleSource = fs.readFileSync(path.join(process.cwd(), 'supabase/functions/_shared/providerLifecycle.ts'), 'utf8');
const providerLifecycleEndpointSource = fs.readFileSync(path.join(process.cwd(), 'supabase/functions/_shared/providerLifecycleEndpoint.ts'), 'utf8');
const providerSecretAdapterSource = fs.readFileSync(path.join(process.cwd(), 'supabase/functions/_shared/providerSecretAdapter.ts'), 'utf8');
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
const canonicalModernizationTranslations = new Map([
  ['Retain and monitor', 'retain'],
  ['Enable native API/event integration', 'integrate'],
  ['Add API façade and semantic translation', 'api_enable_wrap'],
  ['Add event or CDC bridge', 'integrate'],
  ['Use governed workflow/RPA bridge', 'automate_around'],
  ['Use governed UI/vision bridge', 'automate_around'],
  ['Refactor through strangler or modular decomposition', 'refactor'],
  ['Replatform', 'replatform'],
  ['Replace with supported product or SaaS', 'replace'],
  ['Rebuild through controlled AI-assisted delivery', 'rebuild'],
  ['Consolidate duplicate applications', 'optimize'],
  ['Retire', 'retire'],
  ['Insufficient evidence', 'insufficient_evidence'],
  ['Blocked pending prerequisite', 'blocked'],
]);
for (const [recommendation, disposition] of canonicalModernizationTranslations) {
  check(
    modernizationCurrentSql.includes(`WHEN '${recommendation}' THEN '${disposition}'`),
    `Missing canonical PR1G modernization translation: ${recommendation}`,
  );
}
check(modernizationCurrentSql.includes('ENTERPRISE_MODERNIZATION_RECOMMENDATION_INVALID'),
  'Unknown PR1G recommendation values must fail closed.');
check(!/\blower\s*\(|\bILIKE\b|\bposition\s*\(/iu.test(
  modernizationCurrentSql.slice(
    modernizationCurrentSql.indexOf('enterprise_translate_pr1g_modernization_disposition'),
    modernizationCurrentSql.indexOf('$$;', modernizationCurrentSql.indexOf('enterprise_translate_pr1g_modernization_disposition')),
  ),
), 'PR1G recommendation translation must not use fuzzy or normalized matching.');
check(modernizationCurrentSql.includes("'pr1g-assessment:' || NEW.org_id::text"),
  'All PR1G assessment inserts must take the canonical application lock.');
check(modernizationCurrentSql.includes('BEFORE INSERT ON public.assess_application_assessment_versions'),
  'The current-assessment lock must cover every lifecycle insert.');
for (const operation of [
  'application.assessment.save', 'application.assessment.finalize',
  'application.assessment.review.resolve', 'application.assessment.revision.start',
]) check(modernizationCurrentSql.includes(`'${operation}'`),
  `Canonical PR1G operation ${operation} must lock before its first row lock.`);
check(modernizationCurrentSql.includes("'pr1g-assessment:' || v_org_id::text"),
  'Modernization must take the same application lock before selecting current truth.');
check(modernizationCurrentSql.includes('candidate.application_id = v_application_id')
  && modernizationCurrentSql.includes('candidate.org_id = v_org_id')
  && modernizationCurrentSql.includes('candidate.workspace_id = v_workspace_id')
  && !/candidate\.(?:application_id|org_id|workspace_id)\s*=\s*(?:application_id|org_id|workspace_id)\b/u.test(modernizationCurrentSql),
  'Modernization current-truth selectors must use unambiguous PL/pgSQL variable names.');
check(modernizationCurrentSql.indexOf('pg_advisory_xact_lock')
  < modernizationCurrentSql.indexOf('ORDER BY candidate.version DESC'),
  'Modernization must lock before selecting the latest assessment across all lifecycle states.');
check(modernizationCurrentSql.includes('ENTERPRISE_MODERNIZATION_SOURCE_NOT_CURRENT'),
  'A superseded source assessment must fail closed.');
check(modernizationCurrentSql.includes("(p_result -> ('decision'::text)) - ('alternativeDisposition'::text)"),
  'Canonical modernization response assembly must group and type both JSONB operators explicitly.');
check(modernizationCanonicalSql.includes('RENAME TO enterprise_commit_modernization_assessment_before_canonical_projection'),
  'Canonical modernization correction must remain additive and forward-only.');
check(modernizationCanonicalSql.includes('BEFORE INSERT ON public.enterprise_modernization_decisions')
  && modernizationCanonicalSql.includes('enterprise_modernization_canonical_resource(to_jsonb(assessment_row), to_jsonb(NEW))'),
  'The persisted modernization resource hash must cover the canonical committed resource semantics.');
for (const token of [
  "'factorBands', p_assessment->'factor_bands'",
  "'blockers', p_decision->'blockers'",
  "'conflicts', p_decision->'conflicts'",
  "'primaryDisposition', p_decision->>'primary_disposition'",
  "'eligibleDispositions', p_decision->'eligible_dispositions'",
  "'assessmentVersion', p_assessment->>'source_assessment_version'",
]) check(modernizationCanonicalSql.includes(token), `Canonical modernization projection is missing ${token}.`);
const canonicalReceiptStart = modernizationCanonicalSql.lastIndexOf(
  'CREATE OR REPLACE FUNCTION public.enterprise_commit_modernization_assessment(',
);
const canonicalReceiptFunction = modernizationCanonicalSql.slice(
  canonicalReceiptStart,
  modernizationCanonicalSql.indexOf('$$;', canonicalReceiptStart) + 3,
);
const canonicalAssembly = canonicalReceiptFunction.slice(canonicalReceiptFunction.indexOf('committed :='));
check(canonicalReceiptFunction.includes("p_result->>'resourceId' IS DISTINCT FROM p_decision->>'id'"),
  'The proposed modernization result may be used only for pre-commit identity validation.');
check(!canonicalAssembly.includes('p_result'),
  'Canonical modernization response/effect assembly must not copy any proposed Edge fields.');
check(canonicalAssembly.includes('canonical_result := jsonb_build_object(')
  && !canonicalAssembly.includes('p_result ||'),
  'Canonical modernization response/effect assembly must be rebuilt from committed database fields.');
const currentAssessmentSelection = commandSource.slice(
  commandSource.indexOf('const assertApprovedApplicationAssessment'),
  commandSource.indexOf('type CanonicalDimensionRow'),
);
check(currentAssessmentSelection.includes('&order=version.desc')
  && !currentAssessmentSelection.includes('&lifecycle=eq.approved'),
'Edge modernization selection must inspect the actual latest assessment before checking approval.');
check(currentAssessmentSelection.includes('row.lifecycle !== \'approved\''),
  'The actual latest assessment must be approved.');
check(currentAssessmentSelection.includes('&receipt_id=eq.')
  && currentAssessmentSelection.includes('&audit_event_id=eq.'),
'Approved lifecycle must bind its canonical predecessor review transition.');
check(commandSource.includes("const result = await rpc<JsonObject>('enterprise_commit_modernization_assessment'"),
  'Modernization must return the database-canonicalized response/effect result.');
check(ingestionSource.includes('export const readBoundedStream')
  && ingestionSource.includes('await reader.cancel(')
  && ingestionSource.includes('chunk.byteLength > maxBytes - totalBytes'),
'Untrusted decompression must enforce and cancel on an incremental byte bound.');
check(ingestionSource.includes('MAX_PDF_TOTAL_EXPANDED_BYTES')
  && ingestionSource.includes('Math.min(MAX_PDF_STREAM_BYTES, budget.remainingBytes)')
  && ingestionSource.includes('budget.remainingBytes -= expanded.byteLength'),
  'Every PDF stream must consume one cumulative expanded-byte document budget.');
check(!/new Response\([^)]*\)\.arrayBuffer\(\)/u.test(ingestionSource),
  'PDF and DOCX decompression must never materialize an unchecked Response arrayBuffer.');
check(querySource.includes('decodeModernizationBlockers(row.blockers)')
  && querySource.includes('MODERNIZATION_BLOCKER_KEYS')
  && !querySource.includes('JSON.stringify(row.blockers)'),
  'Modernization blocker projection must use a strict bounded decoder without arbitrary JSON serialization.');
for (const table of requiredTables) {
  check(sql.includes(`CREATE TABLE public.${table}`), `Missing strict table creation for ${table}`);
}
check(!/CREATE TABLE IF NOT EXISTS public\.enterprise_/i.test(sql), 'Enterprise tables must reject dirty drift instead of accepting IF NOT EXISTS.');
check(sql.includes('ENTERPRISE_INTELLIGENCE_DIRTY_SCHEMA'), 'A fail-fast dirty-schema preflight is required.');
check(sql.indexOf('ENTERPRISE_INTELLIGENCE_DIRTY_SCHEMA') < sql.indexOf('INSERT INTO public.capabilities'), 'Dirty-schema rejection must precede all feature mutations.');
check(sql.includes("ON DELETE SET NULL (provider_config_id)"), 'Provider deletion must retain the job and null only its provider reference.');
check(sql.includes("ON DELETE SET NULL (key_ref_id)"), 'Key deletion must retain provider configuration lineage.');
check(sql.includes("content_bytes <= 12582912"), 'The 12 MiB source authority limit is required.');
check(storageBoundarySource.includes("export const EVIDENCE_SOURCE_BUCKET = 'source-uploads' as const;"),
  'Edge evidence Storage must export one canonical source-uploads bucket constant.');
const sourceBucketSelector = storageBoundarySource.slice(
  storageBoundarySource.indexOf('export const selectSourceUploadsBucket'),
  storageBoundarySource.indexOf('export const selectExportsBucket'),
);
check(sourceBucketSelector.includes('configuredBucket !== EVIDENCE_SOURCE_BUCKET')
  && sourceBucketSelector.includes('configuredAllowlist !== EVIDENCE_SOURCE_BUCKET')
  && sourceBucketSelector.includes('return EVIDENCE_SOURCE_BUCKET')
  && !sourceBucketSelector.includes('selectAllowlistedBucket'),
  'Evidence source bucket selection must fail closed on every noncanonical configuration.');
check(sql.includes("storage_bucket TEXT NOT NULL DEFAULT 'source-uploads' CHECK (storage_bucket = 'source-uploads')")
  && sql.includes("IF NEW.storage_bucket <> 'source-uploads'"),
  'PostgreSQL source-version defaults, constraints, and derive authority must match the Edge canonical bucket.');
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
  'enterprise_ai_renew_external_write_lease',
  "receipt.command_type <> 'evidence.source.create'",
  "receipt.execution_plan->>'storageWriteOwnership' <> 'receipt_managed_write'",
  "receipt.execution_plan->>'storageWriteReceiptId' IS DISTINCT FROM receipt.id::TEXT",
  "receipt.execution_plan->>'writeState' NOT IN ('planned', 'written')",
  "statement_timestamp() + interval '45 seconds'",
  'execution_token = p_execution_token',
  'execution_fence = p_execution_fence',
]) check(sourceUploadRecoverySql.includes(required), `Source upload recovery is missing ${required}.`);
check(sourceUploadRecoverySql.includes('FROM PUBLIC, anon, authenticated'), 'Source upload lease renewal must reject browser roles.');
check(sourceUploadRecoverySql.includes('TO service_role'), 'Source upload lease renewal must remain service-only.');
check(commandSource.includes('storageWriteOwnership: \'receipt_managed_write\'')
  && commandSource.indexOf('ensureEvidenceSourceUploadPlan') < commandSource.indexOf('uploadBinaryArtifact({'),
'Evidence source upload intent must be persisted before the external write.');
check(commandSource.includes('storageBucket: typeof EVIDENCE_SOURCE_BUCKET')
  && commandSource.includes("if (plan.storageBucket !== EVIDENCE_SOURCE_BUCKET) throw new EnterpriseCommandError('RESOURCE_STALE')"),
  'Receipt plans and recovery must reject noncanonical evidence buckets before external I/O.');
check(commandSource.includes("writeState: 'planned'") && commandSource.includes("writeState: 'written'"),
  'Evidence source upload recovery requires a monotonic planned-to-written marker.');
check(storageSource.includes('STORAGE_EXTERNAL_OPERATION_TIMEOUT_MS = 15_000')
  && storageSource.includes('controller.abort()')
  && storageSource.includes('await fetch(input, { ...init, signal: controller.signal })'),
'Storage inspection and upload require a hard abortable deadline that settles before ownership release.');
check(commandSource.includes('buildGroundedEvidenceCandidate')
  && commandSource.includes('sanitizeEvidenceExcerpt(input.candidate.safeExcerpt)')
  && commandSource.includes('deriveCanonicalEvidenceSourceLocator(input.source.text, persistedExcerpt)'),
'Candidate provenance must validate the exact sanitized persisted excerpt against the governed source.');
const excerptSanitizer = enterpriseDomainSource.slice(
  enterpriseDomainSource.indexOf('export const isUnicodeScalarString'),
  enterpriseDomainSource.indexOf('const projectionUuid'),
);
check(excerptSanitizer.includes('for (const codePoint of value)')
  && excerptSanitizer.includes('truncateUnicodeScalarString(normalized, maxLength')
  && !excerptSanitizer.includes('.slice('),
  'Evidence excerpts must truncate by Unicode code point, never UTF-16 code unit.');
check(excerptSanitizer.includes('ENTERPRISE_EVIDENCE_EXCERPT_INVALID_UNICODE')
  && commandSource.includes('!isUnicodeScalarString(input.candidate.safeExcerpt)'),
  'Malformed or unpaired surrogate excerpts must be rejected before hashing or persistence.');
check(!commandSource.includes('normalizedValue'), 'Candidate values must never substitute for excerpt provenance.');
const candidateValueUtility = enterpriseDomainSource.slice(
  enterpriseDomainSource.indexOf('export const sanitizeEvidenceCandidateValue'),
  enterpriseDomainSource.indexOf('const projectionUuid'),
);
check(candidateValueUtility.includes('truncateUnicodeScalarString(value, maxLength')
  && candidateValueUtility.includes('ENTERPRISE_EVIDENCE_VALUE_INVALID_UNICODE')
  && !candidateValueUtility.includes('.slice('),
  'Candidate values must reject malformed Unicode and truncate only by code point.');
check(!commandSource.includes('raw.value.slice(0, 12_000)')
  && commandSource.indexOf('persistedValue = sanitizeEvidenceCandidateValue(raw.value)')
    < commandSource.indexOf('const candidate = await buildGroundedEvidenceCandidate'),
  'Provider candidate values must be canonicalized before grounded hashing and persistence.');
check(querySource.includes('isUnicodeScalarString(candidateValue)')
  && querySource.includes('Array.from(candidateValue).length > 12_000')
  && querySource.includes('value: candidateValue')
  && !querySource.includes('.slice(0, 12_000)'),
  'Review projections must return only the exact governed Unicode-scalar candidate value.');
check(commandSource.includes("Array.from(input.candidate.value).length > 12_000")
  && commandSource.includes('!isUnicodeScalarString(input.candidate.value)'),
  'The grounded candidate boundary must fail closed on non-canonical or malformed values.');
check(commandSource.includes("EVIDENCE_SOURCE_LOCATOR_PREFIX = 'normalized-text:v1:chars'")
  && commandSource.includes('sourceLocator?: never')
  && !commandSource.includes('raw.sourceLocator'),
  'Provider output must have no source-locator authority or static assignment path.');
for (const required of [
  'enterprise_evidence_source_locator_is_canonical',
  "^normalized-text:v1:chars:",
  'enterprise_evidence_candidate_locators_are_canonical',
  'enterprise_evidence_excerpt_anchor_hash',
  'enterprise_evidence_candidates_canonical_locator',
  'enterprise_ai_extraction_stage_canonical_locators',
  "source_locator_schema = 'normalized-text-char-range-1'",
  'NEW.excerpt_hash := public.enterprise_evidence_excerpt_anchor_hash(',
  'CREATE OR REPLACE FUNCTION public.enterprise_candidate_guard()',
  'NEW.excerpt_hash IS DISTINCT FROM expected_excerpt_hash',
  'NEW.excerpt_hash IS DISTINCT FROM OLD.excerpt_hash',
  'CREATE OR REPLACE FUNCTION public.enterprise_review_evidence_candidate(',
  'next_excerpt_hash := public.enterprise_evidence_excerpt_anchor_hash(',
  'excerpt_hash = next_excerpt_hash',
  'enterprise_promote_evidence_to_assess_v2(uuid,uuid,bigint,uuid,uuid,uuid,uuid,text,bigint)',
  'enterprise_promote_evidence_batch_to_assess_v2(uuid,jsonb,uuid,bigint,uuid,uuid,uuid,bigint,uuid,uuid,bigint)',
  'FOREACH promotion_function IN ARRAY',
  'current_excerpt := public.enterprise_evidence_excerpt_anchor_hash(',
  'ENTERPRISE_EVIDENCE_PROMOTION_ANCHOR_CONTRACT_DRIFT',
]) check(evidenceLocatorAuthoritySql.includes(required), `Evidence locator authority is missing ${required}.`);
check(evidenceLocatorAuthoritySql.includes('FROM PUBLIC, anon, authenticated')
  && evidenceLocatorAuthoritySql.includes('TO service_role'),
  'Evidence locator validation/hash helpers must remain service-only.');
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
for (const required of [
  'enterprise_ai_claim_provider_secret_cleanup_v2',
  "lease_expires_at=statement_timestamp()+interval '45 seconds'",
  'enterprise_ai_renew_provider_secret_cleanup_lease',
  'execution_token=p_execution_token AND execution_fence=p_execution_fence',
  "command_type IN ('provider.secret.bind','provider.secret.rotate')",
  "execution_plan->>'secretOwnership'='managed_write'",
  "execution_plan->>'secretPlanReceiptId'=id::text",
  "COALESCE((execution_plan->>'cleanupRequired')::boolean,false)",
  'ENTERPRISE_AI_STALE_EXECUTION_FENCE',
]) check(providerCleanupDeadlineSql.includes(required), `Provider cleanup deadline migration is missing ${required}.`);
check(providerCleanupDeadlineSql.includes('FROM PUBLIC,anon,authenticated'), 'Cleanup deadline functions must reject browser roles.');
check(providerCleanupDeadlineSql.match(/TO service_role/g)?.length === 2, 'Both cleanup deadline functions must remain service-only.');
check(/enterprise_ai_claim_provider_secret_cleanup\(\r?\n  UUID,UUID,UUID,TEXT,TEXT,UUID,UUID,UUID\r?\n\) FROM service_role/u.test(providerCleanupDeadlineSql), 'The superseded one-second cleanup claim must no longer be executable.');
check(!/(?:providerKey|rawKey|secretValue)/u.test(providerCleanupDeadlineSql), 'Cleanup deadline functions must not accept raw key material.');
check(providerLifecycleSource.indexOf("secretOwnership: 'managed_write'") < providerLifecycleSource.indexOf('await deps.secretBackend.write'), 'Managed secret ownership must be persisted before the external write.');
check(providerLifecycleSource.includes("execution.plan.secretPlanReceiptId === execution.receiptId"), 'Cleanup ownership must be bound to the current receipt plan.');
check(providerLifecycleSource.includes('await fingerprintProviderSecret(existing) !== safeFingerprint'), 'Cleanup must verify the resolved secret fingerprint before deletion.');
check(providerLifecycleSource.includes('protectedSecretReferenceHash'), 'Cleanup must protect the prior active secret reference.');
check(providerLifecycleSource.includes('PROVIDER_SECRET_DELETE_TIMEOUT_MS = 10_000'), 'Managed cleanup requires a bounded external-delete deadline.');
check(providerLifecycleSource.includes('await execution.renewCleanupLease()'), 'Managed cleanup must renew its fenced lease immediately before delete.');
check(providerLifecycleSource.includes('controller.abort()') && providerLifecycleSource.includes('await removePromise.catch'), 'Timed-out cleanup must abort and settle the old delete before releasing ownership.');
check(providerSecretAdapterSource.includes('signal: AbortSignal') && providerSecretAdapterSource.includes('signal: input.signal'), 'The writable secret backend must honor cleanup cancellation.');
check(providerLifecycleEndpointSource.includes("'enterprise_ai_claim_provider_secret_cleanup_v2'"), 'The recovery endpoint must use the long-lease cleanup claim.');
check(providerLifecycleEndpointSource.includes("'enterprise_ai_renew_provider_secret_cleanup_lease'"), 'The recovery endpoint must renew the exact cleanup fence.');
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
check(promotionAncestrySql.includes('CREATE OR REPLACE FUNCTION public.enterprise_promote_evidence_batch_to_assess_v2')
  && promotionAncestrySql.includes('source_kind, source_snapshot, imported_facts, created_by')
  && promotionAncestrySql.includes("'draft_upsert', old_version.source_snapshot, old_version.imported_facts, p_actor"),
  'Promotion versions must preserve the exact prior Assess source snapshot and imported facts.');
check(!promotionAncestrySql.includes("jsonb_build_object('promotion', jsonb_build_object("),
  'Enterprise promotion metadata must not replace canonical Assess source ancestry.');
check(promotionAncestrySql.indexOf('-- Validate the complete locked set before creating any version')
    < promotionAncestrySql.indexOf('INSERT INTO public.assess_v2_case_versions'),
  'The ancestry correction must preserve full atomic pre-validation before the first mutation.');
check(promotionAncestrySql.includes('TO service_role')
  && promotionAncestrySql.includes('FROM PUBLIC, anon, authenticated'),
  'The corrected atomic promotion function must remain service-role only.');
check(promotionAncestryPreflightSql.indexOf('DO $migration$')
    < promotionAncestryPreflightSql.indexOf('COMMENT ON FUNCTION'),
  'Dirty-history detection must run before any migration mutation.');
for (const required of [
  'ENTERPRISE_PROMOTION_ANCESTRY_HISTORY_REQUIRES_REVIEW',
  'promoted.source_snapshot IS DISTINCT FROM prior.source_snapshot',
  'promoted.imported_facts IS DISTINCT FROM prior.imported_facts',
  'promoted.agent_necessity IS DISTINCT FROM prior.agent_necessity',
  'prior.version = promoted.version - 1',
]) check(promotionAncestryPreflightSql.includes(required),
  `Promotion dirty-history preflight is missing ${required}.`);
check(!/\b(?:UPDATE|DELETE|INSERT)\b/i.test(
  promotionAncestryPreflightSql.slice(0, promotionAncestryPreflightSql.indexOf('COMMENT ON FUNCTION')),
), 'Promotion dirty-history preflight must never repair immutable history.');
const assessEvidenceBuilderStart = assessEvidenceSubmissionSql.indexOf(
  'CREATE OR REPLACE FUNCTION public.enterprise_build_assess_v2_evidence_submission',
);
const assessEvidenceBuilder = assessEvidenceSubmissionSql.slice(
  assessEvidenceBuilderStart,
  assessEvidenceSubmissionSql.indexOf('$$;', assessEvidenceBuilderStart) + 3,
);
for (const token of [
  "'id', p_evidence_id",
  "'claimIds', '[]'::jsonb",
  "'sourceType', public.enterprise_assess_v2_source_type",
  "'status', 'submitted'",
  "'validated', false",
]) check(assessEvidenceBuilder.includes(token), `Canonical Assess EvidenceSubmission is missing ${token}.`);
for (const forbidden of [
  'candidateId', 'candidateVersion', 'candidateProvenanceHash', 'sourceId',
  'sourceVersionId', 'sourceLocator', 'safeExcerpt', 'fieldKey', 'value',
]) check(!assessEvidenceBuilder.includes(forbidden),
  `Enterprise lineage field ${forbidden} must not enter the strict Assess EvidenceSubmission payload.`);
check(assessEvidenceSubmissionSql.includes('ADD COLUMN assess_evidence_link_id UUID')
  && assessEvidenceSubmissionSql.includes('FOREIGN KEY (assess_case_version_id, assess_evidence_link_id)')
  && assessEvidenceSubmissionSql.includes('enterprise_promoted_assess_evidence_canonical'),
  'Each Enterprise promotion must bind one exact canonical Assess evidence row through an enforced relation.');
check(assessEvidenceSubmissionSql.includes('ENTERPRISE_ASSESS_EVIDENCE_LEGACY_ROWS_REQUIRE_REVIEW')
  && !assessEvidenceSubmissionSql.includes('UPDATE public.assess_v2_evidence_links'),
  'A dirty pre-release upgrade must fail closed without rewriting immutable Assess evidence history.');
const correctedBatchStart = assessEvidenceSubmissionSql.indexOf(
  'CREATE OR REPLACE FUNCTION public.enterprise_promote_evidence_batch_to_assess_v2',
);
const correctedBatch = assessEvidenceSubmissionSql.slice(
  correctedBatchStart,
  assessEvidenceSubmissionSql.indexOf('$$;', correctedBatchStart) + 3,
);
check(correctedBatch.includes('-- Validate the complete locked set before creating any version, evidence,')
  && correctedBatch.indexOf('-- Validate the complete locked set before creating any version, evidence,')
    < correctedBatch.indexOf('INSERT INTO public.assess_v2_case_versions'),
  'The corrected batch must retain full locked-set validation before its first mutation.');
check(correctedBatch.includes('public.enterprise_build_assess_v2_evidence_submission(')
  && correctedBatch.includes('assess_evidence_link_id')
  && correctedBatch.includes("'evidenceLinkIds', evidence_link_ids"),
  'Promotion response, immutable lineage, and canonical evidence rows must share exact evidence-link identities.');
check(correctedBatch.includes("'resourceId', assess_case.id")
  && correctedBatch.includes("'evidence.assess.promote', 'command', assess_case.id, result, 'committed'"),
  'The corrected batch must retain the Assess draft as the canonical receipt/effect resource.');
check(assessEvidenceSubmissionSql.includes('FROM PUBLIC, anon, authenticated, service_role;')
  && assessEvidenceSubmissionSql.includes('Superseded single-candidate implementation; no application role has execution authority.')
  && assessEvidenceSubmissionSql.includes('Superseded receipt-aware single-candidate wrapper; no application role has execution authority.'),
  'Both obsolete single-candidate promotion surfaces must be retired from every application role.');
const promotionCommand = commandSource.slice(
  commandSource.indexOf('const commandEvidenceAssessPromote'),
  commandSource.indexOf('const assertApprovedApplicationAssessment'),
);
check(!/for\s*\([^)]*candidate[^)]*\)[\s\S]*?rpc\(['"]enterprise_promote_evidence_to_assess_v2/iu.test(promotionCommand), 'The command handler must not loop over the single-candidate promotion RPC.');
check((promotionCommand.match(/enterprise_promote_evidence_batch_to_assess_v2/gu) || []).length === 1, 'The command handler must make exactly one promotion RPC call.');
check(promotionCommand.includes('evidenceLinkIds?: string[]')
  && promotionCommand.includes('response.evidenceLinkIds.length !== promotionCandidates.length')
  && promotionCommand.includes('new Set(response.evidenceLinkIds).size !== promotionCandidates.length'),
  'The Edge boundary must validate one unique canonical Assess evidence-link identity per promoted candidate.');
check(correctedBatch.indexOf('PERFORM public.enterprise_ai_record_effect') < correctedBatch.indexOf('RETURN result;'), 'Batch success requires a durable receipt effect.');
check(correctedBatch.includes("'resourceId', assess_case.id"), 'Batch response must identify the Assess draft as its canonical resource.');
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
