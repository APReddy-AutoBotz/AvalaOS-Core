import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');

const supabaseClient = read('services/supabaseClient.ts');
assert.match(supabaseClient, /VITE_AVALA_RUNTIME_MODE/);
assert.match(supabaseClient, /resolveRuntimeDataAccess/);
assert.doesNotMatch(supabaseClient, /Missing Supabase configuration.*mock/i);

const aiMode = read('services/aiMode.ts');
assert.doesNotMatch(aiMode, /local-demo|internal-dev/);
assert.match(aiMode, /pilot/);
assert.match(aiMode, /production/);

for (const adapter of [
  'authAdapter', 'orgAdapter', 'assessAdapter', 'docsAdapter', 'deliveryAdapter',
  'timesheetAdapter', 'handoffLedgerAdapter',
]) {
  const source = read(`services/adapters/${adapter}.ts`);
  assert.match(source, /getRuntimeDataAccess/);
  assert.doesNotMatch(source, /!isSupabaseConfigured\(\)/);
}

const authAdapter = read('services/adapters/authAdapter.ts');
const serverMapper = authAdapter.slice(
  authAdapter.indexOf('const mapSupabaseUserToAppUser'),
  authAdapter.indexOf('export const authAdapter'),
);
assert.doesNotMatch(serverMapper, /MOCK_USERS|MOCK_LOGIN_PROFILES|demoPersona/);

const app = read('App.tsx');
assert.doesNotMatch(app, /savedGeneration\s*\|\|\s*newGeneration/);
assert.doesNotMatch(app, /VITE_AVALA_AI_MODE/);

const storage = read('supabase/functions/_shared/storage.ts');
assert.doesNotMatch(storage, /Deno\.env\.get\('EXPORTS_BUCKET'\)|klarity-exports/);
assert.match(storage, /assertTenantStoragePath\(input\.orgId, path\)/);

const postgrest = read('supabase/functions/_shared/supabase.ts');
assert.doesNotMatch(postgrest, /await response\.text\(\)/);

for (const endpoint of [
  'supabase/functions/export-document/index.ts',
  'supabase/functions/export-decision-pack/index.ts',
]) {
  const source = read(endpoint);
  assert.match(source, /executeExport/);
  assert.doesNotMatch(source, /resolveOrgId|postgrest|safeErrorMessage/);
}

for (const sink of [
  'components/delivery/TaskDetailModal.tsx',
  'components/delivery/WorkspaceView.tsx',
  'components/docs/RefineSectionModal.tsx',
]) {
  const source = read(sink);
  assert.match(source, /renderSafeMarkdown/);
  assert.doesNotMatch(source, /marked\.parse/);
}

console.log('PR 1A fail-closed source boundary lint passed.');
