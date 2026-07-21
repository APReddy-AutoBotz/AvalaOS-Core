import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const roots = [
  'types.ts',
  'services/assessV2/economics/domain.ts',
  'services/assessV2EconomicsClient.ts',
  'services/assessV2Economics.test.ts',
  'components/assess-v2/AssessV2EconomicsWorkspace.ts',
  'components/assess-v2/AssessV2EconomicsWorkspace.test.ts',
  'supabase/functions/_shared/assessV2Command.ts',
  'supabase/functions/_shared/assessV2EconomicsCommand.ts',
  'supabase/functions/_shared/assessV2EconomicsCommand.test.ts',
];
for (const file of roots) if (!fs.existsSync(file)) throw new Error(`PR1F_COVERAGE_SOURCE_MISSING: ${file}`);
const outputDir = path.resolve('.agent/pr1f-coverage');
fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'package.json'), JSON.stringify({ type: 'commonjs' }));
const options = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    jsx: ts.JsxEmit.React,
    skipLibCheck: true,
    outDir: outputDir,
    noEmit: false,
    esModuleInterop: true,
    rewriteRelativeImportExtensions: true,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
};
const host = ts.createCompilerHost(options);
const readFile = host.readFile.bind(host);
const supabaseClient = path.resolve('services/supabaseClient.ts');
host.readFile = file => path.resolve(file) === supabaseClient
  ? "export const supabase:any={functions:{invoke:async()=>{throw new Error('UNEXPECTED_LIVE_TRANSPORT')}},rpc:async()=>{throw new Error('UNEXPECTED_LIVE_TRANSPORT')}};"
  : readFile(file);
const program = ts.createProgram({ rootNames: roots, options, host });
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCanonicalFileName: f => f, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n' }));
  process.exit(1);
}
if (program.emit().emitSkipped) process.exit(1);
const out = value => path.join(outputDir, value).replace(/\\/g, '/');
const result = spawnSync(process.execPath, [
  '--experimental-test-coverage',
  '--test-coverage-lines=90',
  '--test-coverage-functions=85',
  '--test-coverage-branches=80',
  `--test-coverage-include=${out('services/assessV2/economics/domain.js')}`,
  '--test',
  out('services/assessV2Economics.test.js'),
  out('components/assess-v2/AssessV2EconomicsWorkspace.test.js'),
  out('supabase/functions/_shared/assessV2EconomicsCommand.test.js'),
], { stdio: 'inherit' });
process.exit(result.status ?? 1);
