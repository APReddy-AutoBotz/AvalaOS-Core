import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const THRESHOLDS = { lines: 95, functions: 95, branches: 85 };
const SOURCE_SET = [
  'services/studioArtifacts/client.ts',
  'services/studioArtifacts/workspaceModel.ts',
  'services/studioArtifacts/workspaceRpcAdapter.ts',
  'supabase/functions/_shared/studioArtifactCommand.ts',
  'supabase/functions/_shared/studioArtifactHandler.ts',
  'supabase/functions/_shared/studioArtifactDb.ts',
  'supabase/functions/_shared/studioArtifactGeneration.ts',
  'supabase/functions/_shared/studioArtifactProvider.ts',
];
const TEST_SET = [
  'services/studioArtifacts/client.test.ts',
  'services/studioArtifacts/workspaceModel.test.ts',
  'services/studioArtifacts/workspaceRpcAdapter.test.ts',
  'supabase/functions/_shared/studioArtifactCommand.test.ts',
  'supabase/functions/_shared/studioArtifactDb.test.ts',
  'supabase/functions/_shared/studioArtifactGeneration.test.ts',
  'supabase/functions/_shared/studioArtifactProvider.test.ts',
];
const MODIFIED_INTEGRATION_SOURCE_SET = [
  'services/enterpriseIntelligenceClient.ts',
  'supabase/functions/_shared/enterpriseIntelligenceCommand.ts',
];
const MODIFIED_INTEGRATION_TEST_SET = [
  'services/enterpriseIntelligenceClient.prB.test.ts',
  'supabase/functions/_shared/enterpriseIntelligenceCommand.test.ts',
];
const COMPILE_SUPPORT = [
  'vite-env.d.ts',
  'supabase/functions/deno.d.ts',
  'types.ts',
  'supabase/functions/_shared/studioArtifactPrBTestEvidence.ts',
];
const outputDir = path.resolve('.agent/transcript-flow-pr-b-coverage');

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'package.json'), JSON.stringify({ type: 'module' }));

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
const supabaseClient = path.resolve('services/supabaseClient.ts');
const EXPECTED_SUPABASE_CLIENT_IMPORTS = Object.freeze([
  'beginControlledHumanCommand',
  'completeControlledHumanCommand',
  'executeControlledHumanDeniedCommand',
  'getControlledHumanEvidenceState',
  'getRuntimeDataAccess',
  'isControlledHumanRuntimeEnabled',
  'isSupabaseConfigured',
  'prepareControlledHumanOfflineLineage',
  'supabase',
]);
const SUPABASE_CLIENT_STUB = `
type ControlledHumanObservationKind='server_event'|'negative_attempt';
interface ControlledHumanStepBindingOption{checkpointId:string;stepId:string;action:string;observationKind:ControlledHumanObservationKind;state:'unanchored'|'anchored'|'completed';safeAnchor:ControlledHumanSafeStepAnchor|null;safeBinding:ControlledHumanSafeStepBinding|null}
interface ControlledHumanSafeStepAnchor{contractVersion:'pr-c-controlled-human-step-anchor-1';stepId:string;action:string;targetFamily:string;targetDigest:string;expectedVersion:number;transitionKind:'same'|'increment_one'|'create_one'|'create_zero'|'replay_existing';selectorDigest:string;intentDigest:string;requestDigest:string;challengeToken:string;anchoredAt:string}
interface ControlledHumanSafeStepBinding{contractVersion:'pr-c-controlled-human-step-binding-3';stepId:string;action:string;result:'succeeded'|'denied';resourceFamily:string;resourceDigest:string;expectedVersion:number;observedVersion:number;requestDigest:string;receiptDigest:string;auditDigest:string;intentDigest:string;denialCodeDigest:string;bindingToken:string;anchorToken:string;causalParentBindingToken:string;causalParentResourceDigest:string;causalLineageDigest:string;issuedAt:string}
interface ControlledHumanCommandAnchor{safeAnchor:ControlledHumanSafeStepAnchor;requestId:string;businessIdempotencyKey?:string}
const rejectControlledHumanCoverageInvocation=():never=>{throw new Error('UNEXPECTED_CONTROLLED_HUMAN_COVERAGE_STUB_INVOCATION')};
export const getRuntimeDataAccess=(): 'server' => 'server';
export const isSupabaseConfigured=():boolean=>true;
export const isControlledHumanRuntimeEnabled=():boolean=>false;
export const getControlledHumanEvidenceState=():{armedStep:ControlledHumanStepBindingOption|null;safeAnchor:ControlledHumanSafeStepAnchor|null}=>({armedStep:null,safeAnchor:null});
export const beginControlledHumanCommand=async(input:{action:string;targetFamily:string;targetId:string;expectedVersion:number;selectorBindings:Record<string,unknown>}):Promise<ControlledHumanCommandAnchor|null>=>{const f=(globalThis as any).__controlledHumanBegin;if(f)return f(input);return isControlledHumanRuntimeEnabled()?rejectControlledHumanCoverageInvocation():null};
export const completeControlledHumanCommand=async(anchor:ControlledHumanCommandAnchor):Promise<ControlledHumanSafeStepBinding>=>{const f=(globalThis as any).__controlledHumanComplete;if(!f)return rejectControlledHumanCoverageInvocation();return f(anchor)};
export const executeControlledHumanDeniedCommand=async(_anchor:ControlledHumanCommandAnchor):Promise<ControlledHumanSafeStepBinding>=>rejectControlledHumanCoverageInvocation();
export const prepareControlledHumanOfflineLineage=async(inputBundleId:string,inputBundleVersion:number):Promise<null>=>{const f=(globalThis as any).__controlledHumanOfflineLineage;if(f){await f(inputBundleId,inputBundleVersion);return null}return isControlledHumanRuntimeEnabled()?rejectControlledHumanCoverageInvocation():null};
export const supabase:any={functions:{invoke:async(...args:any[])=>{const f=(globalThis as any).__studioInvoke;if(!f)throw new Error('UNEXPECTED_LIVE_TRANSPORT');return f(...args)}},rpc:async(...args:any[])=>{const f=(globalThis as any).__studioRpc;if(!f)throw new Error('UNEXPECTED_LIVE_TRANSPORT');return f(...args)}};
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
    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const specifier = statement.moduleSpecifier.text;
      if (resolver(specifier, sourceFile.fileName) !== supabaseClientIdentity) continue;
      const canonicalSpecifier = canonicalSupabaseClientSpecifier(sourceFile.fileName);
      if (specifier !== canonicalSpecifier) {
        throw new Error(`PR_B_COVERAGE_SUPABASE_MODULE_PATH_DRIFT:${sourceFile.fileName}:expected=${canonicalSpecifier}:actual=${specifier}`);
      }
      const bindings = statement.importClause?.namedBindings;
      if (!bindings || !ts.isNamedImports(bindings) || statement.importClause?.name) {
        throw new Error(`PR_B_COVERAGE_SUPABASE_IMPORT_SHAPE_DRIFT:${sourceFile.fileName}`);
      }
      for (const element of bindings.elements) {
        if (element.propertyName || element.name.text !== (element.propertyName?.text ?? element.name.text)) {
          throw new Error(`PR_B_COVERAGE_SUPABASE_NAMED_ALIAS_DRIFT:${sourceFile.fileName}:${element.propertyName?.text ?? element.name.text}:${element.name.text}`);
        }
        names.add(element.name.text);
      }
    }
  }
  return [...names].sort();
};

const validateSupabaseClientStubContract = (sourceFiles, stubSource = SUPABASE_CLIENT_STUB, resolver = resolveModuleIdentity) => {
  const importedNames = importedSupabaseClientNames(sourceFiles, resolver);
  const expectedNames = [...EXPECTED_SUPABASE_CLIENT_IMPORTS].sort();
  if (importedNames.join(',') !== expectedNames.join(',')) {
    throw new Error(`PR_B_COVERAGE_SUPABASE_IMPORT_DRIFT:expected=${expectedNames.join(',')}:actual=${importedNames.join(',')}`);
  }
  const stubExports = [...stubSource.matchAll(/export\s+(?:const|function|class|type|interface)\s+([A-Za-z_$][\w$]*)/gu)]
    .map(match => match[1]).sort();
  if (stubExports.join(',') !== expectedNames.join(',')) {
    throw new Error(`PR_B_COVERAGE_SUPABASE_STUB_EXPORT_DRIFT:expected=${expectedNames.join(',')}:actual=${stubExports.join(',')}`);
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
      throw new Error(`PR_B_COVERAGE_STUB_SELF_TEST_WRONG_ERROR:${label}:${String(error?.message ?? error)}`);
    }
    throw new Error(`PR_B_COVERAGE_STUB_SELF_TEST_ACCEPTED:${label}`);
  };

  validateSupabaseClientStubContract([sourceFile(canonicalImport)]);
  expectReject('new-source-import', () => validateSupabaseClientStubContract([
    sourceFile(canonicalImport.replace(' }', ', futureControlledHumanExport }')),
  ]), 'PR_B_COVERAGE_SUPABASE_IMPORT_DRIFT');
  expectReject('namespace-import', () => validateSupabaseClientStubContract([
    sourceFile("import * as alternateClient from '../supabaseClient';"),
  ]), 'PR_B_COVERAGE_SUPABASE_IMPORT_SHAPE_DRIFT');
  expectReject('named-import-alias', () => validateSupabaseClientStubContract([
    sourceFile(canonicalImport.replace('beginControlledHumanCommand', 'beginControlledHumanCommand as beginAlias')),
  ]), 'PR_B_COVERAGE_SUPABASE_NAMED_ALIAS_DRIFT');
  expectReject('resolved-module-alias', () => validateSupabaseClientStubContract([
    sourceFile(canonicalImport.replace("'../supabaseClient'", "'@coverage/supabaseClient'")),
  ], SUPABASE_CLIENT_STUB, specifier => specifier === '@coverage/supabaseClient' ? supabaseClientIdentity : null), 'PR_B_COVERAGE_SUPABASE_MODULE_PATH_DRIFT');
  expectReject('alternate-relative-route', () => validateSupabaseClientStubContract([
    sourceFile(canonicalImport.replace("'../supabaseClient'", "'../../services/supabaseClient'")),
  ]), 'PR_B_COVERAGE_SUPABASE_MODULE_PATH_DRIFT');
  expectReject('missing-stub-export', () => validateSupabaseClientStubContract(
    [sourceFile(canonicalImport)],
    SUPABASE_CLIENT_STUB.replace('export const prepareControlledHumanOfflineLineage', 'const prepareControlledHumanOfflineLineage'),
  ), 'PR_B_COVERAGE_SUPABASE_STUB_EXPORT_DRIFT');
  for (const marker of [
    "isControlledHumanRuntimeEnabled=():boolean=>false",
    'UNEXPECTED_CONTROLLED_HUMAN_COVERAGE_STUB_INVOCATION',
    'UNEXPECTED_LIVE_TRANSPORT',
  ]) {
    if (!SUPABASE_CLIENT_STUB.includes(marker)) throw new Error(`PR_B_COVERAGE_STUB_SELF_TEST_MARKER_MISSING:${marker}`);
  }
  console.log('PR_B_COVERAGE_STUB_CONTRACT_SELF_TEST passed=7 failed=0');
};

if (process.argv.includes('--verify-stub-contract')) {
  runSupabaseClientStubContractSelfTest();
  fs.rmSync(outputDir, { recursive: true, force: true });
  process.exit(0);
}

const program = ts.createProgram({ rootNames: [
  ...COMPILE_SUPPORT, ...SOURCE_SET, ...TEST_SET,
  ...MODIFIED_INTEGRATION_SOURCE_SET, ...MODIFIED_INTEGRATION_TEST_SET,
], options, host });
validateSupabaseClientStubContract(program.getSourceFiles().filter(sourceFile => path.resolve(sourceFile.fileName) !== supabaseClient));
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: value => value,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n',
  }));
  fs.rmSync(outputDir, { recursive: true, force: true });
  process.exit(1);
}
if (program.emit().emitSkipped) {
  fs.rmSync(outputDir, { recursive: true, force: true });
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
rewriteLocalModuleSpecifiers(outputDir);

const compiled = value => path.join(outputDir, value.replace(/\.ts$/u, '.js')).replaceAll('\\', '/');
console.log(`PR_B_COVERAGE_SCOPE ${JSON.stringify({ sourceCount: SOURCE_SET.length, testCount: TEST_SET.length, thresholds: THRESHOLDS, sources: SOURCE_SET })}`);
console.log('PR_B_COVERAGE_EXCLUSIONS React workspace components are owned by the dedicated Desktop Chrome and Pixel 7 browser gates; SQL is owned by the static migration contract and disposable PostgreSQL 16 gate. The two directly modified Enterprise integration modules are measured and reported separately below, with focused PR B behavior tests; they are not silently omitted from coverage.');
const result = spawnSync(process.execPath, [
  '--experimental-test-coverage',
  `--test-coverage-lines=${THRESHOLDS.lines}`,
  `--test-coverage-functions=${THRESHOLDS.functions}`,
  `--test-coverage-branches=${THRESHOLDS.branches}`,
  ...SOURCE_SET.map(value => `--test-coverage-include=${compiled(value)}`),
  '--test',
  ...TEST_SET.map(compiled),
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
const status = result.status === 0 ? 'passed' : 'failed';
const integration = spawnSync(process.execPath, [
  '--experimental-test-coverage',
  ...MODIFIED_INTEGRATION_SOURCE_SET.map(value => `--test-coverage-include=${compiled(value)}`),
  '--test',
  ...MODIFIED_INTEGRATION_TEST_SET.map(compiled),
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
if (integration.stdout) process.stdout.write(integration.stdout);
if (integration.stderr) process.stderr.write(integration.stderr);
const integrationTestStatus = integration.status === 0 ? 'passed' : 'failed';
console.log(`PR_B_MODIFIED_INTEGRATION_COVERAGE_OBSERVATION ${JSON.stringify({
  classification: 'full-legacy-module-observation',
  thresholdGate: false,
  focusedChangedPathTests: integrationTestStatus,
  sources: MODIFIED_INTEGRATION_SOURCE_SET,
  tests: MODIFIED_INTEGRATION_TEST_SET,
})}`);
console.log(`PR_B_COVERAGE_RESULT ${JSON.stringify({ status: status === 'passed' && integrationTestStatus === 'passed' ? 'passed' : 'failed', thresholds: THRESHOLDS, sourceCount: SOURCE_SET.length, modifiedIntegrationSourceCount: MODIFIED_INTEGRATION_SOURCE_SET.length })}`);
fs.rmSync(outputDir, { recursive: true, force: true });
process.exit(result.status || integration.status || 0);
