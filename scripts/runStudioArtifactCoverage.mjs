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
const originalReadFile = host.readFile.bind(host);
const supabaseClient = path.resolve('services/supabaseClient.ts');
const EXPECTED_SUPABASE_CLIENT_IMPORTS = Object.freeze([
  'beginControlledHumanCommand',
  'completeControlledHumanCommand',
  'prepareControlledHumanOfflineLineage',
  'supabase',
]);
const SUPABASE_CLIENT_STUB = `
interface ControlledHumanCommandAnchor{requestId:string;businessIdempotencyKey?:string}
const isControlledHumanRuntimeEnabled=():boolean=>false;
const rejectControlledHumanCoverageInvocation=():never=>{throw new Error('UNEXPECTED_CONTROLLED_HUMAN_COVERAGE_STUB_INVOCATION')};
export const beginControlledHumanCommand=async(input:{action:string;targetFamily:string;targetId:string;expectedVersion:number;selectorBindings:Record<string,unknown>}):Promise<ControlledHumanCommandAnchor|null>=>{const f=(globalThis as any).__controlledHumanBegin;if(f)return f(input);return isControlledHumanRuntimeEnabled()?rejectControlledHumanCoverageInvocation():null};
export const completeControlledHumanCommand=async(anchor:ControlledHumanCommandAnchor):Promise<unknown>=>{const f=(globalThis as any).__controlledHumanComplete;if(!f)return rejectControlledHumanCoverageInvocation();return f(anchor)};
export const prepareControlledHumanOfflineLineage=async(inputBundleId:string,inputBundleVersion:number):Promise<null>=>{const f=(globalThis as any).__controlledHumanOfflineLineage;if(f){await f(inputBundleId,inputBundleVersion);return null}return isControlledHumanRuntimeEnabled()?rejectControlledHumanCoverageInvocation():null};
export const supabase:any={functions:{invoke:async(...args:any[])=>{const f=(globalThis as any).__studioInvoke;if(!f)throw new Error('UNEXPECTED_LIVE_TRANSPORT');return f(...args)}},rpc:async(...args:any[])=>{const f=(globalThis as any).__studioRpc;if(!f)throw new Error('UNEXPECTED_LIVE_TRANSPORT');return f(...args)},auth:{getSession:async()=>({data:{session:null},error:null})}};
`;
host.readFile = file => path.resolve(file) === supabaseClient
  ? SUPABASE_CLIENT_STUB
  : originalReadFile(file);

const normalizeModuleIdentity = fileName => path.resolve(fileName).replaceAll('\\', '/').toLowerCase();
const supabaseClientIdentity = normalizeModuleIdentity(supabaseClient);
const canonicalSupabaseClientSpecifier = sourceFileName => {
  const relative = path.relative(path.dirname(path.resolve(sourceFileName)), supabaseClient)
    .replaceAll('\\', '/')
    .replace(/\.ts$/u, '');
  return relative.startsWith('.') ? relative : `./${relative}`;
};
const resolveModuleIdentity = (specifier, sourceFileName) => {
  const resolved = ts.resolveModuleName(specifier, sourceFileName, options, host).resolvedModule?.resolvedFileName;
  return resolved ? normalizeModuleIdentity(resolved) : null;
};

const importedSupabaseClientNames = (sourceFiles, resolver = resolveModuleIdentity) => {
  const names = new Set();
  for (const sourceFile of sourceFiles) {
    const inspect = node => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
        && resolver(node.moduleSpecifier.text, sourceFile.fileName) === supabaseClientIdentity) {
        const specifier = node.moduleSpecifier.text;
        const canonicalSpecifier = canonicalSupabaseClientSpecifier(sourceFile.fileName);
        if (specifier !== canonicalSpecifier) {
          throw new Error(`STUDIO_COVERAGE_SUPABASE_MODULE_PATH_DRIFT:${sourceFile.fileName}:expected=${canonicalSpecifier}:actual=${specifier}`);
        }
        const bindings = node.importClause?.namedBindings;
        if (!bindings || !ts.isNamedImports(bindings) || node.importClause?.name) {
          throw new Error(`STUDIO_COVERAGE_SUPABASE_IMPORT_SHAPE_DRIFT:${sourceFile.fileName}`);
        }
        for (const element of bindings.elements) {
          if (element.propertyName) {
            throw new Error(`STUDIO_COVERAGE_SUPABASE_NAMED_ALIAS_DRIFT:${sourceFile.fileName}:${element.propertyName.text}:${element.name.text}`);
          }
          names.add(element.name.text);
        }
        return;
      }
      if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
        && resolver(node.moduleSpecifier.text, sourceFile.fileName) === supabaseClientIdentity) {
        throw new Error(`STUDIO_COVERAGE_SUPABASE_REEXPORT_DRIFT:${sourceFile.fileName}`);
      }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
        && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])
        && resolver(node.arguments[0].text, sourceFile.fileName) === supabaseClientIdentity) {
        throw new Error(`STUDIO_COVERAGE_SUPABASE_DYNAMIC_IMPORT_DRIFT:${sourceFile.fileName}`);
      }
      ts.forEachChild(node, inspect);
    };
    inspect(sourceFile);
  }
  return [...names].sort();
};

