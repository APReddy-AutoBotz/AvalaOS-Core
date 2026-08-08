import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const rootNames = process.argv.slice(2);
const testEntry = rootNames.at(-1);
if (!testEntry) throw new Error('Trust Assurance client test entry is required.');
const outputDir = path.resolve('.agent/trust-assurance-client-tests');
fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'package.json'), JSON.stringify({ type: 'commonjs' }));

const options = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.CommonJS,
  moduleResolution: ts.ModuleResolutionKind.Node10,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
  skipLibCheck: true,
  outDir: outputDir,
  noEmit: false,
  esModuleInterop: true,
  rewriteRelativeImportExtensions: true,
};
const host = ts.createCompilerHost(options);
const readFile = host.readFile.bind(host);
const supabaseClient = path.resolve('services/supabaseClient.ts');
host.readFile = file => path.resolve(file) === supabaseClient
  ? `
export const getRuntimeDataAccess=()=>globalThis.__trustDataAccess;
export const isSupabaseConfigured=()=>globalThis.__trustConfigured;
export const supabase={functions:{invoke:(name,options)=>globalThis.__trustInvoke(name,options)}};
`
  : readFile(file);
const program = ts.createProgram({ rootNames, options, host });
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: file => file,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n',
  }));
  process.exit(1);
}
if (program.emit().emitSkipped) process.exit(1);
const compiled = path.join(outputDir, testEntry.replace(/\.ts$/, '.js'));
try {
  execFileSync(process.execPath, [compiled], { stdio: 'inherit' });
} finally {
  fs.rmSync(outputDir, { recursive: true, force: true });
}
