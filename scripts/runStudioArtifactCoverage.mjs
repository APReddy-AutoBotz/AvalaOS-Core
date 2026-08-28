import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const roots = [
  'vite-env.d.ts',
  'supabase/functions/deno.d.ts',
  'types.ts',
  'services/studioArtifacts/contracts.ts',
  'services/studioArtifacts/privateArtifactContracts.ts',
  'services/studioArtifacts/privateArtifactClient.ts',
  'services/studioArtifacts/client.ts',
  'services/studioArtifacts/client.test.ts',
  'supabase/functions/_shared/studioArtifactCommand.ts',
  'supabase/functions/_shared/studioArtifactHandler.ts',
  'supabase/functions/_shared/studioArtifactDb.ts',
  'supabase/functions/_shared/studioArtifactGeneration.ts',
  'supabase/functions/_shared/studioArtifactProvider.ts',
  'supabase/functions/_shared/studioArtifactCommand.test.ts',
  'supabase/functions/_shared/studioArtifactDb.test.ts',
  'supabase/functions/_shared/studioArtifactGeneration.test.ts',
  'supabase/functions/_shared/studioArtifactProvider.test.ts',
];
const out = path.resolve('.agent/studio-artifacts-coverage');
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
host.readFile = file => path.resolve(file) === supabaseClient
  ? `export const getRuntimeDataAccess=()=> 'server';export const isSupabaseConfigured=()=>true;export const supabase:any={functions:{invoke:async(...args:any[])=>{const f=(globalThis as any).__studioInvoke;if(!f)throw new Error('UNEXPECTED_LIVE_TRANSPORT');return f(...args)}},rpc:async(...args:any[])=>{const f=(globalThis as any).__studioRpc;if(!f)throw new Error('UNEXPECTED_LIVE_TRANSPORT');return f(...args)},auth:{getSession:async()=>({data:{session:null},error:null})}};`
  : readFile(file);

const program = ts.createProgram({ rootNames: roots, options, host });
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: file => file,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n',
  }));
  fs.rmSync(out, { recursive: true, force: true });
  process.exit(1);
}
if (program.emit().emitSkipped) {
  fs.rmSync(out, { recursive: true, force: true });
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
rewriteLocalModuleSpecifiers(out);

const compiled = value => path.join(out, value.replace(/\.ts$/u, '.js')).replaceAll('\\', '/');
const source = [
  'supabase/functions/_shared/studioArtifactCommand.ts',
  'supabase/functions/_shared/studioArtifactGeneration.ts',
  'supabase/functions/_shared/studioArtifactProvider.ts',
];
const tests = [
  'services/studioArtifacts/client.test.ts',
  'supabase/functions/_shared/studioArtifactCommand.test.ts',
  'supabase/functions/_shared/studioArtifactDb.test.ts',
  'supabase/functions/_shared/studioArtifactGeneration.test.ts',
  'supabase/functions/_shared/studioArtifactProvider.test.ts',
];
const args = [
  '--experimental-test-coverage',
  '--test-coverage-lines=95',
  '--test-coverage-functions=95',
  '--test-coverage-branches=85',
  ...source.map(file => `--test-coverage-include=${compiled(file)}`),
  '--test',
  ...tests.map(compiled),
];
const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
fs.rmSync(out, { recursive: true, force: true });
process.exit(result.status ?? 1);
