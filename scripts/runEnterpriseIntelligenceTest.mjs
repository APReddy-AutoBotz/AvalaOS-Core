import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { rewriteTestModuleSpecifiers } from './rewriteTestModuleSpecifiers.mjs';

const arguments_ = process.argv.slice(2);
const mockAssessImportClient = arguments_[0] === '--mock-assess-import-client';
if (mockAssessImportClient) arguments_.shift();
const coverageSources = arguments_[0]?.startsWith('--coverage=') ? arguments_.shift().slice('--coverage='.length).split(',') : [];
const rootNames = arguments_;
if (rootNames.length < 2) throw new Error('Usage: node scripts/runEnterpriseIntelligenceTest.mjs <source.ts> [test.ts]');
if (coverageSources.some(source => !rootNames.includes(source) || !source.endsWith('.ts') || source.endsWith('.test.ts'))) {
  throw new Error('Coverage sources must be explicit non-test TypeScript root files.');
}
const testEntry = rootNames.at(-1);
if (mockAssessImportClient && (testEntry !== 'services/enterpriseIntelligenceClient.assessImport.test.ts' || coverageSources.length)) {
  throw new Error('ASSESS_IMPORT_MOCK_TRANSPORT_TEST_SCOPE_INVALID');
}
// Never erase a previous run or unrelated local user state. Each invocation owns
// only the directory it creates, allowing focused suites to run concurrently.
const outputRoot = path.resolve('output/test-runs/enterprise-intelligence');
fs.mkdirSync(outputRoot, { recursive: true });
const realWorkspace = fs.realpathSync(process.cwd());
const withinWorkspace = candidate => {
  const relative = path.relative(realWorkspace, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};
if (!withinWorkspace(fs.realpathSync(outputRoot))) throw new Error('ENTERPRISE_TEST_OUTPUT_SCOPE_INVALID');
const outputDir = fs.mkdtempSync(path.join(outputRoot, 'run-'));
process.once('exit', () => {
  // Delete this invocation's disposable compiler output only. Verify the final
  // real paths immediately before removal; never glob or clean the output root.
  if (!fs.existsSync(outputDir)) return;
  const realRoot = fs.realpathSync(outputRoot);
  const realOutput = fs.realpathSync(outputDir);
  if (!withinWorkspace(realOutput) || path.dirname(realOutput) !== realRoot || fs.lstatSync(outputDir).isSymbolicLink()
    || !path.basename(realOutput).startsWith('run-')) {
    console.error('ENTERPRISE_TEST_OUTPUT_CLEANUP_SCOPE_INVALID'); process.exitCode = 1; return;
  }
  fs.rmSync(realOutput, { recursive: true, force: false });
});
fs.writeFileSync(path.join(outputDir, 'package.json'), JSON.stringify({ type: 'module' }));

const options = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ES2022,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  skipLibCheck: true,
  rootDir: process.cwd(),
  outDir: outputDir,
  noEmit: false,
  esModuleInterop: true,
  rewriteRelativeImportExtensions: true,
};
const host = ts.createCompilerHost(options);
if (mockAssessImportClient) {
  const originalReadFile = host.readFile.bind(host);
  const transport = path.resolve('services/supabaseClient.ts');
  // This explicitly named client-only suite verifies serialization against a
  // synthetic transport. It is not server authorization or live-provider proof.
  host.readFile = file => path.resolve(file) === transport ? `
    export const getRuntimeDataAccess=()=> 'server';
    export const isSupabaseConfigured=()=>true;
    export const isControlledHumanRuntimeEnabled=()=>false;
    export const getControlledHumanEvidenceState=()=>({armedStep:null,anchor:null});
    export const beginControlledHumanCommand=async(..._args:any[])=>null;
    export const completeControlledHumanCommand=async(..._args:any[])=>null;
    export const executeControlledHumanDeniedCommand=async(..._args:any[])=>null;
    export const supabase:any={functions:{invoke:async(...args:any[])=>{
      const invoke=(globalThis as any).__studioInvoke;
      if(!invoke) throw new Error('UNEXPECTED_LIVE_TRANSPORT');
      return invoke(...args);
    }}};` : originalReadFile(file);
}
const program = ts.createProgram({ rootNames, options, host });
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: fileName => fileName,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n',
  }));
  process.exit(1);
}
if (program.emit().emitSkipped) throw new Error('Enterprise Intelligence TypeScript compilation failed.');

const rewriteLocalModuleSpecifiers = directory => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) rewriteLocalModuleSpecifiers(target);
    if (!entry.isFile() || !target.endsWith('.js')) continue;
    const source = fs.readFileSync(target, 'utf8');
    const rewritten = rewriteTestModuleSpecifiers(source);
    if (rewritten !== source) fs.writeFileSync(target, rewritten);
  }
};
rewriteLocalModuleSpecifiers(outputDir);
const candidates = [
  path.join(outputDir, testEntry.replace(/\.ts$/, '.js')),
  path.join(outputDir, path.basename(testEntry).replace(/\.ts$/, '.js')),
];
const compiled = candidates.find(fs.existsSync);
if (!compiled) throw new Error(`Compiled test not found for ${testEntry}`);
const coverageIncludes = coverageSources.map(source => {
  const generated = [path.join(outputDir, source.replace(/\.ts$/, '.js')), path.join(outputDir, path.basename(source).replace(/\.ts$/, '.js'))].find(fs.existsSync);
  if (!generated) throw new Error(`Compiled coverage source not found for ${source}`);
  return `--test-coverage-include=${generated.replaceAll('\\', '/')}`;
});
const coverageArguments = coverageIncludes.length ? ['--test', '--experimental-test-coverage',
  '--test-coverage-lines=90', '--test-coverage-branches=80', '--test-coverage-functions=85', ...coverageIncludes] : [];
execFileSync(process.execPath, [...coverageArguments, '--experimental-specifier-resolution=node', compiled], { stdio: 'inherit' });
