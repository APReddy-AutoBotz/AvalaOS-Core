import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const requireText = (source, fragment, label) => {
  if (!source.includes(fragment)) throw new Error(`PR1D_SOURCE_BOUNDARY_MISSING: ${label}`);
};
const forbidText = (source, fragment, label) => {
  if (source.includes(fragment)) throw new Error(`PR1D_SOURCE_BOUNDARY_FORBIDDEN: ${label}`);
};

const foundationName = '20260714120000_pr1d_assess_v2_decision_intelligence.sql';
const correctionName = '20260715120000_pr1d_decision_integrity_correction.sql';
const evidenceBoundaryName = '20260717120000_pr1d_evidence_attestation_boundary.sql';
const factValidationName = '20260719130000_pr1d_author_fact_validation.sql';
const migrationNames = fs.readdirSync(path.join(root, 'supabase/migrations')).filter(name => name.includes('pr1d')).sort();
for (const expected of [foundationName, correctionName, evidenceBoundaryName, factValidationName]) {
  if (!migrationNames.includes(expected)) throw new Error(`PR1D_MIGRATION_MISSING: ${expected}`);
}
if (migrationNames.length !== 4) throw new Error(`PR1D_MIGRATION_COUNT: expected 4, received ${migrationNames.length}`);

const foundation = read(`supabase/migrations/${foundationName}`);
const correction = read(`supabase/migrations/${correctionName}`);
const evidenceBoundary = read(`supabase/migrations/${evidenceBoundaryName}`);
const factValidation = read(`supabase/migrations/${factValidationName}`);
const migrations = `${foundation}\n${correction}\n${evidenceBoundary}\n${factValidation}`;
const capabilities = read('services/assessV2/capabilities.ts');
const command = read('supabase/functions/_shared/assessV2Command.ts');
const handlers = read('supabase/functions/_shared/assessV2Handlers.ts');
const router = read('supabase/functions/_shared/assessV2Router.ts');
const database = read('supabase/functions/_shared/assessV2Db.ts');
const evaluator = read('services/assessV2/evaluator.ts');
const registry = read('services/assessV2/registry.ts');
const decisionVersion = read('services/assessV2/decisionVersion.ts');
const types = read('services/assessV2/types.ts');
const client = read('services/assessV2Client.ts');
const enterpriseBoundary = read('services/enterpriseAssessContract.ts');
const sessionPolicy = read('services/enterpriseSessionPolicy.ts');
const workspace = read('components/assess-v2/AssessV2Workspace.tsx');
const browserFixture = read('tests/browser/pr1d.spec.ts');
const architecture = read('docs/architecture/assess-v2-decision-intelligence-architecture.md');
const migrationDoc = read('docs/migrations/pr1d-assess-v2-decision-intelligence.md');

for (const type of [
  'assessment_v2.create',
  'assessment_v2.clone_from_v1',
  'assessment_v2.draft.upsert',
  'assessment_v2.finalize',
]) requireText(command, type, `typed command ${type}`);

