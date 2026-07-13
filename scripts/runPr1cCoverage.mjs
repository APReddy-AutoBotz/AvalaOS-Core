import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const roots = [
  'types.ts',
  'services/scoringEngine.ts',
  'supabase/functions/_shared/tenantAuthority.ts',
  'supabase/functions/_shared/assessScoring.ts',
  'supabase/functions/_shared/assessCommand.ts',
  'supabase/functions/_shared/assessHandlers.ts',
  'supabase/functions/_shared/assessRouter.ts',
  'supabase/functions/_shared/tenantSession.ts',
  'supabase/functions/_shared/pr1cCommand.test.ts',
];
const outputDir = path.resolve('.agent/pr1c-coverage');
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
const testFile = path.join(outputDir, 'supabase/functions/_shared/pr1cCommand.test.js');
const includes = [
  'supabase/functions/_shared/assessHandlers.js',
  'supabase/functions/_shared/tenantSession.js',
].map(file => path.join(outputDir, file).replace(/\\/g, '/'));
const result = spawnSync(process.execPath, [
  '--experimental-test-coverage',
  '--test-coverage-lines=70',
  '--test-coverage-functions=80',
  '--test-coverage-branches=60',
  ...includes.map(file => `--test-coverage-include=${file}`),
  '--test',
  testFile,
], { stdio: 'inherit' });
process.exit(result.status ?? 1);
