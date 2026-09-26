import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const EXPECTED_SUPABASE_CLIENT_IMPORTS = Object.freeze([
  'beginControlledHumanCommand',
  'completeControlledHumanCommand',
  'prepareControlledHumanOfflineLineage',
  'supabase',
]);
const SUPABASE_CLIENT_STUB = `
interface ControlledHumanCommandAnchor{requestId:string;businessIdempotencyKey?:string}
const rejectStudioDecoderInvocation=():never=>{throw new Error('UNEXPECTED_STUDIO_DECODER_TRANSPORT_OR_CONTROL_INVOCATION')};
export const beginControlledHumanCommand=async(_input:{action:string;targetFamily:string;targetId:string;expectedVersion:number;selectorBindings:Record<string,unknown>}):Promise<ControlledHumanCommandAnchor|null>=>rejectStudioDecoderInvocation();
export const completeControlledHumanCommand=async(_anchor:ControlledHumanCommandAnchor):Promise<unknown>=>rejectStudioDecoderInvocation();
export const prepareControlledHumanOfflineLineage=async(_inputBundleId:string,_inputBundleVersion:number):Promise<null>=>rejectStudioDecoderInvocation();
export const supabase:any=new Proxy({}, {get:()=>rejectStudioDecoderInvocation()});
`;

const normalizeModuleIdentity = fileName => path.resolve(fileName).replaceAll('\\', '/').toLowerCase();
const supabaseClient = path.resolve('services/supabaseClient.ts');
const supabaseClientIdentity = normalizeModuleIdentity(supabaseClient);
const canonicalSupabaseClientSpecifier = sourceFileName => {
  const relative = path.relative(path.dirname(path.resolve(sourceFileName)), supabaseClient)
    .replaceAll('\\', '/')
    .replace(/\.ts$/u, '');
  return relative.startsWith('.') ? relative : `./${relative}`;
};

const importedSupabaseClientNames = (sourceFiles, resolver) => {
  const names = new Set();
  for (const sourceFile of sourceFiles) {
    const inspect = node => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
        && resolver(node.moduleSpecifier.text, sourceFile.fileName) === supabaseClientIdentity) {
        const specifier = node.moduleSpecifier.text;
        const canonicalSpecifier = canonicalSupabaseClientSpecifier(sourceFile.fileName);
        if (specifier !== canonicalSpecifier) {
          throw new Error(`STUDIO_DECODER_SUPABASE_MODULE_PATH_DRIFT:${sourceFile.fileName}:expected=${canonicalSpecifier}:actual=${specifier}`);
        }
        const bindings = node.importClause?.namedBindings;
        if (!bindings || !ts.isNamedImports(bindings) || node.importClause?.name) {
          throw new Error(`STUDIO_DECODER_SUPABASE_IMPORT_SHAPE_DRIFT:${sourceFile.fileName}`);
        }
        for (const element of bindings.elements) {
          if (element.propertyName) {
            throw new Error(`STUDIO_DECODER_SUPABASE_NAMED_ALIAS_DRIFT:${sourceFile.fileName}:${element.propertyName.text}:${element.name.text}`);
          }
          names.add(element.name.text);
        }
        return;
      }
      if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
        && resolver(node.moduleSpecifier.text, sourceFile.fileName) === supabaseClientIdentity) {
        throw new Error(`STUDIO_DECODER_SUPABASE_REEXPORT_DRIFT:${sourceFile.fileName}`);
      }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
        && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])
        && resolver(node.arguments[0].text, sourceFile.fileName) === supabaseClientIdentity) {
        throw new Error(`STUDIO_DECODER_SUPABASE_DYNAMIC_IMPORT_DRIFT:${sourceFile.fileName}`);
      }
      ts.forEachChild(node, inspect);
    };
    inspect(sourceFile);
  }
  return [...names].sort();
};

