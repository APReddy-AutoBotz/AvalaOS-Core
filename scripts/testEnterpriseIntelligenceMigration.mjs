import fs from 'node:fs';
import path from 'node:path';

const migrationPath = path.join(process.cwd(), 'supabase/migrations/20260804120000_enterprise_intelligence_authority.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');
const requiredTables = [
  'enterprise_ai_capability_routes',
  'enterprise_ai_command_receipts',
  'enterprise_ai_job_ledger',
  'enterprise_evidence_sources',
  'enterprise_evidence_source_versions',
  'enterprise_evidence_candidates',
  'enterprise_studio_delivery_handoffs',
  'enterprise_delivery_work_packages',
  'enterprise_monitor_baselines',
  'enterprise_modernization_assessments',
  'enterprise_modernization_decisions',
  'enterprise_assemble_blueprints',
  'enterprise_high_impact_approvals',
];
for (const table of requiredTables) {
  if (!sql.includes(`CREATE TABLE IF NOT EXISTS public.${table}`)) throw new Error(`Missing table ${table}`);
}
const forceRlsCount = (sql.match(/FORCE ROW LEVEL SECURITY/g) || []).length;
if (forceRlsCount < requiredTables.length) throw new Error(`Expected forced RLS for ${requiredTables.length} tables, found ${forceRlsCount}.`);
if (/live_telemetry_connected\s+BOOLEAN\s+NOT NULL\s+DEFAULT\s+true/i.test(sql)) throw new Error('Live telemetry must remain disabled.');
if (/readiness\s+TEXT\s+NOT NULL\s+CHECK\s*\([^)]*\bready\b/i.test(sql)) throw new Error('Monitor readiness cannot claim ready in Phase 1.');
if (/status\s+TEXT\s+NOT NULL\s+CHECK\s*\([^)]*published/i.test(sql)) throw new Error('Enterprise Phase 1 schema cannot publish external side effects.');
if (!sql.includes('FOREIGN KEY (workspace_id, org_id)')) throw new Error('Workspace/org composite foreign keys are required.');
if (!sql.includes('enterprise_high_impact_approval_separation_check')) throw new Error('Three-person approval separation is required.');
console.log('Enterprise Intelligence migration contract passed (static PostgreSQL contract; live PostgreSQL execution remains a separate gate).');
