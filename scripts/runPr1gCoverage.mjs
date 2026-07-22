import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const roots = [
  'types.ts',
  'services/assessV2/applicationPortfolio.ts',
  'services/assessV2/applicationPortfolio.test.ts',
  'services/assessV2ApplicationPortfolioClient.ts',
  'services/assessV2ApplicationPortfolioClient.test.ts',
  'components/assess-v2/AssessApplicationPortfolioWorkspace.tsx',
  'components/assess-v2/AssessApplicationPortfolioWorkspace.test.tsx',
  'supabase/functions/_shared/supabase.ts',
  'supabase/functions/_shared/tenantAuthority.ts',
  'supabase/functions/_shared/tenantAuthorityDb.ts',
  'supabase/functions/_shared/assessV2Command.ts',
  'supabase/functions/_shared/assessV2ApplicationPortfolioCommand.ts',
  'supabase/functions/_shared/assessV2ApplicationPortfolioCommand.test.ts',
  'supabase/functions/_shared/assessV2ApplicationPortfolioDb.ts',
  'supabase/functions/_shared/assessV2ApplicationPortfolioDb.test.ts',
];
for (const file of roots) if (!fs.existsSync(file)) throw new Error(`PR1G_COVERAGE_SOURCE_MISSING: ${file}`);
const outputDir = path.resolve('.agent/pr1g-coverage');
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
const edgeSupabase = path.resolve('supabase/functions/_shared/supabase.ts');
const tenantAuthority = path.resolve('supabase/functions/_shared/tenantAuthority.ts');
const tenantAuthorityDb = path.resolve('supabase/functions/_shared/tenantAuthorityDb.ts');
host.readFile = file => {
  const resolved = path.resolve(file);
  if (resolved === supabaseClient) return "export const supabase:any={functions:{invoke:(...args:any[])=>(globalThis as any).__pr1gSupabaseClient.functions.invoke(...args)},rpc:(...args:any[])=>(globalThis as any).__pr1gSupabaseClient.rpc(...args)};";
  if (resolved === edgeSupabase) return "export const getAuthUser=async(request:any)=>({id:(globalThis as any).__pr1gActorId??'44444444-4444-4444-8444-444444444444'});export const postgrest=async <T=any>(path:string,init:any={}):Promise<T>=>{const h=(globalThis as any).__pr1gPostgrest;if(h)return h(path,init);return {outcome:'committed',resource:{id:'server-resource',version:1,status:'committed'}} as T;};";
  if (resolved === tenantAuthority) return "export class TenantAuthorityError extends Error{constructor(public code:string){super(code)}};export const resolveTenantAuthority=async(actorId:string,input:any,db?:any)=>{const h=(globalThis as any).__pr1gResolveAuthority;if(h)return h(actorId,input);return{userId:actorId,organizationId:input.organizationId,workspaceId:input.workspaceId,authorizationVersion:7,capabilities:['assess.applications.read','assess.applications.write','assess.applications.import','assess.applications.finalize','assess.applications.review','assess.applications.portfolio.read']};};";
  if (resolved === tenantAuthorityDb) return "export const createTenantAuthorityDatabase=(request:any)=>({request});";
  return readFile(file);
};
const program = ts.createProgram({ rootNames: roots, options, host });
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCanonicalFileName: f => f, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n' }));
  process.exit(1);
}
if (program.emit().emitSkipped) process.exit(1);
const out = value => path.join(outputDir, value).replace(/\\/g, '/');
const includes = [
  'services/assessV2/applicationPortfolio.js',
  'supabase/functions/_shared/assessV2ApplicationPortfolioCommand.js',
  'supabase/functions/_shared/assessV2ApplicationPortfolioDb.js',
  'services/assessV2ApplicationPortfolioClient.js',
].map(out);
const tests = [
  'services/assessV2/applicationPortfolio.test.js',
  'supabase/functions/_shared/assessV2ApplicationPortfolioCommand.test.js',
  'services/assessV2ApplicationPortfolioClient.test.js',
  'supabase/functions/_shared/assessV2ApplicationPortfolioDb.test.js',
  'components/assess-v2/AssessApplicationPortfolioWorkspace.test.js',
].map(out);
const result = spawnSync(process.execPath, [
  '--experimental-test-coverage',
  '--test-coverage-lines=90',
  '--test-coverage-functions=85',
  '--test-coverage-branches=80',
  ...includes.map(x => `--test-coverage-include=${x}`),
  '--test',
  ...tests,
], { stdio: 'inherit' });
process.exit(result.status ?? 1);
