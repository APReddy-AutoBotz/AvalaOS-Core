import fs from 'node:fs';
import path from 'node:path';

const required = [
  'services/studioArtifacts/contracts.ts',
  'docs/architecture/studio-governed-artifact-authority.md',
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`STUDIO_ARTIFACT_SOURCE_MISSING: ${file}`);
const contracts = fs.readFileSync(required[0], 'utf8');
for (const token of ['brd', 'frd', 'pdd', 'studio.artifact.generation.request', 'studio.artifact.approval.resolve', 'studio.artifacts.read', 'superseded']) {
  if (!contracts.includes(token)) throw new Error(`STUDIO_ARTIFACT_CONTRACT_MISSING: ${token}`);
}
const roots = ['components', 'services', 'supabase/functions'];
const files = [];
const walk = dir => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const item = path.join(dir, entry.name); if (entry.isDirectory()) walk(item); else if (/\.(ts|tsx)$/.test(item)) files.push(item); } };
roots.forEach(walk);
const legacyLocalFiles = new Set(['components/docs/DocsProvider.tsx', 'services/docsService.ts', 'services/adapters/docsAdapter.ts']);
const offenders = files.filter(file => !legacyLocalFiles.has(file) && /docsAdapter\.saveGeneration|\.from\(['"]document_generations['"]\)\.(?:insert|upsert)/s.test(fs.readFileSync(file, 'utf8')));
if (offenders.length) throw new Error(`LEGACY_STUDIO_ENTERPRISE_WRITE_FORBIDDEN: ${offenders.join(', ')}`);
for (const file of ['components/docs/DocsProvider.tsx', 'services/docsService.ts']) {
  const source = fs.readFileSync(file, 'utf8');
  if (!source.includes('legacyLocalOnly') || !source.includes('allowLocalAuthority')) throw new Error(`LEGACY_STUDIO_LOCAL_GUARD_MISSING: ${file}`);
}
console.log(`Studio artifact source boundaries passed (${files.length} source files inspected; legacy adapter isolated).`);
const workflow = fs.readFileSync('.github/workflows/studio-governed-artifacts.yml', 'utf8');
const checkoutCount = [...workflow.matchAll(/uses: actions\/checkout@v4/g)].length;
const fullHistoryCount = [...workflow.matchAll(/fetch-depth:\s*0/g)].length;
if (checkoutCount !== 3 || fullHistoryCount !== checkoutCount) throw new Error('STUDIO_CI_FULL_HISTORY_REQUIRED_FOR_RETAINED_GATES');
console.log(`Studio CI checkout contract passed (${fullHistoryCount} full-history jobs).`);
