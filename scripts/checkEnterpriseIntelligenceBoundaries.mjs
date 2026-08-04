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
  'supabase/functions/_shared/providerLifecycle.ts',
  'supabase/functions/_shared/providerLifecycleEndpoint.ts',
  'supabase/functions/enterprise-intelligence-command/index.ts',
  'supabase/functions/enterprise-intelligence-query/index.ts',
  'supabase/functions/enterprise-provider-lifecycle/index.ts',
  'supabase/migrations/20260804120000_enterprise_intelligence_authority.sql',
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
for (const required of ['resolveOrgId', 'resolveAuthority', 'enterprise_ai_job_ledger', 'runGovernedProviderRequest', 'RESOURCE_STALE', 'evidence.assess.promote', 'enterprise_promote_evidence_to_assess_v2']) {
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

console.log('Enterprise Intelligence source-boundary scan passed.');
