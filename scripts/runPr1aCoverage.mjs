import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const roots = [
  'types.ts',
  'services/runtimeMode.ts',
  'services/runtimeMode.test.ts',
  'services/aiMode.ts',
  'services/aiMode.test.ts',
  'supabase/functions/_shared/storageBoundary.ts',
  'supabase/functions/_shared/storageBoundary.test.ts',
  'supabase/functions/_shared/exportPolicy.ts',
  'supabase/functions/_shared/exportPolicy.test.ts',
  'supabase/functions/_shared/exportHandler.ts',
  'supabase/functions/_shared/exportHandler.test.ts',
];

const outputDir = path.resolve('.agent/pr1a-coverage');
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

const testFiles = roots
  .filter(file => file.endsWith('.test.ts'))
  .map(file => path.join(outputDir, file.replace(/\.ts$/, '.js')));

const includeFiles = [
  'services/runtimeMode.js',
  'services/aiMode.js',
  'supabase/functions/_shared/storageBoundary.js',
  'supabase/functions/_shared/exportPolicy.js',
  'supabase/functions/_shared/exportHandler.js',
].map(file => path.join(outputDir, file).replace(/\\/g, '/'));

const result = spawnSync(process.execPath, [
  '--experimental-test-coverage',
  '--test-coverage-lines=90',
  '--test-coverage-functions=85',
  '--test-coverage-branches=80',
  ...includeFiles.map(file => `--test-coverage-include=${file}`),
  '--test',
  ...testFiles,
], { stdio: 'inherit' });

process.exit(result.status ?? 1);
