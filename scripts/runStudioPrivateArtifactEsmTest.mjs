import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const rootNames = process.argv.slice(2);
const testEntry = rootNames.at(-1);
if (!testEntry) {
  console.error('Usage: node scripts/runStudioPrivateArtifactEsmTest.mjs <source.ts> [test.ts]');
  process.exit(1);
}

const out = path.resolve('.agent/studio-private-artifact-esm-tests');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify({ type: 'module' }));

const options = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ES2022,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  skipLibCheck: true,
  outDir: out,
  noEmit: false,
  esModuleInterop: true,
  rewriteRelativeImportExtensions: true,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
};
const host = ts.createCompilerHost(options);
const readFile = host.readFile.bind(host);
const supabaseClient = path.resolve('services/supabaseClient.ts');
host.readFile = file =>
  path.resolve(file) === supabaseClient
    ? `export interface ControlledHumanCommandAnchor {requestId:string;businessIdempotencyKey?:string;safeAnchor:any};
       export const isControlledHumanRuntimeEnabled=()=>false;
       export const getControlledHumanBrowserBinding=()=>({status:'disabled'} as const);
       export const requireControlledHumanBackendAttestation=async()=>null;
       export const beginControlledHumanCommand=async(...args:any[])=>{const f=(globalThis as any).__controlledHumanBegin;return f?f(...args):null};
       export const completeControlledHumanCommand=async(...args:any[])=>{const f=(globalThis as any).__controlledHumanComplete;return f?f(...args):null};
       export const prepareControlledHumanOfflineLineage=async(...args:any[])=>{const f=(globalThis as any).__controlledHumanOfflineLineage;return f?f(...args):null};
       export const supabase:any={
        functions:{invoke:async(...args:any[])=>{const f=(globalThis as any).__studioInvoke;if(!f)throw new Error('UNEXPECTED_LIVE_TRANSPORT');return f(...args)}},
        rpc:async(...args:any[])=>{const f=(globalThis as any).__studioRpc;if(!f)throw new Error('UNEXPECTED_LIVE_TRANSPORT');return f(...args)},
        auth:{getSession:async()=>({data:{session:null},error:null})}
      };`
    : readFile(file);

const program = ts.createProgram({ rootNames, options, host });
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  console.error(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: file => file,
      getCurrentDirectory: () => process.cwd(),
      getNewLine: () => '\n',
    }),
  );
  process.exit(1);
}
if (program.emit().emitSkipped) process.exit(1);

for (const file of fs.readdirSync(out, { recursive: true }).filter(file => file.endsWith('.js'))) {
  const emitted = path.join(out, file);
  const source = fs.readFileSync(emitted, 'utf8');
  fs.writeFileSync(
    emitted,
    source.replace(
      /(from\s+['"]|import\(['"])(\.\.?\/[^'"\r\n]+?)(?<!\.js)(['"]\)?)/gu,
      '$1$2.js$3',
    ),
  );
}

const candidates = [
  path.join(out, testEntry.replace(/\.ts$/, '.js')),
  path.join(out, path.basename(testEntry).replace(/\.ts$/, '.js')),
];
const compiled = candidates.find(fs.existsSync);
if (!compiled) throw new Error(`compiled test not found for ${testEntry}`);
execFileSync(process.execPath, [compiled], { stdio: 'inherit' });