const validateSupabaseClientStubContract = (sourceFiles, stubSource = SUPABASE_CLIENT_STUB, resolver = resolveModuleIdentity) => {
  const importedNames = importedSupabaseClientNames(sourceFiles, resolver);
  const expectedNames = [...EXPECTED_SUPABASE_CLIENT_IMPORTS].sort();
  if (importedNames.join(',') !== expectedNames.join(',')) {
    throw new Error(`STUDIO_COVERAGE_SUPABASE_IMPORT_DRIFT:expected=${expectedNames.join(',')}:actual=${importedNames.join(',')}`);
  }
  const stubExports = [...stubSource.matchAll(/export\s+(?:const|function|class|type|interface)\s+([A-Za-z_$][\w$]*)/gu)]
    .map(match => match[1]).sort();
  if (stubExports.join(',') !== expectedNames.join(',')) {
    throw new Error(`STUDIO_COVERAGE_SUPABASE_STUB_EXPORT_DRIFT:expected=${expectedNames.join(',')}:actual=${stubExports.join(',')}`);
  }
};

const runSupabaseClientStubContractSelfTest = () => {
  const sourceFile = source => ts.createSourceFile('services/studioArtifacts/coverageStubContract.ts', source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const canonicalImport = `import { ${EXPECTED_SUPABASE_CLIENT_IMPORTS.join(', ')} } from '../supabaseClient';`;
  const expectReject = (label, action, expectedCode) => {
    try {
      action();
    } catch (error) {
      if (String(error?.message ?? error).includes(expectedCode)) return;
      throw new Error(`STUDIO_COVERAGE_STUB_SELF_TEST_WRONG_ERROR:${label}:${String(error?.message ?? error)}`);
    }
    throw new Error(`STUDIO_COVERAGE_STUB_SELF_TEST_ACCEPTED:${label}`);
  };

  validateSupabaseClientStubContract([sourceFile(canonicalImport)]);
  expectReject('new-source-import', () => validateSupabaseClientStubContract([
    sourceFile(canonicalImport.replace(' }', ', futureControlledHumanExport }')),
  ]), 'STUDIO_COVERAGE_SUPABASE_IMPORT_DRIFT');
  expectReject('namespace-import', () => validateSupabaseClientStubContract([
    sourceFile("import * as alternateClient from '../supabaseClient';"),
  ]), 'STUDIO_COVERAGE_SUPABASE_IMPORT_SHAPE_DRIFT');
  expectReject('named-import-alias', () => validateSupabaseClientStubContract([
    sourceFile(canonicalImport.replace('beginControlledHumanCommand', 'beginControlledHumanCommand as beginAlias')),
  ]), 'STUDIO_COVERAGE_SUPABASE_NAMED_ALIAS_DRIFT');
  expectReject('resolved-module-alias', () => validateSupabaseClientStubContract([
    sourceFile(canonicalImport.replace("'../supabaseClient'", "'@coverage/supabaseClient'")),
  ], SUPABASE_CLIENT_STUB, specifier => specifier === '@coverage/supabaseClient' ? supabaseClientIdentity : null), 'STUDIO_COVERAGE_SUPABASE_MODULE_PATH_DRIFT');
  expectReject('alternate-relative-route', () => validateSupabaseClientStubContract([
    sourceFile(canonicalImport.replace("'../supabaseClient'", "'../../services/supabaseClient'")),
  ]), 'STUDIO_COVERAGE_SUPABASE_MODULE_PATH_DRIFT');
  expectReject('reexport', () => validateSupabaseClientStubContract([
    sourceFile("export { supabase } from '../supabaseClient';"),
  ]), 'STUDIO_COVERAGE_SUPABASE_REEXPORT_DRIFT');
  expectReject('dynamic-import', () => validateSupabaseClientStubContract([
    sourceFile("void import('../supabaseClient');"),
  ]), 'STUDIO_COVERAGE_SUPABASE_DYNAMIC_IMPORT_DRIFT');
  expectReject('missing-stub-export', () => validateSupabaseClientStubContract(
    [sourceFile(canonicalImport)],
    SUPABASE_CLIENT_STUB.replace('export const prepareControlledHumanOfflineLineage', 'const prepareControlledHumanOfflineLineage'),
  ), 'STUDIO_COVERAGE_SUPABASE_STUB_EXPORT_DRIFT');
  for (const marker of [
    'isControlledHumanRuntimeEnabled=():boolean=>false',
    'UNEXPECTED_CONTROLLED_HUMAN_COVERAGE_STUB_INVOCATION',
    'UNEXPECTED_LIVE_TRANSPORT',
  ]) {
    if (!SUPABASE_CLIENT_STUB.includes(marker)) throw new Error(`STUDIO_COVERAGE_STUB_SELF_TEST_MARKER_MISSING:${marker}`);
  }
  console.log('STUDIO_COVERAGE_STUB_CONTRACT_SELF_TEST passed=9 failed=0');
};

runSupabaseClientStubContractSelfTest();
if (process.argv.includes('--verify-stub-contract')) {
  fs.rmSync(out, { recursive: true, force: true });
  process.exit(0);
}

const program = ts.createProgram({ rootNames: roots, options, host });
validateSupabaseClientStubContract(program.getSourceFiles().filter(sourceFile => path.resolve(sourceFile.fileName) !== supabaseClient));
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
