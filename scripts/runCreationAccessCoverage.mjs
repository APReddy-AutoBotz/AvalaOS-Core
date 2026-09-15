import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

// Explicit new contract/client/handler/adapter scope. React integration, App
// routing and processService orchestration have separate browser/authority gates;
// this percentage is not all changed-code coverage. Never substitute suite exit.
export const CRITICAL_SOURCES = Object.freeze([
  'services/processCreationContract.ts',
  'services/processCreationClient.ts',
  'services/processCreationServiceFence.ts',
  'supabase/functions/_shared/processCreationCommand.ts',
  'supabase/functions/_shared/processCreationDb.ts',
  'supabase/functions/_shared/creationAccessRequestBody.ts',
  'services/syntheticAdminContract.ts',
  'services/syntheticAdminClient.ts',
  'supabase/functions/_shared/syntheticAdminEndpoint.ts',
  'supabase/functions/_shared/syntheticAdminAuth.ts',
  'supabase/functions/_shared/syntheticAdminDb.ts',
]);

export const FOCUSED_TESTS = Object.freeze([
  'services/processCreationContract.test.ts',
  'services/processCreationClient.test.ts',
  'services/processCreationClient.coverage.test.ts',
  'services/processCreationServiceFence.test.ts',
  'supabase/functions/_shared/processCreationCommand.test.ts',
  'supabase/functions/_shared/processCreationDb.coverage.test.ts',
  'services/syntheticAdminContract.test.ts',
  'services/syntheticAdminClient.test.ts',
  'supabase/functions/_shared/syntheticAdminEndpoint.test.ts',
  'supabase/functions/_shared/syntheticAdminAuth.test.ts',
  'supabase/functions/_shared/syntheticAdminDb.coverage.test.ts',
  'supabase/functions/_shared/creationAccessRequestBody.test.ts',
]);

export const THRESHOLDS = Object.freeze({ lines: 90, branches: 80, functions: 85 });
const COMPILE_SUPPORT = Object.freeze(['types.ts', 'vite-env.d.ts', 'supabase/functions/deno.d.ts']);

export function validateCoverageInventory(sources = CRITICAL_SOURCES, tests = FOCUSED_TESTS) {
  const mandatory = new Set(CRITICAL_SOURCES);
  if (sources.length !== mandatory.size || new Set(sources).size !== mandatory.size ||
      sources.some(source => !mandatory.has(source))) throw new Error('CREATION_ACCESS_COVERAGE_SOURCE_DRIFT');
  const mandatoryTests = new Set(FOCUSED_TESTS);
  if (tests.length !== mandatoryTests.size || new Set(tests).size !== mandatoryTests.size ||
      tests.some(test => !mandatoryTests.has(test))) throw new Error('CREATION_ACCESS_COVERAGE_TEST_DRIFT');
  return true;
}

