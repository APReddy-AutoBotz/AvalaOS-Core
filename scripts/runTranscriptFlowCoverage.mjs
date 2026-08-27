import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const THRESHOLDS = { lines: 90, functions: 85, branches: 80 };
const GOVERNED_SOURCE_SET = [
  'services/transcriptFlow/contracts.ts', 'services/transcriptFlow/sourceSets.ts', 'services/transcriptFlow/assessApply.ts',
  'supabase/functions/_shared/providerBudget.ts', 'supabase/functions/_shared/providerCleanup.ts',
];
const GOVERNED_TEST_SET = [
  'services/transcriptFlow/sourceSets.test.ts', 'services/transcriptFlow/assessApply.test.ts',
  'supabase/functions/_shared/providerBudget.test.ts', 'supabase/functions/_shared/providerCleanup.test.ts',
];
const OBSERVED_HARD_AREAS = [
  'services/enterpriseIntelligence.ts', 'supabase/functions/_shared/enterpriseIntelligenceAi.ts',
  'supabase/functions/_shared/enterpriseIntelligenceCommand.ts', 'supabase/functions/_shared/enterpriseIntelligenceQuery.ts',
  'supabase/functions/_shared/providerResolver.ts',
];
const OBSERVATION_TEST_SET = [
  'services/enterpriseIntelligence.test.ts', 'supabase/functions/_shared/enterpriseIntelligenceAi.test.ts',
  'supabase/functions/_shared/enterpriseIntelligenceCommand.test.ts', 'supabase/functions/_shared/enterpriseIntelligenceQuery.test.ts',
  'supabase/functions/_shared/providerResolver.test.ts',
];
const GOVERNED_EXECUTION_TEST_SET = [...GOVERNED_TEST_SET,
  'supabase/functions/_shared/enterpriseIntelligenceCommand.test.ts',
  'supabase/functions/_shared/enterpriseIntelligenceQuery.test.ts'];
const SOURCE_SET = [...GOVERNED_SOURCE_SET, ...OBSERVED_HARD_AREAS];
const TEST_SET = [...GOVERNED_TEST_SET, ...OBSERVATION_TEST_SET];
const COMPILE_SUPPORT = ['supabase/functions/deno.d.ts', 'supabase/functions/_shared/supabase.ts'];
const outputDir = path.resolve('.agent/transcript-flow-coverage');
fs.rmSync(outputDir, { recursive: true, force: true }); fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'package.json'), JSON.stringify({ type: 'module' }));
const options = {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, moduleResolution: ts.ModuleResolutionKind.Bundler,
  skipLibCheck: true, outDir: outputDir, noEmit: false, esModuleInterop: true, rewriteRelativeImportExtensions: true,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
};
const program = ts.createProgram({ rootNames: [...COMPILE_SUPPORT, ...SOURCE_SET, ...TEST_SET], options });
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCanonicalFileName: value => value, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n' }));
  fs.rmSync(outputDir, { recursive: true, force: true }); process.exit(1);
}
if (program.emit().emitSkipped) { fs.rmSync(outputDir, { recursive: true, force: true }); process.exit(1); }
const rewriteLocalModuleSpecifiers = directory => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) rewriteLocalModuleSpecifiers(target);
    if (!entry.isFile() || !target.endsWith('.js')) continue;
    const source = fs.readFileSync(target, 'utf8');
    const rewritten = source.replace(/(['"])(\.\.?\/[^'"\r\n]+?)(\1)/gu, (full, quote, specifier) =>
      /\.(?:js|json|mjs|cjs|ts)$/u.test(specifier) ? full : `${quote}${specifier}.js${quote}`);
    if (rewritten !== source) fs.writeFileSync(target, rewritten);
  }
};
rewriteLocalModuleSpecifiers(outputDir);
const compiled = value => path.join(outputDir, value.replace(/\.ts$/u, '.js')).replaceAll('\\', '/');
console.log(`PR_A_COVERAGE_SCOPE ${JSON.stringify({ governedSourceCount: GOVERNED_SOURCE_SET.length, observedHardAreaCount: OBSERVED_HARD_AREAS.length, testCount: TEST_SET.length, thresholds: THRESHOLDS, governedSources: GOVERNED_SOURCE_SET, observedHardAreas: OBSERVED_HARD_AREAS })}`);
console.log('PR_A_COVERAGE_EXCLUSIONS browser React components are measured by the two-profile Playwright gates; SQL migrations are measured by static plus disposable PostgreSQL gates. Large command/query orchestration is explicitly reported below and gated by focused API, authority, Postgres, and static suites; it is not silently omitted from coverage reporting.');
const governed = spawnSync(process.execPath, [
  '--experimental-test-coverage', `--test-coverage-lines=${THRESHOLDS.lines}`, `--test-coverage-functions=${THRESHOLDS.functions}`,
  `--test-coverage-branches=${THRESHOLDS.branches}`, ...GOVERNED_SOURCE_SET.map(value => `--test-coverage-include=${compiled(value)}`),
  '--test', ...GOVERNED_EXECUTION_TEST_SET.map(compiled),
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
if (governed.stdout) process.stdout.write(governed.stdout); if (governed.stderr) process.stderr.write(governed.stderr);
const observed = spawnSync(process.execPath, [
  '--experimental-test-coverage', ...OBSERVED_HARD_AREAS.map(value => `--test-coverage-include=${compiled(value)}`),
  '--test', ...OBSERVATION_TEST_SET.map(compiled),
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
if (observed.stdout) process.stdout.write(observed.stdout); if (observed.stderr) process.stderr.write(observed.stderr);
const status = governed.status === 0 && observed.status === 0 ? 'passed' : 'failed';
console.log(`PR_A_COVERAGE_RESULT ${JSON.stringify({ status, thresholds: THRESHOLDS, governedSourceCount: GOVERNED_SOURCE_SET.length, observedHardAreaCount: OBSERVED_HARD_AREAS.length })}`);
fs.rmSync(outputDir, { recursive: true, force: true });
process.exit(governed.status || observed.status || 0);
