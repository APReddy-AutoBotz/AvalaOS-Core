import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const THRESHOLDS = { lines: 95, functions: 95, branches: 85 };
const SOURCE_SET = [
  'services/studioArtifacts/client.ts',
  'services/studioArtifacts/workspaceModel.ts',
  'services/studioArtifacts/workspaceRpcAdapter.ts',
  'supabase/functions/_shared/studioArtifactCommand.ts',
  'supabase/functions/_shared/studioArtifactHandler.ts',
  'supabase/functions/_shared/studioArtifactDb.ts',
  'supabase/functions/_shared/studioArtifactGeneration.ts',
  'supabase/functions/_shared/studioArtifactProvider.ts',
];
const TEST_SET = [
  'services/studioArtifacts/client.test.ts',
  'services/studioArtifacts/workspaceModel.test.ts',
  'services/studioArtifacts/workspaceRpcAdapter.test.ts',
  'supabase/functions/_shared/studioArtifactCommand.test.ts',
  'supabase/functions/_shared/studioArtifactDb.test.ts',
  'supabase/functions/_shared/studioArtifactGeneration.test.ts',
  'supabase/functions/_shared/studioArtifactProvider.test.ts',
];
const MODIFIED_INTEGRATION_SOURCE_SET = [
  'services/enterpriseIntelligenceClient.ts',
  'supabase/functions/_shared/enterpriseIntelligenceCommand.ts',
];
const MODIFIED_INTEGRATION_TEST_SET = [
  'services/enterpriseIntelligenceClient.prB.test.ts',
  'supabase/functions/_shared/enterpriseIntelligenceCommand.test.ts',
];
const COMPILE_SUPPORT = [
  'vite-env.d.ts',
  'supabase/functions/deno.d.ts',
  'types.ts',
  'supabase/functions/_shared/studioArtifactPrBTestEvidence.ts',
];
const outputDir = path.resolve('.agent/transcript-flow-pr-b-coverage');

fs.rmSync(outputDir, { recursive: true, force: true });
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
  ? `export const getRuntimeDataAccess=()=> 'server';export const isSupabaseConfigured=()=>true;export const supabase:any={functions:{invoke:async(...args:any[])=>{const f=(globalThis as any).__studioInvoke;if(!f)throw new Error('UNEXPECTED_LIVE_TRANSPORT');return f(...args)}},rpc:async(...args:any[])=>{const f=(globalThis as any).__studioRpc;if(!f)throw new Error('UNEXPECTED_LIVE_TRANSPORT');return f(...args)}};`
  : originalReadFile(file);

const program = ts.createProgram({ rootNames: [
  ...COMPILE_SUPPORT, ...SOURCE_SET, ...TEST_SET,
  ...MODIFIED_INTEGRATION_SOURCE_SET, ...MODIFIED_INTEGRATION_TEST_SET,
], options, host });
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: value => value,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n',
  }));
  fs.rmSync(outputDir, { recursive: true, force: true });
  process.exit(1);
}
if (program.emit().emitSkipped) {
  fs.rmSync(outputDir, { recursive: true, force: true });
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
console.log(`PR_B_COVERAGE_SCOPE ${JSON.stringify({ sourceCount: SOURCE_SET.length, testCount: TEST_SET.length, thresholds: THRESHOLDS, sources: SOURCE_SET })}`);
console.log('PR_B_COVERAGE_EXCLUSIONS React workspace components are owned by the dedicated Desktop Chrome and Pixel 7 browser gates; SQL is owned by the static migration contract and disposable PostgreSQL 16 gate. The two directly modified Enterprise integration modules are measured and reported separately below, with focused PR B behavior tests; they are not silently omitted from coverage.');
const result = spawnSync(process.execPath, [
  '--experimental-test-coverage',
  `--test-coverage-lines=${THRESHOLDS.lines}`,
  `--test-coverage-functions=${THRESHOLDS.functions}`,
  `--test-coverage-branches=${THRESHOLDS.branches}`,
  ...SOURCE_SET.map(value => `--test-coverage-include=${compiled(value)}`),
  '--test',
  ...TEST_SET.map(compiled),
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
const status = result.status === 0 ? 'passed' : 'failed';
const integration = spawnSync(process.execPath, [
  '--experimental-test-coverage',
  ...MODIFIED_INTEGRATION_SOURCE_SET.map(value => `--test-coverage-include=${compiled(value)}`),
  '--test',
  ...MODIFIED_INTEGRATION_TEST_SET.map(compiled),
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
if (integration.stdout) process.stdout.write(integration.stdout);
if (integration.stderr) process.stderr.write(integration.stderr);
const integrationTestStatus = integration.status === 0 ? 'passed' : 'failed';
console.log(`PR_B_MODIFIED_INTEGRATION_COVERAGE_OBSERVATION ${JSON.stringify({
  classification: 'full-legacy-module-observation',
  thresholdGate: false,
  focusedChangedPathTests: integrationTestStatus,
  sources: MODIFIED_INTEGRATION_SOURCE_SET,
  tests: MODIFIED_INTEGRATION_TEST_SET,
})}`);
console.log(`PR_B_COVERAGE_RESULT ${JSON.stringify({ status: status === 'passed' && integrationTestStatus === 'passed' ? 'passed' : 'failed', thresholds: THRESHOLDS, sourceCount: SOURCE_SET.length, modifiedIntegrationSourceCount: MODIFIED_INTEGRATION_SOURCE_SET.length })}`);
fs.rmSync(outputDir, { recursive: true, force: true });
process.exit(result.status || integration.status || 0);