for (const [key, capability] of Object.entries({
  read: 'assess.v2.read',
  create: 'assess.v2.create',
  clone: 'assess.v2.clone',
  draftWrite: 'assess.v2.draft.write',
  finalize: 'assess.v2.finalize',
})) {
  requireText(capabilities, `${key}: '${capability}'`, `typed capability ${capability}`);
  requireText(migrations, capability, `migration capability ${capability}`);
  requireText(architecture, `\`${capability}\``, `architecture capability ${capability}`);
  requireText(migrationDoc, `\`${capability}\``, `migration documentation capability ${capability}`);
}
requireText(handlers, 'ASSESS_V2_COMMAND_CAPABILITY', 'server uses canonical capability mapping');
requireText(workspace, 'ASSESS_V2_CAPABILITIES.draftWrite', 'UI uses canonical draft-write capability');
requireText(workspace, "['ready', 'read_only'].includes(sessionState)", 'read-only sessions retain V2 discovery');
requireText(workspace, 'disabled={busy || !canRead}', 'read-only sessions retain V2 reload');
requireText(workspace, "sessionState === 'ready' && discoveryState === 'ready'", 'V2 create and clone remain ready-only');
forbidText(workspace, "if (sessionState !== 'ready' || !tenantContext)", 'read-only discovery short circuit');
requireText(workspace, 'Independent review: pending', 'Decision Pack states independent review boundary');
requireText(workspace, 'primitiveFactKeys.map', 'UI exposes primitive fact authoring');
requireText(workspace, 'accountable owner', 'UI exposes application accountable-owner authoring');
requireText(browserFixture, 'displayed primitive and lifecycle controls allow a scaffolded V2 case to finalize', 'browser proves displayed required controls can finalize');
forbidText(workspace, "['suggested','submitted','validated','rejected']", 'validated authoring control');
requireText(browserFixture, 'ASSESS_V2_CAPABILITIES.draftWrite', 'browser fixture uses canonical draft-write capability');
for (const [source, label] of [[capabilities, 'typed contract'], [handlers, 'server'], [client, 'client'], [workspace, 'UI'], [browserFixture, 'browser fixture'], [migrations, 'migration'], [architecture, 'architecture'], [migrationDoc, 'migration docs']]) {
  forbidText(source, "assess.v2.write", `obsolete capability in ${label}`);
}

requireText(client, 'readEnterpriseErrorCode(payload', 'V2 client parses stable runtime boundary codes');
requireText(client, 'projectImmutableCloneEvidence', 'client projects immutable clone evidence into later draft reads');
requireText(client, ".eq('source_kind', 'v1_clone')", 'client binds imported evidence to the immutable clone version');
requireText(client, "child('assess_v2_evidence_links', immutableCloneVersion.id)", 'client reloads immutable imported evidence');
requireText(client, 'importedEvidenceClaimIds', 'client preserves imported evidence provenance claims');
requireText(enterpriseBoundary, "code === 'FEATURE_DISABLED' || code === 'READ_ONLY'", 'V2 runtime boundary codes remain distinct');
requireText(sessionPolicy, 'FEATURE_DISABLED: {', 'disabled mode has a distinct presentation');
requireText(sessionPolicy, 'READ_ONLY: {', 'maintenance mode has a distinct presentation');
if ((sessionPolicy.match(/state: 'read_only'/g) ?? []).length < 2) {
  throw new Error('PR1D_SOURCE_BOUNDARY_MISSING: V2 runtime failures present safe read-only fallbacks');
}
requireText(sessionPolicy, 'Existing V2 decisions remain available', 'safe fallback preserves committed V2 reads');
requireText(command, "exact(rawPayload, ['caseId'])", 'finalize accepts only caseId');
forbidText(command, "['caseId', 'decision']", 'client-supplied finalized decision');
forbidText(client, 'evaluateAssessmentV2(', 'browser-side deterministic evaluation');
forbidText(workspace, 'studio_handoff', 'V2 Studio handoff affordance');
forbidText(workspace, 'govern.resolve', 'V2 Govern resolution affordance');
forbidText(`${command}\n${handlers}\n${router}`, 'assessment_v2.approve', 'V2 approval command');