export function assertCoverageFilesReported(output, compiledSources) {
  const start = output.indexOf('# start of coverage report');
  const end = output.indexOf('# end of coverage report', start);
  if (start < 0 || end <= start) throw new Error('CREATION_ACCESS_COVERAGE_REPORT_MISSING');
  const report = output.slice(start, end).replaceAll('\\', '/');
  for (const compiledSource of compiledSources) {
    const basename = path.basename(compiledSource);
    if (!report.includes(basename)) throw new Error(`CREATION_ACCESS_COVERAGE_SOURCE_NOT_REPORTED:${basename}`);
  }
  return true;
}

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = () => {
  validateCoverageInventory();
  const outputParent = path.resolve(repositoryRoot, 'output/creation-access-coverage');
  fs.mkdirSync(outputParent, { recursive: true });
  const outputDir = fs.mkdtempSync(path.join(outputParent, 'attempt-'));
  if (!path.relative(outputParent, outputDir) || path.relative(outputParent, outputDir).startsWith('..')) {
    throw new Error('CREATION_ACCESS_COVERAGE_OUTPUT_SCOPE_INVALID');
  }
  const cleanup = () => fs.rmSync(outputDir, { recursive: true, force: true });
  try {
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
      sourceMap: true,
      inlineSources: true,
      lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
    };
    const host = ts.createCompilerHost(options);
    const realReadFile = host.readFile.bind(host);
    const clientPath = path.resolve(repositoryRoot, 'services/supabaseClient.ts');
    host.readFile = file => path.resolve(file) === clientPath
      ? `export const supabase: any = {
          functions: { invoke: async (...args: any[]) => {
            const mock = (globalThis as any).__creationCoverageInvoke;
            if (!mock) throw new Error('UNEXPECTED_LIVE_COVERAGE_TRANSPORT');
            return mock(...args);
          } },
          from: (table: string) => {
            const filters: unknown[] = [];
            const builder: any = {
              select: (columns: string) => { filters.push(['select', columns]); return builder; },
              eq: (column: string, value: unknown) => { filters.push(['eq', column, value]); return builder; },
              is: (column: string, value: unknown) => { filters.push(['is', column, value]); return builder; },
              maybeSingle: async () => {
                const mock = (globalThis as any).__creationCoverageRead;
                if (!mock) throw new Error('UNEXPECTED_LIVE_COVERAGE_TRANSPORT');
                return mock(table, filters);
              },
            };
            return builder;
          },
        };`
      : realReadFile(file);
    const roots = [...COMPILE_SUPPORT, ...CRITICAL_SOURCES, ...FOCUSED_TESTS]
      .map(file => path.resolve(repositoryRoot, file));
    const program = ts.createProgram({ rootNames: roots, options, host });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    if (diagnostics.length) {
      process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: file => file,
        getCurrentDirectory: () => repositoryRoot,
        getNewLine: () => os.EOL,
      }));
      throw new Error('CREATION_ACCESS_COVERAGE_COMPILE_FAILED');
    }
    if (program.emit().emitSkipped) throw new Error('CREATION_ACCESS_COVERAGE_EMIT_SKIPPED');

    // TS rewrites explicit .ts imports; these focused sources also contain
    // extensionless relative imports, which Node ESM must resolve exactly.
    const rewrite = directory => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) rewrite(file);
        else if (entry.isFile() && file.endsWith('.js')) {
          const original = fs.readFileSync(file, 'utf8');
          const corrected = original.replace(/(['"])(\.\.?\/[^'"\r\n]+?)(\1)/gu, (whole, quote, specifier) =>
            /\.(?:js|json|mjs|cjs|ts)$/u.test(specifier) ? whole : `${quote}${specifier}.js${quote}`);
          if (corrected !== original) fs.writeFileSync(file, corrected);
        }
      }
    };
    rewrite(outputDir);
    const compiled = file => path.join(outputDir, file.replace(/\.ts$/u, '.js')).replaceAll('\\', '/');
    const sources = CRITICAL_SOURCES.map(compiled);
    const mappedSources = CRITICAL_SOURCES.map(file => path.resolve(repositoryRoot, file).replaceAll('\\', '/'));
    const includeGlobs = CRITICAL_SOURCES.map(file => `**/${path.basename(file, '.ts')}.*`);
    const tests = FOCUSED_TESTS.map(compiled);
    for (const file of [...sources, ...tests]) if (!fs.existsSync(file)) {
      throw new Error(`CREATION_ACCESS_COVERAGE_EMITTED_FILE_MISSING:${path.basename(file)}`);
    }
    process.stdout.write(`CREATION_ACCESS_COVERAGE_SCOPE ${JSON.stringify({
      sources: CRITICAL_SOURCES, tests: FOCUSED_TESTS, thresholds: THRESHOLDS,
      method: 'Node V8 test coverage of TypeScript-emitted source-mapped JavaScript',
    })}${os.EOL}`);
    process.stdout.write('CREATION_ACCESS_COVERAGE_BOUNDARY React UI and SQL are tested by separate Playwright and PostgreSQL gates; neither is included in this TypeScript V8 gate. No backend adapter is excluded.\n');
    const result = spawnSync(process.execPath, [
      '--enable-source-maps',
      '--experimental-test-coverage',
      `--test-coverage-lines=${THRESHOLDS.lines}`,
      `--test-coverage-branches=${THRESHOLDS.branches}`,
      `--test-coverage-functions=${THRESHOLDS.functions}`,
      ...includeGlobs.map(glob => `--test-coverage-include=${glob}`),
      '--test-coverage-exclude=**/*.test.ts',
      '--test', ...tests,
    ], { cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error) throw new Error(`CREATION_ACCESS_COVERAGE_CHILD_ERROR:${result.error.code ?? 'unknown'}`);
    assertCoverageFilesReported(result.stdout ?? '', mappedSources);
    if (result.status !== 0) throw new Error(`CREATION_ACCESS_COVERAGE_GATE_FAILED:${result.status ?? 'unknown'}`);
    process.stdout.write(`CREATION_ACCESS_COVERAGE_RESULT ${JSON.stringify({ status: 'passed', sourceCount: sources.length, testCount: tests.length, thresholds: THRESHOLDS })}${os.EOL}`);
  } finally {
    cleanup();
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { run(); } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'CREATION_ACCESS_COVERAGE_UNKNOWN_ERROR'}${os.EOL}`);
    process.exitCode = 1;
  }
}
