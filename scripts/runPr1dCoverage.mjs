import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const roots = [
  'types.ts',
  'services/scoringEngine.ts',
  'services/assessV1Compatibility.ts',
  'services/assessV1Compatibility.test.ts',
  'services/assessV2/types.ts',
  'services/assessV2/canonical.ts',
  'services/assessV2/registry.ts',
  'services/assessV2/evaluator.ts',
  'services/assessV2/decisionVersion.ts',
  'services/assessV2/fixture.ts',
  'services/assessV2/index.ts',
  'services/assessV2/assessV2.test.ts',
  'services/assessV2/canonical.test.ts',
  'services/assessV2ClientContract.ts',
  'services/assessV2Client.test.ts',
  'supabase/functions/_shared/tenantAuthority.ts',
  'supabase/functions/_shared/tenantAuthorityDb.ts',
  'supabase/functions/_shared/supabase.ts',
  'supabase/functions/_shared/assessV2Command.ts',
  'supabase/functions/_shared/assessV2Handlers.ts',
  'supabase/functions/_shared/assessV2Router.ts',
  'supabase/functions/_shared/assessV2Db.ts',
  'supabase/functions/_shared/assessV2Command.test.ts',
];

for (const file of roots) if (!fs.existsSync(file)) throw new Error(`PR1D_COVERAGE_SOURCE_MISSING: ${file}`);

const outputDir = path.resolve('.agent/pr1d-coverage');
fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'package.json'), JSON.stringify({ type: 'commonjs' }));

const program = ts.createProgram({
  rootNames: roots,
  options: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    skipLibCheck: true,
    outDir: outputDir,
    noEmit: false,
    esModuleInterop: true,
    rewriteRelativeImportExtensions: true,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
  },
});

const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: fileName => fileName,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n',
  }));
  process.exit(1);
}
if (program.emit().emitSkipped) process.exit(1);

const slash = value => path.join(outputDir, value).replace(/\\/g, '/');
const tests = [
  'services/assessV1Compatibility.test.js',
  'services/assessV2/assessV2.test.js',
  'services/assessV2/canonical.test.js',
  'services/assessV2Client.test.js',
  'supabase/functions/_shared/assessV2Command.test.js',
].map(slash);
const includes = [
  'services/assessV1Compatibility.js',
  'services/assessV2/canonical.js',
  'services/assessV2/registry.js',
  'services/assessV2/evaluator.js',
  'services/assessV2/decisionVersion.js',
  'services/assessV2ClientContract.js',
  'supabase/functions/_shared/assessV2Command.js',
  'supabase/functions/_shared/assessV2Handlers.js',
  'supabase/functions/_shared/assessV2Router.js',
].map(slash);

const result = spawnSync(process.execPath, [
  '--experimental-test-coverage',
  '--test-coverage-lines=90',
  '--test-coverage-functions=85',
  '--test-coverage-branches=80',
  ...includes.map(file => `--test-coverage-include=${file}`),
  '--test',
  ...tests,
], { stdio: 'inherit' });
process.exit(result.status ?? 1);