requireText(handlers, 'buildDecisionVersionV2', 'server-side snapshot construction');
for (const canonicalParameter of ['p_input_canonical', 'p_evidence_canonical', 'p_output_canonical']) {
  requireText(database, canonicalParameter, `database adapter ${canonicalParameter}`);
  requireText(correction, canonicalParameter, `corrected finalize RPC ${canonicalParameter}`);
}
requireText(correction, 'imported_facts', 'durable imported V1 facts');
requireText(correction, "ELSE '{}'::jsonb END", 'normal V1 draft audit metadata remains non-null');
requireText(correction, 'convert_to', 'UTF-8 canonical digest input');
requireText(correction, 'digest(', 'database SHA-256 recomputation');
requireText(database, 'serviceRoleKey', 'private service-role transport');
requireText(router, 'assessV2ErrorBody', 'sanitized stable errors');
requireText(registry, 'validateFieldRegistry', 'field/rule registry contract');
requireText(evaluator, 'Bounded Agent', 'bounded-agent necessity gate');
requireText(evaluator, 'Verified is unreachable', 'PR 1D cannot self-attest evidence');
requireText(evaluator, "const approvalBound = declared === 'Conditional' || (declared === 'Ready' && writeFinancialAction);", 'financial writes remain approval-bound even when technically ready');
requireText(evaluator, "const allowedActions = declared === 'Ready' && !approvalBound", 'financial writes cannot appear as directly allowed actions');
requireText(evaluator, 'deriveEvidenceConfidence(c, asOf)', 'evidence confidence uses the decision as-of timestamp');
requireText(command, "['suggested', 'submitted']", 'draft parser permits only evidence submission states');
forbidText(command, 'reviewerIds', 'caller-controlled reviewer authority');
requireText(evidenceBoundary, "payload->>'status' IS NULL", 'database rejects missing or null author evidence status');
requireText(evidenceBoundary, 'PR1D_AUTHOR_ATTESTATION_FORBIDDEN', 'database rejects author attestation');
requireText(decisionVersion, 'buildDecisionDigestV2', 'SHA-256 decision references');
requireText(decisionVersion, 'evaluateAssessmentV2(inputSnapshot, createdAt)', 'finalization timestamp drives deterministic evidence evaluation');
requireText(types, "ASSESS_V2_RULE_SET_VERSION = 'assess-v2-rules-2026-07'", 'INT-006 rule-set version remains stable');
requireText(types, "ASSESS_V2_DECISION_VERSION = 'assess-v2-decision-2026-07-19-2'", 'corrected confidence output has a new decision version');
forbidText(decisionVersion, 'sha-lite', 'V1 lightweight hash reuse');


