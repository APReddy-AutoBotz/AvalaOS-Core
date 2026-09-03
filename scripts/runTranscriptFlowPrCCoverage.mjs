import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const THRESHOLDS = { lines: 95, functions: 95, branches: 85 };
const GOVERNED_SOURCE_SET = [
  'services/deliveryMonitor/contracts.ts',
  'services/deliveryMonitor/commands.ts',
  'services/deliveryMonitor/workspace.ts',
  'supabase/functions/_shared/deliveryMonitorCommand.ts',
  'supabase/functions/_shared/deliveryMonitorDb.ts',
];
const GOVERNED_TEST_SET = [
  'services/deliveryMonitor/contracts.test.ts',
  'services/deliveryMonitor/commands.test.ts',
  'services/deliveryMonitor/pagination.test.ts',
  'services/deliveryMonitor/coverage.test.ts',
  'supabase/functions/_shared/deliveryMonitorCommand.test.ts',
  'supabase/functions/_shared/deliveryMonitorDb.test.ts',
];
const MODIFIED_INTEGRATION_SOURCE_SET = [
  'services/enterpriseIntelligence.ts',
  'services/enterpriseIntelligenceClient.ts',
  'supabase/functions/_shared/supabase.ts',
  'supabase/functions/_shared/enterpriseIntelligenceCommand.ts',
  'supabase/functions/_shared/enterpriseIntelligenceQuery.ts',
];
const MODIFIED_INTEGRATION_TEST_SET = [
  'services/enterpriseIntelligence.test.ts',
  'services/enterpriseIntelligenceClient.prB.test.ts',
  'services/enterpriseIntelligenceClient.prC.test.ts',
  'supabase/functions/_shared/supabaseRpc.test.ts',
  'supabase/functions/_shared/enterpriseIntelligenceCommand.test.ts',
  'supabase/functions/_shared/enterpriseIntelligenceQuery.test.ts',
  'supabase/functions/_shared/deliveryMonitorQuery.test.ts',
];
const COMPILE_SUPPORT = [
  'vite-env.d.ts',
  'types.ts',
  'supabase/functions/deno.d.ts',
  'supabase/functions/_shared/deliveryMonitorPrCTestEvidence.ts',
];
const outputDir = path.resolve('.agent/transcript-flow-pr-c-coverage');

const cleanup = () => fs.rmSync(outputDir, { recursive: true, force: true });
cleanup();
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'package.json'), JSON.stringify({ type: 'module' }));

const options = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ES2022,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  skipLibCheck: true,
  outDir: outputDir,
  noEmit: false,
  esModuleInterop: true,
  rewriteRelativeImportExtensions: true,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
};
const host = ts.createCompilerHost(options);
const originalReadFile = host.readFile.bind(host);
const supabaseClient = path.resolve('services/supabaseClient.ts');
host.readFile = file => path.resolve(file) === supabaseClient
  ? `export const getRuntimeDataAccess=()=> 'server';export const isSupabaseConfigured=()=>true;export const supabase:any={functions:{invoke:async(...args:any[])=>{const f=(globalThis as any).__prCInvoke||(globalThis as any).__studioInvoke;if(!f)throw new Error('UNEXPECTED_LIVE_TRANSPORT');return f(...args)}},rpc:async(...args:any[])=>{const f=(globalThis as any).__prCRpc;if(!f)throw new Error('UNEXPECTED_LIVE_TRANSPORT');return f(...args)}};`
  : originalReadFile(file);

const rootNames = [
  ...COMPILE_SUPPORT,
  ...GOVERNED_SOURCE_SET,
  ...GOVERNED_TEST_SET,
  ...MODIFIED_INTEGRATION_SOURCE_SET,
  ...MODIFIED_INTEGRATION_TEST_SET,
];
const program = ts.createProgram({ rootNames, options, host });
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: value => value,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n',
  }));
  cleanup();
  process.exit(1);
}
if (program.emit().emitSkipped) {
  cleanup();
  process.exit(1);
}

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
console.log(`PR_C_COVERAGE_SCOPE ${JSON.stringify({
  governedSourceCount: GOVERNED_SOURCE_SET.length,
  modifiedIntegrationSourceCount: MODIFIED_INTEGRATION_SOURCE_SET.length,
  thresholds: THRESHOLDS,
  governedSources: GOVERNED_SOURCE_SET,
  modifiedIntegrationSources: MODIFIED_INTEGRATION_SOURCE_SET,
})}`);
console.log('PR_C_COVERAGE_EXCLUSIONS React workspace components are owned by the two-profile Playwright functional and accessibility gates; SQL is owned by the static contract and disposable PostgreSQL 16 matrix. Modified Enterprise integration modules are measured and reported separately below and remain gated by focused and retained suites.');

const governed = spawnSync(process.execPath, [
  '--experimental-test-coverage',
  `--test-coverage-lines=${THRESHOLDS.lines}`,
  `--test-coverage-functions=${THRESHOLDS.functions}`,
  `--test-coverage-branches=${THRESHOLDS.branches}`,
  ...GOVERNED_SOURCE_SET.map(value => `--test-coverage-include=${compiled(value)}`),
  '--test',
  ...GOVERNED_TEST_SET.map(compiled),
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
if (governed.stdout) process.stdout.write(governed.stdout);
if (governed.stderr) process.stderr.write(governed.stderr);

const integration = spawnSync(process.execPath, [
  '--experimental-test-coverage',
  ...MODIFIED_INTEGRATION_SOURCE_SET.map(value => `--test-coverage-include=${compiled(value)}`),
  '--test',
  ...MODIFIED_INTEGRATION_TEST_SET.map(compiled),
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
if (integration.stdout) process.stdout.write(integration.stdout);
if (integration.stderr) process.stderr.write(integration.stderr);

const status = governed.status === 0 && integration.status === 0 ? 'passed' : 'failed';
console.log(`PR_C_MODIFIED_INTEGRATION_COVERAGE_OBSERVATION ${JSON.stringify({
  classification: 'full-legacy-module-observation',
  thresholdGate: false,
  focusedChangedPathTests: integration.status === 0 ? 'passed' : 'failed',
  sources: MODIFIED_INTEGRATION_SOURCE_SET,
  tests: MODIFIED_INTEGRATION_TEST_SET,
})}`);
console.log(`PR_C_COVERAGE_RESULT ${JSON.stringify({
  status,
  thresholds: THRESHOLDS,
  governedSourceCount: GOVERNED_SOURCE_SET.length,
  modifiedIntegrationSourceCount: MODIFIED_INTEGRATION_SOURCE_SET.length,
})}`);
cleanup();
process.exit(governed.status || integration.status || 0);