const validateSupabaseClientStubContract = (sourceFiles, stubSource, resolver) => {
  const importedNames = importedSupabaseClientNames(sourceFiles, resolver);
  const expectedNames = [...EXPECTED_SUPABASE_CLIENT_IMPORTS].sort();
  if (importedNames.join(',') !== expectedNames.join(',')) {
    throw new Error(`STUDIO_DECODER_SUPABASE_IMPORT_DRIFT:expected=${expectedNames.join(',')}:actual=${importedNames.join(',')}`);
  }
  const stubExports = [...stubSource.matchAll(/export\s+(?:const|function|class|type|interface)\s+([A-Za-z_$][\w$]*)/gu)]
    .map(match => match[1]).sort();
  if (stubExports.join(',') !== expectedNames.join(',')) {
    throw new Error(`STUDIO_DECODER_SUPABASE_STUB_EXPORT_DRIFT:expected=${expectedNames.join(',')}:actual=${stubExports.join(',')}`);
  }
};

const runSupabaseClientStubContractSelfTest = () => {
  const sourceFile = source => ts.createSourceFile('services/studioArtifacts/decoderStubContract.ts', source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const canonicalImport = `import { ${EXPECTED_SUPABASE_CLIENT_IMPORTS.join(', ')} } from '../supabaseClient';`;
  const canonicalResolver = specifier => specifier === '../supabaseClient' ? supabaseClientIdentity : null;
  const expectReject = (label, action, expectedCode) => {
    try {
      action();
    } catch (error) {
      if (String(error?.message ?? error).includes(expectedCode)) return;
      throw new Error(`STUDIO_DECODER_STUB_SELF_TEST_WRONG_ERROR:${label}:${String(error?.message ?? error)}`);
    }
    throw new Error(`STUDIO_DECODER_STUB_SELF_TEST_ACCEPTED:${label}`);
  };

  validateSupabaseClientStubContract([sourceFile(canonicalImport)], SUPABASE_CLIENT_STUB, canonicalResolver);
  expectReject('new-source-import', () => validateSupabaseClientStubContract([
    sourceFile(canonicalImport.replace(' }', ', futureControlledHumanExport }')),
  ], SUPABASE_CLIENT_STUB, canonicalResolver), 'STUDIO_DECODER_SUPABASE_IMPORT_DRIFT');
  expectReject('namespace-import', () => validateSupabaseClientStubContract([
    sourceFile("import * as alternateClient from '../supabaseClient';"),
  ], SUPABASE_CLIENT_STUB, canonicalResolver), 'STUDIO_DECODER_SUPABASE_IMPORT_SHAPE_DRIFT');
  expectReject('named-import-alias', () => validateSupabaseClientStubContract([
    sourceFile(canonicalImport.replace('beginControlledHumanCommand', 'beginControlledHumanCommand as beginAlias')),
  ], SUPABASE_CLIENT_STUB, canonicalResolver), 'STUDIO_DECODER_SUPABASE_NAMED_ALIAS_DRIFT');
  expectReject('resolved-module-alias', () => validateSupabaseClientStubContract([
    sourceFile(canonicalImport.replace("'../supabaseClient'", "'@decoder/supabaseClient'")),
  ], SUPABASE_CLIENT_STUB, specifier => specifier === '@decoder/supabaseClient' ? supabaseClientIdentity : null), 'STUDIO_DECODER_SUPABASE_MODULE_PATH_DRIFT');
  expectReject('alternate-relative-route', () => validateSupabaseClientStubContract([
    sourceFile(canonicalImport.replace("'../supabaseClient'", "'../../services/supabaseClient'")),
  ], SUPABASE_CLIENT_STUB, specifier => specifier === '../../services/supabaseClient' ? supabaseClientIdentity : null), 'STUDIO_DECODER_SUPABASE_MODULE_PATH_DRIFT');
  expectReject('reexport', () => validateSupabaseClientStubContract([
    sourceFile("export { supabase } from '../supabaseClient';"),
  ], SUPABASE_CLIENT_STUB, canonicalResolver), 'STUDIO_DECODER_SUPABASE_REEXPORT_DRIFT');
  expectReject('dynamic-import', () => validateSupabaseClientStubContract([
    sourceFile("void import('../supabaseClient');"),
  ], SUPABASE_CLIENT_STUB, canonicalResolver), 'STUDIO_DECODER_SUPABASE_DYNAMIC_IMPORT_DRIFT');
  expectReject('missing-stub-export', () => validateSupabaseClientStubContract(
    [sourceFile(canonicalImport)],
    SUPABASE_CLIENT_STUB.replace('export const prepareControlledHumanOfflineLineage', 'const prepareControlledHumanOfflineLineage'),
    canonicalResolver,
  ), 'STUDIO_DECODER_SUPABASE_STUB_EXPORT_DRIFT');
  if (!SUPABASE_CLIENT_STUB.includes('UNEXPECTED_STUDIO_DECODER_TRANSPORT_OR_CONTROL_INVOCATION')) {
    throw new Error('STUDIO_DECODER_STUB_SELF_TEST_MARKER_MISSING');
  }
  console.log('STUDIO_DECODER_STUB_CONTRACT_SELF_TEST passed=9 failed=0');
};

runSupabaseClientStubContractSelfTest();
if (process.argv.includes('--verify-stub-contract')) process.exit(0);

const [file, organizationId, workspaceId] = process.argv.slice(2);
if (!file || !organizationId || !workspaceId) {
  throw new Error('projection file and tenant context are required');
}

const outputDir = await mkdtemp(path.join(tmpdir(), 'studio-decoder-'));
try {
  await writeFile(path.join(outputDir, 'package.json'), JSON.stringify({ type: 'module' }));
  const options = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    outDir: outputDir,
    noEmit: false,
    esModuleInterop: true,
    rewriteRelativeImportExtensions: true,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
  };
  const host = ts.createCompilerHost(options);
  const originalReadFile = host.readFile.bind(host);
  host.readFile = sourceFile => path.resolve(sourceFile) === supabaseClient
    ? SUPABASE_CLIENT_STUB
    : originalReadFile(sourceFile);

  const resolveModuleIdentity = (specifier, sourceFileName) => {
    const resolved = ts.resolveModuleName(specifier, sourceFileName, options, host).resolvedModule?.resolvedFileName;
    return resolved ? normalizeModuleIdentity(resolved) : null;
  };

  const program = ts.createProgram({
    rootNames: [
      'vite-env.d.ts',
      'types.ts',
      'services/studioArtifacts/contracts.ts',
      'services/studioArtifacts/workspaceModel.ts',
      'services/studioArtifacts/workspaceRpcAdapter.ts',
      'services/studioArtifacts/client.ts',
    ],
    options,
    host,
  });
  validateSupabaseClientStubContract(
    program.getSourceFiles().filter(sourceFile => normalizeModuleIdentity(sourceFile.fileName) !== supabaseClientIdentity),
    SUPABASE_CLIENT_STUB,
    resolveModuleIdentity,
  );
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length) {
    throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: value => value,
      getCurrentDirectory: () => process.cwd(),
      getNewLine: () => '\n',
    }));
  }
  if (program.emit().emitSkipped) throw new Error('Studio decoder compilation was skipped');

  const rewriteLocalModuleSpecifiers = async directory => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await rewriteLocalModuleSpecifiers(target);
      if (!entry.isFile() || !target.endsWith('.js')) continue;
      const source = await readFile(target, 'utf8');
      const rewritten = source.replace(/(['"])(\.\.?\/[^'"\r\n]+?)(\1)/gu, (full, quote, specifier) =>
        /\.(?:js|json|mjs|cjs|ts)$/u.test(specifier) ? full : `${quote}${specifier}.js${quote}`);
      if (rewritten !== source) await writeFile(target, rewritten);
    }
  };
  await rewriteLocalModuleSpecifiers(outputDir);

  const moduleFile = path.join(outputDir, 'services', 'studioArtifacts', 'client.js');
  const { decodeStudioArtifactProjection } = await import(pathToFileURL(moduleFile).href);
  const decoded = decodeStudioArtifactProjection(
    JSON.parse(await readFile(file, 'utf8')),
    { organizationId, workspaceId },
  );
  if (decoded.ancestry.organizationId !== organizationId || decoded.ancestry.workspaceId !== workspaceId) {
    throw new Error('production decoder tenant mismatch');
  }
  console.log(`Studio production decoder bridge passed: ${decoded.id}`);
} finally {
  await rm(outputDir, { recursive: true, force: true });
}
