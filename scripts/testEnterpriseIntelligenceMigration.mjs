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
  ['Add API faÃ§ade and semantic translation', 'api_enable_wrap'],
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
  'enterprise_monitor_ïnú¶‰ËkºwµçM½ÕÉ•%Ñ¼Ñ¡”Á±…¹¹••áÑÉ…Ñ¥½¸©½ˆ¸œ¤ì4)¡•¬¡•áÑÉ…Ñ¥½¹½µµ…¹¹¥¹±Õ‘•Ì ½¹ÍĞÍ…™•I•ÍÕ±Ğ€ôìÉ•Í½ÕÉ•%è©½‰%°©½‰%°œ¤°€áÑÉ…Ñ¥½¸µÕÍĞÉ•ÑÕÉ¸…¸•áÁ±¥¥Ğ…¹½¹¥…°©½ˆÉ•Í½ÕÉ•%¸œ¤ì4)¡•¬¡½µµ…¹‘M½ÕÉ”¹¥¹±Õ‘•Ì ‰‘¥ÍÁ½Í¥Ñ¥½¸€ô€ÁÉ•Í•ÉÙ•}±…¥µ•‘}É••¥ÁĞœˆ¤°€QÉ…¹ÍÁ½ÉĞÕ¹•ÉÑ…¥¹ÑäµÕÍĞ…ÉÉä…¸•áÁ±¥¥Ğ¥¹Ñ•É¹…°É•½Ù•É…‰±”‘¥ÍÁ½Í¥Ñ¥½¸¸œ¤ì4)¡•¬ …½µµ…¹‘M½ÕÉ”¹¥¹±Õ‘•Ì ‰ÑåÁ•½˜±…¥µ•‘I••¥ÁĞ¹•á•ÕÑ¥½¹}Á±…¸ü¹©½‰%€ôôô€ÍÑÉ¥¹œœˆ¤°€I••¥ÁĞÉ•½Ù•ÉäµÕÍĞ¹½Ğ¥¹™•ÈÑÉ…¹ÍÁ½ÉĞÕ¹•ÉÑ…¥¹Ñä™É½´•á•ÕÑ¥½¸µÁ±…¸Í¡…Á”¸œ¤ì4)¡•¬¡•áÑÉ…Ñ¥½¹½µµ…¹¹¥¹‘•á=˜ •¹Ñ•ÉÁÉ¥Í•}ÍÑ…•}•Ù¥‘•¹•}•áÑÉ…Ñ¥½¹}É•ÍÕ±Ğœ¤€ğ•áÑÉ…Ñ¥½¹½µµ…¹¹±…ÍÑ%¹‘•á=˜ ½µµ¥ÑMÑ…•‘Ù¥‘•¹•áÑÉ…Ñ¥½¸œ¤°€M…¹¥Ñ¥é•ÍÑ…¥¹œµÕÍĞÁÉ••‘”…¹½¹¥…°½µµ¥Ğ¸œ¤ì4)½¹ÍĞÕ¹•ÉÑ…¥¹½µµ¥Ğ€ô½µµ…¹‘M½ÕÉ”¹Í±¥” 4(€½µµ…¹‘M½ÕÉ”¹¥¹‘•á=˜ ½¹ÍĞ½µµ¥ÑMÑ…•‘Ù¥‘•¹•áÑÉ…Ñ¥½¸œ¤°4(€½µµ…¹‘M½ÕÉ”¹¥¹‘•á=˜ ½¹ÍĞ½µµ…¹‘Ù¥‘•¹•áÑÉ…Ğœ¤°4(¤ì4)¡•¬ …Õ¹•ÉÑ…¥¹½µµ¥Ğ¹¥¹±Õ‘•Ì •¹Ñ•ÉÁÉ¥Í•}™…¥±}•Ù¥‘•¹•}•áÑÉ…Ñ¥½¹}©½ˆœ¤°€•¹•É¥Œ½µµ¥ĞÕ¹•ÉÑ…¥¹ÑäµÕÍĞ¹•Ù•È…±°Ñ¡”•áÑÉ…Ñ¥½¸™…¥±ÕÉ”IA¸œ¤ì4)½¹ÍĞÉ•Í½ÕÉ•I•Í½±Ù•È€ô½µµ…¹‘M½ÕÉ”¹Í±¥” (€½µµ…¹‘M½ÕÉ”¹¥¹‘•á=˜ •áÁ½ÉĞ½¹ÍĞÉ•Í½±Ù•¹Ñ•ÉÁÉ¥Í•½µµ…¹‘I•Í½ÕÉ•%œ¤°(€½µµ…¹‘M½ÕÉ”¹¥¹‘•á=˜ ½¹ÍĞ•¹ÍÕÉ•á•ÕÑ¥½¹A±…¸œ¤°(¤ì)¡•¬¡É•Í½ÕÉ•I•Í½±Ù•È¹¥¹±Õ‘•Ì ‰½µµ…¹‘QåÁ”€ôôô€•Ù¥‘•¹”¹…ÍÍ•ÍÌ¹ÁÉ½µ½Ñ”œˆ¤(€€˜˜É•Í½ÕÉ•I•Í½±Ù•È¹¥¹±Õ‘•Ì œüÉ•ÍÕ±Ñ=‰©•Ğ¹…ÍÍ•ÍÍÉ…™Ñ%œ¤°(AÉ½µ½Ñ¥½¸™¥¹…±¥é…Ñ¥½¸µÕÍĞ‰¥¹•áÁ±¥¥ĞÉ•Í½ÕÉ•%Ñ¼…ÍÍ•ÍÍÉ…™Ñ%¸œ¤ì)¡•¬¡É•Í½ÕÉ•I•Í½±Ù•È¹¥¹±Õ‘•Ì ±¥¹•…•I•Í½ÕÉ•%€„ôô•áÁ±¥¥ÑI•Í½ÕÉ•%œ¤(€€˜˜€„½É•ÑÕÉ¹qÌ­É•ÍÕ±Ñ=‰©•Ñp¹Í½ÕÉ•%½Ô¹Ñ•ÍĞ¡É•Í½ÕÉ•I•Í½±Ù•È¤°(Ù•Éä¹Ñ•ÉÁÉ¥Í”É•ÍÕ±ĞµÕÍĞ™…¥°±½Í•Õ¹±•ÍÌ•áÁ±¥¥ĞÉ•Í½ÕÉ•%•ÅÕ…±Ì½µµ…¹±¥¹•…”¸œ¤ì)™½È€¡½¹ÍĞ½Á•É…Ñ¥½¸½˜l4(€€ÁÉ½Ù¥‘•È¹É•¥ÍÑ•Èœ°€ÁÉ½Ù¥‘•È¹Í•É•Ğ¹‰¥¹œ°€ÁÉ½Ù¥‘•È¹Ù…±¥‘…Ñ”œ°€ÁÉ½Ù¥‘•È¹…Ñ¥Ù…Ñ”œ°4(€€ÁÉ½Ù¥‘•È¹É½ÕÑ”¹Ñ½±”œ°€ÁÉ½Ù¥‘•È¹Í•É•Ğ¹É½Ñ…Ñ”œ°€ÁÉ½Ù¥‘•È¹É•Ù½­”œ°4)t¤¡•¬¡ÍÅ°¹¥¹±Õ‘•Ì¡€œ‘í½Á•É…Ñ¥½¹ô€¤°5¥ÍÍ¥¹œÁÉ½Ù¥‘•È±¥™•å±”½Á•É…Ñ¥½¸€‘í½Á•É…Ñ¥½¹õ€¤ì4)¡•¬¡ÍÅ°¹¥¹±Õ‘•Ì Á}Á…å±½…€ığ™½É‰¥‘‘•¹}­•åÌœ¤°€AÉ½Ù¥‘•È±¥™•å±”ME0µÕÍĞÉ•©•ĞÉ…ÜÍ•É•Ğµ‰•…É¥¹œÁ…å±½…­•åÌ¸œ¤ì4)¡•¬¡ÍÅ°¹¥¹±Õ‘•Ì É…İ½µÁ±•Ñ¥½¹ñÉ…İ}½µÁ±•Ñ¥½¸œ¤°€AÉ½Ù¥‘•È±¥™•å±”ME0µÕÍĞÉ•©•Ğ¹•ÍÑ•É…ÜÍ•É•Ğ½ÁÉ½µÁĞ½½µÁ±•Ñ¥½¸­•åÌ¸œ¤ì4)¡•¬¡ÍÅ°¹¥¹±Õ‘•Ì ‰±…ÍÑ}Ù…±¥‘…Ñ•‘}…Ğ€ğÍÑ…Ñ•µ•¹Ñ}Ñ¥µ•ÍÑ…µÀ ¤€´¥¹Ñ•ÉÙ…°€œÈĞ¡½ÕÉÌœˆ¤°€AÉ½Ù¥‘•È…Ñ¥Ù…Ñ¥½¸…¹É½ÕÑ”•¹…‰±•µ•¹ĞÉ•ÅÕ¥É”™É•Í Ù…±¥‘…Ñ¥½¸¸œ¤ì4)¡•¬¡ÍÅ°¹¥¹±Õ‘•Ì É½±•Ì€èôÉ½ÕÑ”¹…±±½İ•‘}É½±•Ìœ¤°€I½ÕÑ”Ñ½±•ÌµÕÍĞÁÉ•Í•ÉÙ”…±±½İ•É½±•Ìİ¡•¸½µ¥ÑÑ•¸œ¤ì4)¡•¬¡ÍÅ°¹¥¹±Õ‘•Ì ‰MPÍÑ…ÑÕÌ€ô€É•Ñ¥É•œ°É½Ñ…Ñ¥½¹}ÍÑ…ÑÕÌ€ô€É½Ñ…Ñ•œˆ¤°€I½Ñ…Ñ¥½¸µÕÍĞÉ•Ñ¥É”Ñ¡”ÁÉ¥½È­•äÉ•™•É•¹”¸œ¤ì4)¡•¬¡ÍÅ°¹¥¹±Õ‘•Ì MP•¹…‰±•€ô™…±Í”°Ù•ÉÍ¥½¸€ôÙ•ÉÍ¥½¸€¬€Äœ¤°€AÉ½Ù¥‘•ÈÉ•Ù½…Ñ¥½¸µÕÍĞ‘¥Í…‰±”É½ÕÑ•Ì…Ñ½µ¥…±±ä¸œ¤ì4)¡•¬¡ÍÅ°¹¥¹±Õ‘•Ì ]!IÁÉ½Ù¥‘•É}½¹™¥}¥€ô½¹™¥œ¹¥9½É}¥€ôÁ}½Éœ9‘•±•Ñ•‘}…Ğ%L9U10œ¤°€AÉ½Ù¥‘•ÈÉ•Ù½…Ñ¥½¸µÕÍĞ‘¥Í…‰±”…±°½É…¹¥é…Ñ¥½¸É½ÕÑ•Ì…É½ÍÌİ½É­ÍÁ…•Ì¸œ¤ì4)¡•¬¡ÍÅ°¹¥¹±Õ‘•Ì …¹‘¥‘…Ñ•}ÁÉ½Ù•¹…¹•}¡…Í œ¤°€…¹‘¥‘…Ñ”ÁÉ½Ù•¹…¹”µÕÍĞ‰”É•Ñ…¥¹•Ñ¡É½Õ ÁÉ½µ½Ñ¥½¸¸œ¤ì4)¡•¬¡ÍÅ°¹¥¹±Õ‘•Ì É•Í½ÕÉ•}Ù•ÉÍ¥½¸œ¤€˜˜ÍÅ°¹¥¹±Õ‘•Ì É•Í½ÕÉ•}¡…Í œ¤°€I•Ù¥•Ü…¹…ÁÁÉ½Ù…°…ÕÑ¡½É¥ÑäµÕÍĞ‰¥¹•á…ĞÙ•ÉÍ¥½¹Ì…¹¡…Í¡•Ì¸œ¤ì4)¡•¬¡ÍÅ°¹¥¹±Õ‘•Ì •¹Ñ•ÉÁÉ¥Í•}É•©•Ñ}µÕÑ…Ñ¥½¸œ¤°€%µµÕÑ…‰±”±¥¹•…”Ñ…‰±•ÌÉ•ÅÕ¥É”µÕÑ…Ñ¥½¸É•©•Ñ¥½¸ÑÉ¥•ÉÌ¸œ¤ì4)¡•¬¡ÍÅ°¹¥¹±Õ‘•Ì ‰É•…‘}½¹±äÍÑ½ÁÌ…±°¹Ñ•ÉÁÉ¥Í”%¹Ñ•±±¥•¹”µÕÑ…Ñ¥½¸ˆ¤°€‘½Õµ•¹Ñ•É•…µ½¹±äÉ½±±‰…¬™…±±‰…¬¥ÌÉ•ÅÕ¥É•¸œ¤ì4)¡•¬ „½±¥Ù•}Ñ•±•µ•ÑÉå}½¹¹•Ñ•‘qÌ­	==19qÌ­9=P9U11qÌ­U1QqÌ­ÑÉÕ”½¤¹Ñ•ÍĞ¡ÍÅ°¤°€1¥Ù”Ñ•±•µ•ÑÉäµÕÍĞÉ•µ…¥¸‘¥Í…‰±•¸œ¤ì4)¡•¬ „½ÉÕ¹Ñ¥µ•}…•¹ÑÍ}•¹…‰±•‘qÌ­	==19qÌ­9=P9U11qÌ­U1QqÌ­ÑÉÕ”½¤¹Ñ•ÍĞ¡ÍÅ°¤°€IÕ¹Ñ¥µ”…•¹ÑÌµÕÍĞÉ•µ…¥¸‘¥Í…‰±•¸œ¤ì4)¡•¬ „½‘•Á±½åµ•¹Ñ}•¹…‰±•‘qÌ­	==19qÌ­9=P9U11qÌ­U1QqÌ­ÑÉÕ”½¤¹Ñ•ÍĞ¡ÍÅ°¤°€•Á±½åµ•¹ĞµÕÍĞÉ•µ…¥¸‘¥Í…‰±•¸œ¤ì4)¡•¬ „½É•…‘¥¹•ÍÍqÌ­QaQqÌ­9=P9U11qÌ­!-qÌ©p¡mx¥t©q‰É•…‘åqˆ½¤¹Ñ•ÍĞ¡ÍÅ°¤°€5½¹¥Ñ½È…ÕÑ¡½É¥Ñä…¹¹½Ğ±…¥´É•…‘ä¥¸Ñ¡¥ÌÍ±¥”¸œ¤ì4)¡•¬¡ÍÅ°¹¥¹±Õ‘•Ì =I%8-d€¡İ½É­ÍÁ…•}¥°½É}¥¤œ¤°€]½É­ÍÁ…”½½Éœ½µÁ½Í¥Ñ”™½É•¥¸­•åÌ…É”É•ÅÕ¥É•¸œ¤ì4)¡•¬¡ÍÅ°¹¥¹±Õ‘•Ì •¹Ñ•ÉÁÉ¥Í•}™¥¹…±}…°œ¤°€¥¹…°±•…ÍĞµÁÉ¥Ù¥±•”0É•½¹¥±¥…Ñ¥½¸¥ÌÉ•ÅÕ¥É•¸œ¤ì4)½¹ÍĞ™¥¹…±°€ôÍÅ°¹¥¹‘•á=˜ <€‘•¹Ñ•ÉÁÉ¥Í•}™¥¹…±}…°œ¤ì4)¡•¬¡™¥¹…±°€øÍÅ°¹±…ÍÑ%¹‘•á=˜ I9PM1P=8Q	1ÁÕ‰±¥Œ¹•¹Ñ•ÉÁÉ¥Í•|œ¤°€¥¹…°0É•Ù½…Ñ¥½¸µÕÍĞ™½±±½Ü…±°±•…äÉ…¹ÑÌ¸œ¤ì4)¡•¬¡ÍÅ°¹Í±¥”¡™¥¹…±°¤¹¥¹±Õ‘•Ì I9PM1P=8Q	1ÁÕ‰±¥Œ¸•$Q<Í•ÉÙ¥•}É½±”œ¤°€M•ÉÙ¥”É½±”µÕÍĞÉ••¥Ù”É•…µ½¹±äÑ…‰±”…•ÍÌ¸œ¤ì4)¡•¬ …ÍÅ°¹Í±¥”¡™¥¹…±°¤¹¥¹±Õ‘•Ì I9PM1P=8Q	1ÁÕ‰±¥Œ¸•$Q<…ÕÑ¡•¹Ñ¥…Ñ•œ¤°€ÕÑ¡•¹Ñ¥…Ñ•ÕÍ•ÉÌµÕÍĞ¹½ĞÉ••¥Ù”É…Ü¹Ñ•ÉÁÉ¥Í”Ñ…‰±”…•ÍÌ¸œ¤ì4)¡•¬¡ÍÅ°¹¥¹±Õ‘•Ì I=@U9Q%=8ÁÕ‰±¥Œ¹•¹Ñ•ÉÁÉ¥Í•}½µµ¥Ñ}‘•±¥Ù•Éå}¡…¹‘½™™}±•…å}Õ¹ÑÉÕÍÑ•œ¤°€U¹ÑÉÕÍÑ••±¥Ù•ÉäµÕÑ…Ñ¥½¸•¹ÑÉäÁ½¥¹ĞµÕÍĞ‰”É•µ½Ù•¸œ¤ì4)¡•¬¡ÍÅ°¹¥¹±Õ‘•Ì I=@U9Q%=8ÁÕ‰±¥Œ¹•¹Ñ•ÉÁÉ¥Í•}½µµ¥Ñ}µ½‘•É¹¥é…Ñ¥½¹}…ÍÍ•ÍÍµ•¹Ñ}±•…å}Õ¹ÑÉÕÍÑ•œ¤°€U¹ÑÉÕÍÑ•µ½‘•É¹¥é…Ñ¥½¸•¹ÑÉäÁ½¥¹ĞµÕÍĞ‰”É•µ½Ù•¸œ¤ì4)¡•¬¡ÍÅ°¹¥¹±Õ‘•Ì I=@U9Q%=8ÁÕ‰±¥Œ¹•¹Ñ•ÉÁÉ¥Í•}½µµ¥Ñ}¡¥¡}¥µÁ…Ñ}…ÁÁÉ½Ù…±}±•…å}Õ¹ÑÉÕÍÑ•œ¤°€U¹ÑÉÕÍÑ•…ÁÁÉ½Ù…°•¹ÑÉäÁ½¥¹ĞµÕÍĞ‰”É•µ½Ù•¸œ¤ì4)¡•¬¡ÍÅ°¹¥¹±Õ‘•Ì U9Q%=8ÁÕ‰±¥Œ¹•¹Ñ•ÉÁÉ¥Í•}½µµ…¹‘}ÉÕ¹Ñ¥µ•}…É•„œ¤°€=¹”•á¡…ÕÍÑ¥Ù”½µµ…¹µÑ¼µÉÕ¹Ñ¥µ”µ…É•„±…ÍÍ¥™¥•È¥ÌÉ•ÅÕ¥É•¸œ¤ì4)½¹ÍĞ±…ÍÍ¥™¥•ÉMÑ…ÉĞ€ôÍÅ°¹¥¹‘•á=˜ IQ=HIA1U9Q%=8ÁÕ‰±¥Œ¹•¹Ñ•ÉÁÉ¥Í•}½µµ…¹‘}ÉÕ¹Ñ¥µ•}…É•„œ¤ì4)½¹ÍĞ±…ÍÍ¥™¥•É¹€ôÍÅ°¹¥¹‘•á=˜ œìœ°±…ÍÍ¥™¥•ÉMÑ…ÉĞ¤ì4)½¹ÍĞ±…ÍÍ¥™¥•È€ôÍÅ°¹Í±¥”¡±…ÍÍ¥™¥•ÉMÑ…ÉĞ°±…ÍÍ¥™¥•É¹¤ì4)™½È€¡½¹ÍĞ½µµ…¹‘QåÁ”½˜l4(€€ÁÉ½Ù¥‘•È¹É•¥ÍÑ•Èœ°€ÁÉ½Ù¥‘•È¹Í•É•Ğ¹‰¥¹œ°€ÁÉ½Ù¥‘•È¹Ù…±¥‘…Ñ”œ°€ÁÉ½Ù¥‘•È¹…Ñ¥Ù…Ñ”œ°€ÁÉ½Ù¥‘•È¹É½ÕÑ”¹Ñ½±”œ°€ÁÉ½Ù¥‘•È¹Í•É•Ğ¹É½Ñ…Ñ”œ°€ÁÉ½Ù¥‘•È¹É•Ù½­”œ°4(€€•Ù¥‘•¹”¹Í½ÕÉ”¹É•…Ñ”œ°€•Ù¥‘•¹”¹•áÑÉ…Ğœ°€•Ù¥‘•¹”¹…¹‘¥‘…Ñ”¹É•Ù¥•Üœ°€•Ù¥‘•¹”¹…ÍÍ•ÍÌ¹ÁÉ½µ½Ñ”œ°4(€€µ½‘•É¹¥é…Ñ¥½¸¹•Ù…±Õ…Ñ”œ°€ÍÑÕ‘¥¼¹‘•±¥Ù•Éä¹¡…¹‘½™˜œ°€µ½¹¥Ñ½È¹‰…Í•±¥¹”¹É•…Ñ”œ°4(€€…ÁÁÉ½Ù…°¹É•Ù¥•Ü¹É•½Éœ°€…ÁÁÉ½Ù…°¹É•½Éœ°€…ÍÍ•µ‰±”¹‰±Õ•ÁÉ¥¹Ğ¹É•…Ñ”œ°4)t¤¡•¬¡±…ÍÍ¥™¥•È¹¥¹±Õ‘•Ì¡€œ‘í½µµ…¹‘QåÁ•ô€¤°IÕ¹Ñ¥µ”µ…É•„±…ÍÍ¥™¥•È¥Ìµ¥ÍÍ¥¹œ€‘í½µµ…¹‘QåÁ•ô¹€¤ì4)™½È€¡½¹ÍĞ…É•„½˜lÁÉ½Ù¥‘•Èœ°€¥¹•ÍÑ¥½¸œ°€‘•±¥Ù•Éäœ°€…ÍÍ•µ‰±”t¤¡•¬¡±…ÍÍ¥™¥•È¹¥¹±Õ‘•Ì¡€œ‘í…É•…ô€¤°IÕ¹Ñ¥µ”µ…É•„±…ÍÍ¥™¥•È¥Ìµ¥ÍÍ¥¹œ€‘í…É•…ô¹€¤ì4)¡•¬¡±…ÍÍ¥™¥•È¹¥¹±Õ‘•Ì ‰Á}É•Í½ÕÉ•}ÑåÁ”€ô€…ÍÍ•µ‰±•}‰±Õ•ÁÉ¥¹Ğœˆ¤°€ÁÁÉ½Ù…°½µµ…¹‘ÌµÕÍĞ±…ÍÍ¥™äÍÍ•µ‰±”‰±Õ•ÁÉ¥¹ÑÌÍ•Á…É…Ñ•±ä¸œ¤ì4)½¹ÍĞÉ••¥ÁÑÕ¹Ñ¥½¹Ì€ô¹…µ”€ôøl¸¸¹ÍÅ°¹µ…Ñ¡±°¡¹•ÜI•áÀ¡IQ=HIA1U9Q%=8ÁÕ‰±¥qp¸‘í¹…µ•õqp¡mqqÍqqMt¨ıqp‘qpí€°€œœ¤¥t¹µ…À¡µ…Ñ €ôøµ…Ñ¡lÁt¤ì4)™½È€¡½¹ÍĞ¹…µ”½˜l•¹Ñ•ÉÁÉ¥Í•}…¥}½µÁ±•Ñ•}½µµ…¹œ°€•¹Ñ•ÉÁÉ¥Í•}…¥}™…¥±}½µµ…¹t¤ì4(€½¹ÍĞ‰½‘¥•Ì€ôÉ••¥ÁÑÕ¹Ñ¥½¹Ì¡¹…µ”¤ì4(€¡•¬¡‰½‘¥•Ì¹±•¹Ñ €ø€À°€‘í¹…µ•ôµÕÍĞ•á¥ÍĞ¹€¤ì4(€¡•¬¡‰½‘¥•Ì¹•Ù•Éä¡‰½‘ä€ôø€…‰½‘ä¹¥¹±Õ‘•Ì •¹Ñ•ÉÁÉ¥Í•}…ÍÍ•ÉÑ}İÉ¥Ñ…‰±”œ¤¤°€‘í¹…µ•ôµÕÍĞ™¥¹…±¥é”‘ÕÉ…‰±”ÑÉÕÑ İ¥Ñ¡½ÕĞÉÕ¹Ñ¥µ”…Ñ¥¹œ¹€¤ì4)ô4)½¹ÍĞ±…¥µÌ€ôÉ••¥ÁÑÕ¹Ñ¥½¹Ì •¹Ñ•ÉÁÉ¥Í•}…¥}±…¥µ}½µµ…¹œ¤ì4)½¹ÍĞ•™™•Ñ¥Ù•±…¥´€ô±…¥µÌ¹™¥¹‘1…ÍĞ¡‰½‘ä€ôø‰½‘ä¹¥¹±Õ‘•Ì Á}•á•ÕÑ¥½¹}Ñ½­•¸UU%œ¤€˜˜‰½‘ä¹¥¹±Õ‘•Ì •¹Ñ•ÉÁÉ¥Í•}…ÍÍ•ÉÑ}İÉ¥Ñ…‰±”œ¤¤ñğ€œœì4)¡•¬¡•™™•Ñ¥Ù•±…¥´¹¥¹±Õ‘•Ì •¹Ñ•ÉÁÉ¥Í•}½µµ…¹‘}ÉÕ¹Ñ¥µ•}…É•„œ¤°€™™•Ñ¥Ù”±…¥´µÕÍĞÕÍ”Ñ¡”•á¡…ÕÍÑ¥Ù”ÉÕ¹Ñ¥µ”µ…É•„±…ÍÍ¥™¥•È¸œ¤ì4)¡•¬¡•™™•Ñ¥Ù•±…¥´¹¥¹‘•á=˜ M1P€¨%9Q<É••¥ÁĞœ¤€ğ•™™•Ñ¥Ù•±…¥´¹¥¹‘•á=˜ •¹Ñ•ÉÁÉ¥Í•}…ÍÍ•ÉÑ}İÉ¥Ñ…‰±”œ¤°€á…ĞÉ•Á±…äµÕÍĞ‰”É•Í½±Ù•‰•™½É”ÉÕ¹Ñ¥µ”Ù…±¥‘…Ñ¥½¸¸œ¤ì4)¡•¬¡•™™•Ñ¥Ù•±…¥´¹¥¹‘•á=˜ •¹Ñ•ÉÁÉ¥Í•}…ÍÍ•ÉÑ}İÉ¥Ñ…‰±”œ¤€ğ•™™•Ñ¥Ù•±…¥´¹¥¹‘•á=˜ %9MIP%9Q<ÁÕ‰±¥Œ¹•¹Ñ•ÉÁÉ¥Í•}…¥}½µµ…¹‘}É••¥ÁÑÌœ¤°€9•Ü½µµ…¹‘ÌµÕÍĞ‰”ÉÕ¹Ñ¥µ”µÙ…±¥‘…Ñ•‰•™½É”É••¥ÁĞÉ•…Ñ¥½¸¸œ¤ì4)¡•¬¡ÍÅ°¹¥¹±Õ‘•Ì ‰ÉÕ¹Ñ¥µ•}…É•„QaP9=P9U10!,€¡ÉÕ¹Ñ¥µ•}…É•„%8€ ÁÉ½Ù¥‘•Èœ°€¥¹•ÍÑ¥½¸œ°€‘•±¥Ù•Éäœ°€…ÍÍ•µ‰±”œ¤¤ˆ¤°€I••¥ÁÑÌµÕÍĞÁ•ÉÍ¥ÍĞÑ¡•¥È±…ÍÍ¥™¥•ÉÕ¹Ñ¥µ”…É•„¸œ¤ì4)¡•¬ „½•¹Ñ•ÉÁÉ¥Í•}…¥}™…¥±}½µµ…¹‘mqÍqMuìÀ°àÀÁõp¹…Ñ¡p¡p¡p¤€ôøÕ¹‘•™¥¹•‘p¤½Ô¹Ñ•ÍĞ¡½µµ…¹‘M½ÕÉ”¤°€I••¥ÁĞ™…¥±ÕÉ”™¥¹…±¥é…Ñ¥½¸µÕÍĞ¹½Ğ‰”Í¥±•¹Ñ±äÍİ…±±½İ•¸œ¤ì4)¡•¬¡½µµ…¹‘M½ÕÉ”¹¥¹±Õ‘•Ì ‰I%AQ}%91%iQ%=9}%1ˆ¤°€•¹Õ¥¹”™¥¹…±¥é…Ñ¥½¸™…¥±ÕÉ”É•ÅÕ¥É•Ì…¸•áÁ±¥¥ĞÍÑ…‰±”•ÉÉ½È¸œ¤ì4)™½È€¡½¹ÍĞÑ½­•¸½˜l¥¹¥Ñ¥…±}É•ÅÕ•ÍÑ}¥œ°€•á•ÕÑ¥½¹}™•¹”œ°€±•…Í•}•áÁ¥É•Í}…Ğœ°€É•½¹¥±¥…Ñ¥½¹}½Õ¹Ğœ°€•¹Ñ•ÉÁÉ¥Í•}…¥}•™™•Ñ}©½ÕÉ¹…°œ°€•¹Ñ•ÉÁÉ¥Í•}…¥}É•½¹¥±•}½µµ…¹œ°€•¹Ñ•ÉÁÉ¥Í•}…¥}É•±½…‘}½µµ…¹œ°€•¹Ñ•ÉÁÉ¥Í•}•™™•Ñ}©½ÕÉ¹…±}¥µµÕÑ…‰±”t¤ì4(€¡•¬¡ÍÅ°¹¥¹±Õ‘•Ì¡Ñ½­•¸¤°I••¥ÁĞÉ•½Ù•Éä½¹ÑÉ…Ğ¥Ìµ¥ÍÍ¥¹œ€‘íÑ½­•¹ô¹€¤ì4)ô4)¡•¬ …•™™•Ñ¥Ù•±…¥´¹¥¹±Õ‘•Ì É•ÅÕ•ÍÑ}¥%L%MQ%9PI=4Á}É•ÅÕ•ÍĞœ¤°€É•ÅÕ•ÍÑ%µÕÍĞ¹½Ğ‰”Á…ÉĞ½˜±½¥…°É•Á±…ä¥‘•¹Ñ¥Ñä¸œ¤ì4)¡•¬¡ÍÅ°¹¥¹±Õ‘•Ì U9%EU€¡½É}¥°İ½É­ÍÁ…•}¥°…Ñ½É}¥°½µµ…¹‘}ÑåÁ”°¥‘•µÁ½Ñ•¹å}­•ä¤œ¤°€1½¥…°É••¥ÁĞ¥‘•¹Ñ¥ÑäµÕÍĞ¥¹±Õ‘”İ½É­ÍÁ…”Í½Á”¸œ¤ì4)¡•¬¡½µµ…¹‘M½ÕÉ”¹¥¹±Õ‘•Ì ±…¥µ¹Ñ•ÉÁÉ¥Í•I••¥ÁĞœ¤°€½µµ…¹¡…¹‘±•ÈµÕÍĞÕÍ”Ñ¡”Í¡…É•É•ÅÕ•ÍĞµ%µ¥¹‘•Á•¹‘•¹ĞÉ••¥ÁĞ½½É‘¥¹…Ñ½È¸œ¤ì4)¡•¬¡½µµ…¹‘M½ÕÉ”¹¥¹±Õ‘•Ì É•±½…‘¹Ñ•ÉÁÉ¥Í•I••¥ÁĞœ¤°€½µµ…¹¡…¹‘±•ÈµÕÍĞÉ•±½…‘ÕÉ…‰±”•™™•ĞÑÉÕÑ ‰•™½É”É•Á½ÉÑ¥¹œ™¥¹…±¥é…Ñ¥½¸™…¥±ÕÉ”¸œ¤ì4)™½È€¡½¹ÍĞµÕÑ…Ñ¥½¸½˜l4(€€•¹Ñ•ÉÁÉ¥Í•}É•…Ñ•}•Ù¥‘•¹•}Í½ÕÉ”œ°€•¹Ñ•ÉÁÉ¥Í•}½µµ¥Ñ}•Ù¥‘•¹•}•áÑÉ…Ñ¥½¸œ°4(€€•¹Ñ•ÉÁÉ¥Í•}É•Ù¥•İ}•Ù¥‘•¹•}…¹‘¥‘…Ñ”œ°€•¹Ñ•ÉÁÉ¥Í•}ÁÉ½µ½Ñ•}•Ù¥‘•¹•}Ñ½}…ÍÍ•ÍÍ}ØÈœ°4(€€•¹Ñ•ÉÁÉ¥Í•}½µµ¥Ñ}µ½‘•É¹¥é…Ñ¥½¹}…ÍÍ•ÍÍµ•¹Ğœ°€•¹Ñ•ÉÁÉ¥Í•}É•½É‘}¡¥¡}¥µÁ…Ñ}É•Ù¥•Üœ°4(€€•¹Ñ•ÉÁÉ¥Í•}½µµ¥Ñ}¡¥¡}¥µÁ…Ñ}…ÁÁÉ½Ù…°œ°€•¹Ñ•ÉÁÉ¥Í•}½µµ¥Ñ}‘•±¥Ù•Éå}¡…¹‘½™˜œ°4(€€•¹Ñ•ÉÁÉ¥Í•}½µµ¥Ñ}µ½¹¥Ñ½É}‰…Í•±¥¹”œ°€•¹Ñ•ÉÁÉ¥Í•}½µµ¥Ñ}…ÍÍ•µ‰±•}‰±Õ•ÁÉ¥¹Ğœ°4)t¤¡•¬¡ÍÅ°¹¥¹±Õ‘•Ì¡U9Q%=8ÁÕ‰±¥Œ¸‘íµÕÑ…Ñ¥½¹õ€¤°I••¥ÁĞµ…İ…É”µÕÑ…Ñ¥½¸IA¥Ìµ¥ÍÍ¥¹œ€‘íµÕÑ…Ñ¥½¹ô¹€¤ì4)¡•¬¡ÍÅ°¹¥¹±Õ‘•Ì É••¥ÁĞµÕ¹…İ…É”¥µÁ±•µ•¹Ñ…Ñ¥½¹Ì…É”ÁÉ¥Ù…Ñ”¥µÁ±•µ•¹Ñ…Ñ¥½¸‘•Ñ…¥±Ìœ¤°€I••¥ÁĞµÕ¹…İ…É”µÕÑ…Ñ¥½¸½Ù•É±½…‘ÌµÕÍĞ‰”É•Ù½­•™É½´‘”Í•ÉÙ¥”…ÕÑ¡½É¥Ñä¸œ¤ì4)™½È€¡½¹ÍĞÉ•ÅÕ¥É•½˜l4(€€•¹Ñ•ÉÁÉ¥Í•}É•Í½±Ù•}¡¥¡}¥µÁ…Ñ}É•Ù¥•İ}…ÕÑ¡½É¥Ñäœ°€•¹Ñ•ÉÁÉ¥Í•}É•Í½ÕÉ•}Í¹…ÁÍ¡½Ğœ°4(€€•¹Ñ•ÉÁÉ¥Í•}É•½É‘}¡¥¡}¥µÁ…Ñ}É•Ù¥•İ}ØÈœ°€•¹Ñ•ÉÁÉ¥Í•}½µµ¥Ñ}¡¥¡}¥µÁ…Ñ}…ÁÁÉ½Ù…±}ØÈœ°4(€€‰…ÕÑ¡½É¥Ñä´øøÉ•Ù¥•İÙ•¹Ñ%œ%L%MQ%9PI=4Á}É•Ù¥•İ}•Ù•¹Ñ}¥èéÑ•áĞˆ°4(€€ˆÉ•Í½ÕÉ•!…Í œ°•Ù•¹Ğ¹É•Í½ÕÉ•}¡…Í ˆ°€ˆÉ•Í½ÕÉ•Y•ÉÍ¥½¸œ°•Ù•¹Ğ¹É•Í½ÕÉ•}Ù•ÉÍ¥½¸ˆ°4)t¤¡•¬¡É•Ù¥•İÑ¥½¹I•Á±…åMÅ°¹¥¹±Õ‘•Ì¡É•ÅÕ¥É•¤°I•Ù¥•Ü½…Ñ¥½¸½É•Á±…ä½ÉÉ•Ñ¥½¸¥Ìµ¥ÍÍ¥¹œ€‘íÉ•ÅÕ¥É•‘ô¹€¤ì4)¡•¬¡É•Ù¥•İÑ¥½¹I•Á±…åMÅ°¹¥¹±Õ‘•Ì I=4AU	1%°…¹½¸°…ÕÑ¡•¹Ñ¥…Ñ•œ¤°€…¹½¹¥…°É•Ù¥•Ü…ÕÑ¡½É¥ÑäIAÌµÕÍĞÉ•©•Ğ‰É½İÍ•ÈÉ½±•Ì¸œ¤ì)¡•¬¡É•Ù¥•İÑ¥½¹I•Á±…åMÅ°¹¥¹±Õ‘•Ì I=4Í•ÉÙ¥•}É½±”œ¤°€1•…ä¡…Í µ…•ÁÑ¥¹œ‘”İÉ…ÁÁ•ÉÌµÕÍĞ‰”É•Ù½­•¸œ¤ì)¡•¬¡É•Ù¥•İÑ¥½¹I•Á±…åMÅ°¹¥¹±Õ‘•Ì ˆ…ÁÁÉ½Ù…°¹É•Ù¥•Ü¹É•½Éœ°€½µµ…¹œ°Á}É•Í½ÕÉ•}¥°É•ÍÕ±Ğ°€½µµ¥ÑÑ•œˆ¤°(€€I•Ù¥•Ü•™™•Ğ¥‘•¹Ñ¥ÑäµÕÍĞ‰”Ñ¡”É•Ù¥•İ•…¹½¹¥…°É•Í½ÕÉ”¸œ¤ì)½¹ÍĞ…ÁÁÉ½Ù…±½µµ…¹‘M½ÕÉ”€ô½µµ…¹‘M½ÕÉ”¹Í±¥” 4(€½µµ…¹‘M½ÕÉ”¹¥¹‘•á=˜ ½¹ÍĞ…ÁÁÉ½Ù…±I•Í½ÕÉ•QåÁ•Ìœ¤°4(€½µµ…¹‘M½ÕÉ”¹¥¹‘•á=˜ ÑåÁ”MÑÕ‘¥½É•…Ñ•I½Üœ¤°4(¤ì4)¡•¬ ……ÁÁÉ½Ù…±½µµ…¹‘M½ÕÉ”¹¥¹±Õ‘•Ì Í¡„ÈÔÙ)Í½¸œ¤°€‘”…ÁÁÉ½Ù…°½µµ…¹‘ÌµÕÍĞ¹½Ğ½µÁÕÑ”…¹½¹¥…°É•Í½ÕÉ”¡…Í¡•Ì¸œ¤ì4)¡•¬ ……ÁÁÉ½Ù…±½µµ…¹‘M½ÕÉ”¹¥¹±Õ‘•Ì É•Í½ÕÉ•}¡…Í õ•Ä¸œ¤°€‘”…ÁÁÉ½Ù…°½µµ…¹‘ÌµÕÍĞ¹½ĞÍ•±•ĞÉ•Ù¥•İÌ‰ä…¸…ÁÁ±¥…Ñ¥½¸¡…Í ¸œ¤ì4)¡•¬¡½µµ…¹‘M½ÕÉ”¹¥¹±Õ‘•Ì É•ÅÕ¥É•‘…Á…‰¥±¥Ñ¥•Í½É¹Ñ•ÉÁÉ¥Í•½µµ…¹œ¤°€I•Á±…ä…ÕÑ¡½É¥ÑäÉ•ÅÕ¥É•Ì½¹”½µµ…¹µ…Á…‰¥±¥Ñäµ…À¸œ¤ì)¡•¬¡½µµ…¹‘M½ÕÉ”¹¥¹±Õ‘•Ì …ÍÍ•ÉÑÕÉÉ•¹Ñ¹Ñ•ÉÁÉ¥Í•½µµ…¹‘ÕÑ¡½É¥Ñäœ¤°€I••¥ÁĞ‘¥Í±½ÍÕÉ”É•ÅÕ¥É•ÌÕÉÉ•¹Ğ½Á•É…Ñ¥½¸…ÕÑ¡½É¥Ñä¸œ¤ì)¡•¬¡½µµ…¹‘M½ÕÉ”¹¥¹±Õ‘•Ì …ÍÍ•ÉÑAÉ½Ù¥‘•É1¥™•å±•=Á•É…Ñ¥½¹ÕÑ¡½É¥Ñä¡ÁÉ½Ù¥‘•É=Á•É…Ñ¥½¸°±¥™•å±•ÕÑ¡½É¥Ñä¡ÕÉÉ•¹Ğ¤¤œ¤°(€€•¹•É¥ŒÁÉ½Ù¥‘•È½µµ…¹‘ÌÉ•ÅÕ¥É”ÁÉ½Ù¥‘•ÈµÍÁ•¥™¥ŒÍ½Á”…¹…Á…‰¥±¥Ñä…ÕÑ¡½É¥Ñä¸œ¤ì)¡•¬¡ÁÉ½Ù¥‘•É1¥™•å±•¹‘Á½¥¹ÑM½ÕÉ”¹¥¹±Õ‘•Ì …ÍÍ•ÉÑAÉ½Ù¥‘•É1¥™•å±•=Á•É…Ñ¥½¹ÕÑ¡½É¥Ñäœ¤°€AÉ½Ù¥‘•ÈÑ•Éµ¥¹…°É••¥ÁĞ‘¥Í±½ÍÕÉ”É•ÅÕ¥É•ÌÕÉÉ•¹Ğ±¥™•å±”…ÕÑ¡½É¥Ñä¸œ¤ì)¡•¬¡ÁÉ½Ù¥‘•É1¥™•å±•¹‘Á½¥¹ÑM½ÕÉ”¹¥¹±Õ‘•Ì …ÕÑ¡•¹Ñ¥…Ñ•AÉ½Ù¥‘•É1¥™•å±”¡É•ÅÕ•ÍĞ°•¹Ù•±½Á”°™…±Í”¤œ¤(€€˜˜ÁÉ½Ù¥‘•É1¥™•å±•¹‘Á½¥¹ÑM½ÕÉ”¹¥¹±Õ‘•Ì •¹™½É•ÑÑ•µÁÑÕÑ¡½É¥é…Ñ¥½¹Y•ÉÍ¥½¸œ¤°(AÉ½Ù¥‘•ÈÉ•Á±…ä…¹™¥¹…±¥é…Ñ¥½¸µÕÍĞÕÍ”ÕÉÉ•¹Ğ…ÕÑ¡½É¥Ñä…™Ñ•È…ÕÑ¡½É¥é…Ñ¥½¸µÙ•ÉÍ¥½¸¡…¹•Ì¸œ¤ì)½¹ÍĞ•¹Ñ•ÉÁÉ¥Í•MÕ•ÍÍ¥¹…±¥é…Ñ¥½¸€ô½µµ…¹‘M½ÕÉ”¹Í±¥” (€½µµ…¹‘M½ÕÉ”¹¥¹‘•á=˜ ½¹ÍĞÉ•ÍÕ±Ğ€ô…İ…¥Ğ•á•ÕÑ•½µµ…¹œ¤°(€½µµ…¹‘M½ÕÉ”¹¥¹‘•á=˜ ô…Ñ €¡•ÉÉ½È¤œ°½µµ…¹‘M½ÕÉ”¹¥¹‘•á=˜ ½¹ÍĞÉ•ÍÕ±Ğ€ô…İ…¥Ğ•á•ÕÑ•½µµ…¹œ¤¤°(¤ì)¡•¬¡•¹Ñ•ÉÁÉ¥Í•MÕ•ÍÍ¥¹…±¥é…Ñ¥½¸¹¥¹‘•á=˜ …İ…¥Ğ…ÍÍ•ÉÑÕÉÉ•¹ÑÕÑ¡½É¥Ñäœ¤(€€ğ•¹Ñ•ÉÁÉ¥Í•MÕ•ÍÍ¥¹…±¥é…Ñ¥½¸¹¥¹‘•á=˜ …İ…¥Ğ½µÁ±•Ñ•I••¥ÁĞœ¤(€€˜˜•¹Ñ•ÉÁÉ¥Í•MÕ•ÍÍ¥¹…±¥é…Ñ¥½¸¹±…ÍÑ%¹‘•á=˜ …İ…¥Ğ…ÍÍ•ÉÑÕÉÉ•¹ÑÕÑ¡½É¥Ñäœ¤(€€€€ø•¹Ñ•ÉÁÉ¥Í•MÕ•ÍÍ¥¹…±¥é…Ñ¥½¸¹¥¹‘•á=˜ …İ…¥Ğ½µÁ±•Ñ•I••¥ÁĞœ¤°(¹Ñ•ÉÁÉ¥Í”ÍÕ•ÍÌ™¥¹…±¥é…Ñ¥½¸µÕÍĞÉ•…ÕÑ¡½É¥é”‰•™½É”½µµ¥Ğ…¹‘¥Í±½ÍÕÉ”¸œ¤ì)½¹ÍĞ•¹Ñ•ÉÁÉ¥Í•…¥±ÕÉ•¥¹…±¥é…Ñ¥½¸€ô½µµ…¹‘M½ÕÉ”¹Í±¥” (€½µµ…¹‘M½ÕÉ”¹¥¹‘•á=˜ ‰¥˜€¡±…¥µ•‘I••¥ÁĞ€˜˜±…¥µ•‘ÕÑ¡½É¥Ñä€˜˜±…¥µ•‘½µµ…¹‘QåÁ”€˜˜½µµ…¹‘ÉÉ½È¹½‘”€„ôô€I%AQ}%91%iQ%=9}%1œ¤ˆ¤°(€½µµ…¹‘M½ÕÉ”¹¥¹‘•á=˜ •áÁ½ÉĞ½¹ÍĞ¡…¹‘±•¹Ñ•ÉÁÉ¥Í•%¹Ñ•±±¥•¹•=ÁÑ¥½¹Ìœ¤°(¤ì)¡•¬¡•¹Ñ•ÉÁÉ¥Í•…¥±ÕÉ•¥¹…±¥é…Ñ¥½¸¹¥¹‘•á=˜ …İ…¥Ğ…ÍÍ•ÉÑÕÉÉ•¹ÑÕÑ¡½É¥Ñäœ¤(€€ğ•¹Ñ•ÉÁÉ¥Í•…¥±ÕÉ•¥¹…±¥é…Ñ¥½¸¹¥¹‘•á=˜ …İ…¥Ğ™…¥±I••¥ÁĞœ¤(€€˜˜•¹Ñ•ÉÁÉ¥Í•…¥±ÕÉ•¥¹…±¥é…Ñ¥½¸¹±…ÍÑ%¹‘•á=˜ …İ…¥Ğ…ÍÍ•ÉÑÕÉÉ•¹ÑÕÑ¡½É¥Ñäœ¤(€€€€ø•¹Ñ•ÉÁÉ¥Í•…¥±ÕÉ•¥¹…±¥é…Ñ¥½¸¹¥¹‘•á=˜ …İ…¥Ğ™…¥±I••¥ÁĞœ¤°(¹Ñ•ÉÁÉ¥Í”™…¥±ÕÉ”™¥¹…±¥é…Ñ¥½¸µÕÍĞÉ•…ÕÑ¡½É¥é”‰•™½É”½µµ¥Ğ…¹‘¥Í±½ÍÕÉ”¸œ¤ì)½¹ÍĞÁÉ½Ù¥‘•ÉMÕ•ÍÍ¥¹…±¥é…Ñ¥½¸€ôÁÉ½Ù¥‘•É1¥™•å±•¹‘Á½¥¹ÑM½ÕÉ”¹Í±¥” (€ÁÉ½Ù¥‘•É1¥™•å±•¹‘Á½¥¹ÑM½ÕÉ”¹¥¹‘•á=˜ ½¹ÍĞÉ•ÍÕ±Ğ€ô…İ…¥Ğ€¡½Ù•ÉÉ¥‘•Ì¹•á•ÕÑ•½µµ…¹ñğ•á•ÕÑ•AÉ½Ù¥‘•É1¥™•å±•½µµ…¹¤œ¤°(€ÁÉ½Ù¥‘•É1¥™•å±•¹‘Á½¥¹ÑM½ÕÉ”¹¥¹‘•á=˜ ô…Ñ €¡•ÉÉ½È¤œ°ÁÉ½Ù¥‘•É1¥™•å±•¹‘Á½¥¹ÑM½ÕÉ”¹¥¹‘•á=˜ ½¹ÍĞÉ•ÍÕ±Ğ€ô…İ…¥Ğ€¡½Ù•ÉÉ¥‘•Ì¹•á•ÕÑ•½µµ…¹ñğ•á•ÕÑ•AÉ½Ù¥‘•É1¥™•å±•½µµ…¹¤œ¤¤°(¤ì)¡•¬¡ÁÉ½Ù¥‘•ÉMÕ•ÍÍ¥¹…±¥é…Ñ¥½¸¹¥¹‘•á=˜ …İ…¥ĞÉ•…ÕÑ¡½É¥é•AÉ½Ù¥‘•É1¥™•å±”œ¤(€€ğÁÉ½Ù¥‘•ÉMÕ•ÍÍ¥¹…±¥é…Ñ¥½¸¹¥¹‘•á=˜ ½Ù•ÉÉ¥‘•Ì¹½µÁ±•Ñ•I••¥ÁĞñğ½µÁ±•Ñ•¹Ñ•ÉÁÉ¥Í•I••¥ÁĞœ¤(€€˜˜ÁÉ½Ù¥‘•ÉMÕ•ÍÍ¥¹…±¥é…Ñ¥½¸¹±…ÍÑ%¹‘•á=˜ …İ…¥ĞÉ•…ÕÑ¡½É¥é•AÉ½Ù¥‘•É1¥™•å±”œ¤(€€€€øÁÉ½Ù¥‘•ÉMÕ•ÍÍ¥¹…±¥é…Ñ¥½¸¹¥¹‘•á=˜ ½Ù•ÉÉ¥‘•Ì¹½µÁ±•Ñ•I••¥ÁĞñğ½µÁ±•Ñ•¹Ñ•ÉÁÉ¥Í•I••¥ÁĞœ¤°(AÉ½Ù¥‘•ÈÍÕ•ÍÌ™¥¹…±¥é…Ñ¥½¸µÕÍĞÉ•…ÕÑ¡½É¥é”‰•™½É”½µµ¥Ğ…¹‘¥Í±½ÍÕÉ”¸œ¤ì)½¹ÍĞÁÉ½Ù¥‘•É…¥±ÕÉ•¥¹…±¥é…Ñ¥½¸€ôÁÉ½Ù¥‘•É1¥™•å±•¹‘Á½¥¹ÑM½ÕÉ”¹Í±¥” (€ÁÉ½Ù¥‘•É1¥™•å±•¹‘Á½¥¹ÑM½ÕÉ”¹¥¹‘•á=˜ ‰Í…™•ÉÉ½È¹½‘”€„ôô€UQ!=I%iQ%=9}MQ1œˆ¤°(€ÁÉ½Ù¥‘•É1¥™•å±•¹‘Á½¥¹ÑM½ÕÉ”¹¥¹‘•á=˜ ¥˜€¡±…¥µ•‘I••¥ÁĞ€˜˜±…¥µ•‘ÕÑ¡½É¥Ñä€˜˜±…¥µ•‘¹Ù•±½Á”¤ìœ°ÁÉ½Ù¥‘•É1¥™•å±•¹‘Á½¥¹ÑM½ÕÉ”¹¥¹‘•á=˜ ‰Í…™•ÉÉ½È¹½‘”€„ôô€UQ!=I%iQ%=9}MQ1œˆ¤¤°(¤ì)¡•¬¡ÁÉ½Ù¥‘•É…¥±ÕÉ•¥¹…±¥é…Ñ¥½¸¹¥¹‘•á=˜ …İ…¥ĞÉ•…ÕÑ¡½É¥é•AÉ½Ù¥‘•É1¥™•å±”œ¤(€€ğÁÉ½Ù¥‘•É…¥±ÕÉ•¥¹…±¥é…Ñ¥½¸¹¥¹‘•á=˜ ½Ù•ÉÉ¥‘•Ì¹™…¥±I••¥ÁĞñğ™…¥±¹Ñ•ÉÁÉ¥Í•I••¥ÁĞœ¤(€€˜˜ÁÉ½Ù¥‘•É…¥±ÕÉ•¥¹…±¥é…Ñ¥½¸¹±…ÍÑ%¹‘•á=˜ …İ…¥ĞÉ•…ÕÑ¡½É¥é•AÉ½Ù¥‘•É1¥™•å±”œ¤(€€€€øÁÉ½Ù¥‘•É…¥±ÕÉ•¥¹…±¥é…Ñ¥½¸¹¥¹‘•á=˜ ½Ù•ÉÉ¥‘•Ì¹™…¥±I••¥ÁĞñğ™…¥±¹Ñ•ÉÁÉ¥Í•I••¥ÁĞœ¤°(AÉ½Ù¥‘•È™…¥±ÕÉ”™¥¹…±¥é…Ñ¥½¸µÕÍĞÉ•…ÕÑ¡½É¥é”‰•™½É”½µµ¥Ğ…¹‘¥Í±½ÍÕÉ”¸œ¤ì(4)½¹Í½±”¹±½œ¡¹Ñ•ÉÁÉ¥Í”%¹Ñ•±±¥•¹”µ¥É…Ñ¥½¸½¹ÑÉ…Ğè€‘í…ÍÍ•ÉÑ¥½¹ÍôÍÑÉ¥ĞÍ¡•µ„°ÁÉ½Ù•¹…¹”°±¥™•å±”°0°…¹É½±±‰…¬…ÍÍ•ÉÑ¥½¹ÌÁ…ÍÍ•¹€¤ì4