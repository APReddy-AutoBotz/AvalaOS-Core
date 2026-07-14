import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const requireText = (source, fragment, label) => {
  if (!source.includes(fragment)) throw new Error(`PR1D_SOURCE_BOUNDARY_MISSING: ${label}`);
};
const forbidText = (source, fragment, label) => {
  if (source.includes(fragment)) throw new Error(`PR1D_SOURCE_BOUNDARY_FORBIDDEN: ${label}`);
};

const migrationNames = fs.readdirSync(path.join(root, 'supabase/migrations')).filter(name => name.includes('pr1d'));
if (migrationNames.length !== 1) throw new Error(`PR1D_MIGRATION_COUNT: expected 1, received ${migrationNames.length}`);

const migration = read(`supabase/migrations/${migrationNames[0]}`);
const command = read('supabase/functions/_shared/assessV2Command.ts');
const handlers = read('supabase/functions/_shared/assessV2Handlers.ts');
const router = read('supabase/functions/_shared/assessV2Router.ts');
const database = read('supabase/functions/_shared/assessV2Db.ts');
const evaluator = read('services/assessV2/evaluator.ts');
const registry = read('services/assessV2/registry.ts');
const decisionVersion = read('services/assessV2/decisionVersion.ts');
const client = read('services/assessV2Client.ts');
const workspace = read('components/assess-v2/AssessV2Workspace.tsx');

for (const type of [
  'assessment_v2.create',
  'assessment_v2.clone_from_v1',
  'assessment_v2.draft.upsert',
  'assessment_v2.finalize',
]) requireText(command, type, `typed command ${type}`);

for (const capability of [
  'assess.v2.read',
  'assess.v2.create',
  'assess.v2.clone',
  'assess.v2.draft.write',
  'assess.v2.finalize',
]) requireText(migration, capability, `normalized capability ${capability}`);

requireText(command, "else{exact(p,['caseId']);payload={caseId:uuid(p.caseId)}}", 'finalize accepts only caseId');
forbidText(command, "['caseId', 'decision']", 'client-supplied finalized decision');
forbidText(client, 'evaluateAssessmentV2(', 'browser-side deterministic evaluation');
forbidText(workspace, 'studio_handoff', 'V2 Studio handoff affordance');
forbidText(workspace, 'govern.resolve', 'V2 Govern resolution affordance');
forbidText(`${command}\n${handlers}\n${router}`, 'assessment_v2.approve', 'V2 approval command');

requireText(handlers, 'buildDecisionVersionV2', 'server-side snapshot construction');
requireText(database, 'serviceRoleKey', 'private service-role transport');
requireText(router, 'assessV2ErrorBody', 'sanitized stable errors');
requireText(registry, 'validateFieldRegistry', 'field/rule registry contract');
requireText(evaluator, 'Bounded Agent', 'bounded-agent necessity gate');
requireText(decisionVersion, 'buildDecisionDigestV2', 'SHA-256 decision references');
forbidText(decisionVersion, 'sha-lite', 'V1 lightweight hash reuse');

for (const table of [
  'assess_v2_cases',
  'assess_v2_case_versions',
  'assess_v2_primitives',
  'assess_v2_edges',
  'assess_v2_decision_points',
  'assess_v2_exception_paths',
  'assess_v2_application_assets',
  'assess_v2_application_interactions',
  'assess_v2_evidence_links',
  'assess_v2_decision_versions',
  'assess_v2_candidate_evaluations',
  'assess_v2_gate_results',
  'assess_v2_control_requirements',
  'assess_v2_modernization_dispositions',
]) requireText(migration, table, `normalized/immutable table ${table}`);
requireText(migration, 'FORCE ROW LEVEL SECURITY', 'forced RLS for normalized V2 tables');

for (const role of ['PUBLIC', 'anon', 'authenticated']) requireText(migration, role, `private RPC/table ACL role ${role}`);
requireText(migration, 'digest(', 'database SHA-256 digest');
requireText(migration, "'reviewer_ready'", 'reviewer-ready final state');
requireText(migration, 'pr1b_assert_command_authority', 'independent transactional authorization');
requireText(migration, 'privileged_audit_events', 'atomic privileged audit');
requireText(migration, 'assess_command_receipts', 'actor-scoped command receipt');
requireText(migration, "CHECK(status IN('draft','reviewer_ready','superseded'))", 'V2 state boundary excludes approval and handoff');

const oldMigration = read('supabase/migrations/20260713120000_pr1c_enterprise_assess_ui_govern_studio_handoff.sql');
if (oldMigration.includes("a.status IN ('Ready for Review','Changes Requested')")) {
  throw new Error('PR1D_HISTORY_MUTATION: accepted PR 1C migration was edited');
}
requireText(migration, 'Changes Requested', 'forward-only V1 resubmission compatibility correction');

console.log('PR 1D V1/V2, rule, command, persistence, authority, snapshot, UI, and rollback source boundaries passed.');