const draftUpsertStart = factValidation.indexOf('CREATE OR REPLACE FUNCTION public.pr1d_upsert_assess_v2_draft');
const draftUpsertEnd = factValidation.indexOf('REVOKE ALL ON FUNCTION public.pr1d_upsert_assess_v2_draft', draftUpsertStart + 1);
if (draftUpsertStart < 0 || draftUpsertEnd < 0) throw new Error('PR1D_SOURCE_BOUNDARY_MISSING: corrected draft-upsert RPC');
const draftUpsert = factValidation.slice(draftUpsertStart, draftUpsertEnd);
for (const [fragment, label] of [
  ['FROM public.assess_v2_runtime_control WHERE singleton=true FOR SHARE', 'draft replay locks runtime control'],
  ["IF control.singleton IS NULL OR NOT control.enabled THEN RAISE EXCEPTION 'PR1D_FEATURE_DISABLED'", 'draft replay remains disabled fail-closed'],
  ["'assess.v2.draft.write',p_authorization_version", 'draft replay revalidates current authority'],
  ["r.status<>'succeeded'", 'draft replay accepts succeeded receipts only'],
  ["r.response->>'id' IS DISTINCT FROM p_case_id::text", 'draft replay binds the case resource'],
  ["r.response->>'status' IS DISTINCT FROM 'draft'", 'draft replay binds the draft response state'],
  ["r.response->>'version' IS DISTINCT FROM (p_expected_version+1)::text", 'draft replay binds the committed version'],
  ["IF control.read_only THEN RAISE EXCEPTION 'PR1D_READ_ONLY'", 'read-only misses remain mutation-blocking'],
]) requireText(draftUpsert, fragment, label);
const firstDraftReceiptLookup = draftUpsert.indexOf('SELECT * INTO r FROM public.assess_command_receipts');
const draftReadOnlyGate = draftUpsert.indexOf("IF control.read_only THEN RAISE EXCEPTION 'PR1D_READ_ONLY'");
const draftCaseLock = draftUpsert.indexOf('SELECT * INTO c FROM public.assess_v2_cases');
if (!(firstDraftReceiptLookup >= 0 && firstDraftReceiptLookup < draftReadOnlyGate && draftReadOnlyGate < draftCaseLock)) {
  throw new Error('PR1D_SOURCE_BOUNDARY_MISSING: exact draft receipt replay precedes the read-only mutation gate and case lock');
}
requireText(correction, "imported_evidence.payload - ARRAY['reviewerIds','contradictory']", 'Edge-shaped imported evidence saves while server-only metadata remains immutable');
requireText(correction, "AND imported_evidence.id::text=x->>'id'", 'exact imported evidence round-trip creates no shadow row');
requireText(correction, 'imported_evidence.id=current_evidence.id', 'authoritative loader prefers immutable imported evidence');
requireText(correction, 'clone_version.version=1', 'immutable imported evidence binds version one');
for (const [fragment, label] of [
  ["p_fact ?& ARRAY['fieldId','value','status','evidenceIds','source']", 'exact author fact keys'],
  ["p_fact->>'source' NOT IN ('user','system','template')", 'author fact sources exclude v1-import'],
  ["p_fact->>'source'='template' AND p_fact->>'status'='known'", 'template facts cannot self-attest as known'],
  ['pr1d_author_agent_necessity_valid', 'canonical primitive and top-level agent fact validation'],
  ["RETURN jsonb_build_object('errorCode','INVALID_COMMAND')", 'invalid direct RPC envelope'],
]) requireText(factValidation, fragment, label);
const draftFactValidation = draftUpsert.indexOf('IF NOT public.pr1d_authoring_facts_valid(p_authoring)');
const draftCommandClaim = draftUpsert.indexOf('r:=public.pr1b_claim_command');
if (!(draftFactValidation >= 0 && draftFactValidation < draftCommandClaim)) {
  throw new Error('PR1D_SOURCE_BOUNDARY_MISSING: author fact validation precedes draft receipt claim');
}
forbidText(correction, 'current_evidence.version_id=v.id AND current_evidence.id=imported_evidence.id', 'mutable draft evidence shadowing immutable import');
for (const table of [
  'assess_v2_cases', 'assess_v2_case_versions', 'assess_v2_primitives', 'assess_v2_edges',
  'assess_v2_decision_points', 'assess_v2_exception_paths', 'assess_v2_application_assets',
  'assess_v2_application_interactions', 'assess_v2_evidence_links', 'assess_v2_decision_versions',
  'assess_v2_candidate_evaluations', 'assess_v2_gate_results', 'assess_v2_control_requirements',
  'assess_v2_modernization_dispositions',
]) requireText(migrations, table, `normalized/immutable table ${table}`);
requireText(migrations, 'FORCE ROW LEVEL SECURITY', 'forced RLS for normalized V2 tables');
for (const role of ['PUBLIC', 'anon', 'authenticated']) requireText(migrations, role, `private RPC/table ACL role ${role}`);
requireText(migrations, "'reviewer_ready'", 'reviewer-ready final state');
requireText(migrations, 'pr1b_assert_command_authority', 'independent transactional authorization');
requireText(migrations, 'privileged_audit_events', 'atomic privileged audit');
requireText(migrations, 'assess_command_receipts', 'actor-scoped command receipt');
requireText(foundation, "CHECK(status IN('draft','reviewer_ready','superseded'))", 'V2 state boundary excludes approval and handoff');

const buyerExtensions = new Set(['.ts', '.tsx', '.md', '.json']);
const correctionEntrySha = '7d3e8fcccdc524959d2f28b4960d617813d9e2fc';
let tracked;
try {
  tracked = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR', correctionEntrySha, '--'], { cwd: root, encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
} catch {
  throw new Error(`PR1D_BUYER_COPY_BASELINE_UNAVAILABLE: ${correctionEntrySha}`);
}
const corruption = /\u00c2|\u00c3|\u00e2(?:\u0080|\u20ac)|\u00f0\u0178|\ufffd/;
for (const file of tracked) {
  if (!buyerExtensions.has(path.extname(file).toLowerCase())) continue;
  const source = read(file);
  if (corruption.test(source)) throw new Error(`PR1D_BUYER_COPY_ENCODING: ${file}`);
}

console.log('PR 1D capability, V1/V2, command, persistence, database digest, UI, UTF-8 buyer-copy, and rollback source boundaries passed.');
