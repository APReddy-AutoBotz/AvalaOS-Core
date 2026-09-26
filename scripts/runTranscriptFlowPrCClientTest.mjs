import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const rootNames = process.argv.slice(2);
const testEntry = rootNames.at(-1);
if (!testEntry) {
  console.error('Usage: node scripts/runTranscriptFlowPrCClientTest.mjs <source.ts> [test.ts]');
  process.exit(1);
}

// Keep this focused compiler isolated from the retained controller-owned
// `.agent/pr-c-client-tests` directory. That retained directory is unrelated
// local state and must never be deleted or rewritten by this command.
const outputDir = path.resolve('.agent/pr-c-controlled-human-client-tests');
fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'package.json'), JSON.stringify({ type: 'commonjs' }));

const options = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.CommonJS,
  moduleResolution: ts.ModuleResolutionKind.Node10,
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
  ? `export type ControlledHumanSafeStepAnchor={challengeToken:string;[key:string]:any};
     export type ControlledHumanSafeStepBinding={bindingToken:string;[key:string]:any};
     export type ControlledHumanCompletedProof={safeAnchor:ControlledHumanSafeStepAnchor;safeBinding:ControlledHumanSafeStepBinding};
     export type ControlledHumanStepBindingOption={checkpointId:string;stepId:string;action:string;observationKind:string;state:string;safeAnchor:ControlledHumanSafeStepAnchor|null;safeBinding:ControlledHumanSafeStepBinding|null};
     export const getRuntimeDataAccess=()=> 'server';export const isSupabaseConfigured=()=>true;
     export const isControlledHumanRuntimeEnabled=()=>false;
     export const getControlledHumanEvidenceState=()=>({armedStep:null,anchor:null});
     export const beginControlledHumanCommand=async(..._args:any[])=>null;
     export const completeControlledHumanCommand=async(..._args:any[])=>null;
     export const executeControlledHumanDeniedCommand=async(..._args:any[])=>null;
     export const supabase:any={functions:{invoke:async(...args:any[])=>{const f=(globalThis as any).__prCInvoke;if(!f)throw new Error('UNEXPECTED_LIVE_TRANSPORT');return f(...args)}}};`
  : originalReadFile(file);

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

const candidates = [
  path.join(outputDir, testEntry.replace(/\.tsx?$/u, '.js')),
  path.join(outputDir, path.basename(testEntry).replace(/\.tsx?$/u, '.js')),
];
const compiled = candidates.find(fs.existsSync);
if (!compiled) throw new Error(`Compiled PR C client test not found for ${testEntry}`);
execFileSync(process.execPath, [compiled], { stdio: 'inherit' });
