// Execution authority is reviewed source, not a supplied manifest or package alias.
import { isSnapshotPath } from './creationAccessValidationContract.mjs';
export function isAssessImportSnapshotPath(path) {
  return isSnapshotPath(path)
    || /^testing\/assess-import\/fixtures\/[^/]+\.(?:csv|txt|md|xlsx|docx|pdf)$/.test(path)
    || path === 'docs/quality/ai-boundary-static-scan-allowlist.json';
}

// Retain emitted test outcomes, never infer assertion PASS from an exit code.
// Only fixed TAP result/summary lines or the focused PG assertion envelope are
// accepted; diagnostic objects and document/provider content are not retained.
export function observedAssessImportResults(output) {
  const observed = [];
  for (const line of output.split(/\r?\n/)) {
    const result = line.match(/^(ok|not ok) (\d+) - ([^\r\n]{1,500})$/);
    if (result) {
      const directive = result[3].match(/\s+#\s*(SKIP|TODO)\b/i);
      observed.push({ kind: 'tap-result', ordinal: Number(result[2]),
        status: directive ? 'not_run' : result[1] === 'ok' ? 'passed' : 'failed',
        title: result[3] });
      continue;
    }
    const summary = line.match(/^# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$/);
    if (summary) { observed.push({ kind: 'tap-summary', metric: summary[1], count: Number(summary[2]) }); continue; }
    if (!line.startsWith('ASSESS_DOCUMENT_MAPPING_PG_ASSERTION ')) continue;
    try {
      const value = JSON.parse(line.slice('ASSESS_DOCUMENT_MAPPING_PG_ASSERTION '.length));
      if (/^MAP-PG-[A-Za-z0-9-]{1,100}$/.test(value.testId) && ['passed', 'failed', 'not_run'].includes(value.result)) {
        observed.push({ kind: 'postgres-assertion', testId: value.testId, status: value.result });
      }
    } catch { /* Non-envelope diagnostics are not proof. */ }
  }
  return observed;
}
const compile = 'node scripts/runEnterpriseIntelligenceTest.mjs';
const edge = `${compile} supabase/functions/deno.d.ts`;
export const assessImportScripts = Object.freeze({
  'test:assess-import:authority': 'node scripts/checkEnterpriseIntelligenceBoundaries.mjs && node --test scripts/enterpriseIntelligenceIdempotencyBoundary.test.mjs && node scripts/checkEnterpriseIntelligenceCiContract.mjs',
  'test:assess-import:harness': 'node --test scripts/rewriteTestModuleSpecifiers.test.mjs scripts/assessImportValidationContract.test.mjs scripts/runTranscriptFlowBrowser.test.mjs scripts/pr1dBrowserFixtureContract.test.mjs scripts/enterpriseProjectionSchemaContract.test.mjs scripts/assessDocumentPostgresTestGuards.test.mjs scripts/projectionRpcPostgrestContract.test.mjs',
  'test:assess-import:parser': `${compile} supabase/functions/_shared/assessDocumentSpreadsheet.ts tests/fixtures/assessImportSpreadsheets.ts supabase/functions/_shared/assessDocumentSpreadsheet.test.ts`,
  'test:assess-import:parser-coverage': `${compile} --coverage=supabase/functions/_shared/assessDocumentSpreadsheet.ts supabase/functions/_shared/assessDocumentSpreadsheet.ts tests/fixtures/assessImportSpreadsheets.ts supabase/functions/_shared/assessDocumentSpreadsheet.test.ts`,
  'test:assess-import:domain': `${compile} services/assessImport/contracts.ts services/assessImport/contracts.test.ts && ${compile} services/assessImport/mapping.ts services/assessImport/mapping.test.ts && ${compile} services/assessImport/targetRegistry.ts services/assessImport/targetRegistry.test.ts`,
  'test:assess-import:api': `${edge} supabase/functions/_shared/assessDocumentMapping.ts supabase/functions/_shared/assessDocumentMapping.test.ts && ${edge} supabase/functions/_shared/assessMappingProviderBudget.ts supabase/functions/_shared/assessMappingProviderBudget.test.ts && ${edge} supabase/functions/_shared/enterpriseIntelligenceCommand.ts supabase/functions/_shared/enterpriseIntelligenceMappingCommand.test.ts`,
  'test:assess-import:migrations': 'node --test scripts/testAssessSupportingDocumentMappingMigration.mjs scripts/prCMigrationTailContract.test.mjs scripts/projectionRpcVolatilityMigrationContract.test.mjs',
  'test:assess-import:postgres': 'node scripts/testAssessSupportingDocumentMappingPostgres.mjs',
  'test:assess-import:budget-pipeline': 'node scripts/assessStudioBudgetPipelinePostgres.mjs',
  'test:assess-import:studio-recovery': `${compile} --coverage=supabase/functions/_shared/studioArtifactDb.ts supabase/functions/deno.d.ts supabase/functions/_shared/studioArtifactDb.ts supabase/functions/_shared/studioArtifactDb.test.ts && ${compile} --coverage=supabase/functions/_shared/studioArtifactGeneration.ts supabase/functions/deno.d.ts services/enterpriseIntelligence.ts services/studioArtifacts/contracts.ts supabase/functions/_shared/studioArtifactPrBTestEvidence.ts supabase/functions/_shared/enterpriseIntelligenceAi.ts supabase/functions/_shared/providerBudget.ts supabase/functions/_shared/studioArtifactProvider.ts supabase/functions/_shared/studioArtifactGeneration.ts supabase/functions/_shared/studioArtifactGeneration.test.ts`,
  'test:assess-import:retained-postgres': 'node scripts/testTranscriptFlowPostgres.mjs',
  'test:assess-import:projection-postgrest': 'node --test scripts/testProjectionRpcPostgrest.mjs',
  'test:assess-import:mapping-coverage': `${compile} --coverage=services/assessImport/contracts.ts services/assessImport/contracts.ts services/assessImport/contracts.test.ts && ${compile} --coverage=services/assessImport/mapping.ts services/assessImport/mapping.ts services/assessImport/mapping.test.ts && ${compile} --coverage=services/assessImport/targetRegistry.ts services/assessImport/targetRegistry.ts services/assessImport/targetRegistry.test.ts && ${compile} --coverage=supabase/functions/_shared/assessDocumentMapping.ts supabase/functions/deno.d.ts supabase/functions/_shared/assessDocumentMapping.ts supabase/functions/_shared/assessDocumentMapping.test.ts && ${compile} --coverage=supabase/functions/_shared/assessMappingProviderBudget.ts supabase/functions/deno.d.ts supabase/functions/_shared/assessMappingProviderBudget.ts supabase/functions/_shared/assessMappingProviderBudget.test.ts`,
  'test:assess-import:browser': 'node scripts/runTranscriptFlowBrowser.mjs --assess-import',
  'test:assess-import:ui': 'node --test components/assess-v2/AssessSupportingDocumentIntake.test.ts components/assess-v2/assessDocumentUploadQueue.test.ts components/enterprise/AssessTranscriptCandidateReview.test.ts components/assess-v2/AssessV2Workspace.test.ts',
  'test:assess-import:client': `${compile} --mock-assess-import-client vite-env.d.ts services/enterpriseIntelligenceClient.assessImport.test.ts`,
  'test:assess-import:regression': [
    'services/enterpriseIntelligence.test.ts',
    'supabase/functions/_shared/enterpriseIntelligenceCommand.test.ts',
    'supabase/functions/_shared/enterpriseIntelligenceQuery.test.ts',
    'supabase/functions/_shared/enterpriseIntelligenceAi.test.ts',
    'supabase/functions/_shared/providerBudget.test.ts',
    'supabase/functions/_shared/enterpriseIntelligenceIngestion.test.ts',
    'services/transcriptFlow/sourceSets.test.ts', 'services/transcriptFlow/assessApply.test.ts',
    'services/assessV2/assessV2.test.ts', 'services/assessV2/canonical.test.ts',
    'supabase/functions/_shared/assessV2Command.test.ts',
  ].map(file => `${edge} ${file}`).join(' && '),
  typecheck: 'tsc --noEmit',
  'typecheck:edge': 'tsc -p tsconfig.edge.json',
  'test:workflow-yaml': 'node scripts/checkWorkflowYaml.test.mjs',
  'test:ai-boundary-static': 'node scripts/check-ai-boundary.mjs',
  'test:secret-hygiene': 'node scripts/check-secret-hygiene.mjs',
  'test:scoring': 'node scripts/runScoringRegression.mjs',
  'test:pr-c-scoring-law-drift': 'node scripts/checkPrCScoringLawDrift.mjs',
  build: 'vite build',
});
export const assessImportGroups = Object.freeze({
  feature: Object.freeze(['test:assess-import:harness', 'test:assess-import:authority', 'test:assess-import:parser', 'test:assess-import:domain', 'test:assess-import:api', 'test:assess-import:client', 'test:assess-import:ui', 'test:assess-import:migrations', 'test:assess-import:parser-coverage', 'test:assess-import:mapping-coverage']),
  postgres: Object.freeze(['test:assess-import:postgres', 'test:assess-import:budget-pipeline', 'test:assess-import:retained-postgres', 'test:assess-import:projection-postgrest']),
  regression: Object.freeze(['test:assess-import:regression', 'test:assess-import:studio-recovery']),
  browser: Object.freeze(['test:assess-import:browser']),
  static: Object.freeze(['typecheck', 'typecheck:edge', 'test:workflow-yaml', 'test:ai-boundary-static', 'test:secret-hygiene', 'test:scoring', 'test:pr-c-scoring-law-drift', 'build']),
});
export function assessImportCommands(group, scripts) {
  if (!Object.hasOwn(assessImportGroups, group)) throw new Error('ASSESS_IMPORT_GROUP_INVALID');
  return assessImportGroups[group].map(name => {
    if (scripts[name] !== assessImportScripts[name] || Object.hasOwn(scripts, `pre${name}`) || Object.hasOwn(scripts, `post${name}`)) throw new Error('ASSESS_IMPORT_COMMAND_SUBSTITUTED');
    return { name, script: assessImportScripts[name] };
  });
}
export function validateAssessImportDatabaseUrl(value) {
  if (!value) throw new Error('ASSESS_IMPORT_POSTGRES_NOT_RUN');
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    || url.pathname !== '/postgres' || url.search || url.hash || !url.port) throw new Error('ASSESS_IMPORT_POSTGRES_SCOPE_INVALID');
  return value;
}
