import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { canonicalDigest } from './assessV1OracleEvidence.mjs';
import { deriveLocalAcceptanceExerciseDigest } from './localAcceptanceBuild.mjs';
import { AUTHENTICATED_HOSTED_SESSION_QUERY } from './authenticatedHostedControllerAdapters.mjs';
import { AUTHENTICATED_HOSTED_CAPTURE_QUERY } from './authenticatedHostedObservationAdapter.mjs';
import { cleanupAuthenticatedSupabaseVaultSecrets, collectAuthenticatedEdgeRuntimeClosure,
  buildAuthenticatedHostedChildEnvironment, createAuthenticatedHostedDatabaseClientConfig,
  downloadAndVerifyAuthenticatedEdgeSources,
  observeAuthenticatedSupabaseVaultSecret, runAuthenticatedHostedAcceptance,
  runAuthenticatedHostedChild, stageAuthenticatedCanonicalReviewOutputs, stopAuthenticatedHostedRuntime,
  verifyAuthenticatedEdgeSourceResponse,verifyAuthenticatedHostedDeployment } from './runAuthenticatedHostedAcceptance.mjs';
import { AUTHENTICATED_V2_RELOAD_CHECKPOINT_SCHEMA, AUTHENTICATED_V2_RELOAD_COUNT_KEYS,
  emptyAuthenticatedV2ReloadReadStages } from './authenticatedV2ReloadDiagnostic.mjs';
const emptyTransportFailures = () => ({ aborted: 0, timeout: 0, connection: 0, protocol: 0, blocked: 0, other: 0 });

const functions = ['tenant-session','process-command','assess-command','assess-v2-command',
  'studio-artifact-command','studio-artifact-download','studio-delivery-authority-command',
  'legacy-delivery-command','legacy-delivery-query','studio-delivery-outcome-query',
  'enterprise-intelligence-command','enterprise-intelligence-query','synthetic-admin','pilot-operations-query',
  'enterprise-provider-lifecycle','enterprise-provider-lifecycle-authority','enterprise-provider-lifecycle-recovery'];
const sha = text => `sha256:${createHash('sha256').update(text).digest('hex')}`;
const shared = "export { value } from './nested.ts';\n";
const nested = "export { value } from '../../../services/contract.ts';\n";
const contract = 'export const value = 1;\n';
const entry = "import { value } from '../_shared/shared.ts';\nexport default value;\n";
// Deterministic fixture identity; never a configured hosted project.
const fixtureProjectRef = 'abcdefghijklmnopqrst';

test('acceptance database client owns matching client and server query deadlines', () => {
  const config = createAuthenticatedHostedDatabaseClientConfig(
    `postgresql://postgres:synthetic-password@db.${fixtureProjectRef}.supabase.co:5432/postgres?sslmode=verify-full`,
  );
  assert.equal(config.query_timeout, 30_000);
  assert.equal(config.statement_timeout, 29_000);
  assert.equal(config.application_name, 'authenticated_hosted_acceptance');
});

test('runtime settlement joins both owners and retains every settlement failure', async () => {
  const calls = [];
  await assert.rejects(stopAuthenticatedHostedRuntime({
    stopAndDrain: async () => { calls.push('server'); throw new Error('server work incomplete'); },
  }, {
    stopControlIntakeAndJoin: async () => { calls.push('controller'); throw new Error('controller work incomplete'); },
  }), error => {
    assert.equal(error.message, 'AUTHENTICATED_HOSTED_RUNNER_RUNTIME_SETTLEMENT_INCOMPLETE');
    assert.equal(error.errors.length, 2);
    return true;
  });
  assert.deepEqual(calls, ['server', 'controller']);
});

test('runner routes only exact observation reads to the bounded pool and preserves transaction affinity', async () => {
  const environment = hostedEnvironment();
  const mainQueries = []; const readQueries = []; const calls = [];
  const database = { query: async (sql, values) => { mainQueries.push([sql, values]); return { rows: [] }; } };
  const observationReadPool = {
    start: async () => calls.push('pool-start'),
    query: async (sql, values) => { readQueries.push([sql, values]); return { rows: [] }; },
    end: async () => calls.push('pool-end'),
  };
  const adapter = {
    activate: async () => { throw new Error('stop-after-routing-proof'); },
    quiesce: async () => calls.push('quiesce'),
    cleanup: async () => calls.push('cleanup'),
    verifyCleanup: async () => ({ activeSessions: 0, activeIdentities: 0, activeMemberships: 0, armedPermits: 0,
      activeSecretMaterial: 0, unapprovedActiveResidue: 0, nonExerciseChanged: false,
      immutableHistoryPreserved: true }),
  };
  await assert.rejects(runAuthenticatedHostedAcceptance(environment, {
    database,
    verifyCheckout: async () => undefined,
    createObservationReadPool: () => observationReadPool,
    createPostgresAdapter: ({ db }) => ({ ...adapter, preflight: async () => {
      await db.query('BEGIN');
      await db.query(AUTHENTICATED_HOSTED_SESSION_QUERY, ['session', 'actor']);
      await db.query(AUTHENTICATED_HOSTED_CAPTURE_QUERY, ['capture']);
      await db.query('SELECT transaction-owned-state');
      await db.query('COMMIT');
      return validPreflight(environment);
    } }),
    createIdentityAdapter: () => ({ revokeAll: async () => calls.push('revoke') }),
  }), /AUTHENTICATED_HOSTED_RUNNER_DIAGNOSTIC_ACTIVATION_UNCLASSIFIED/u);
  assert.deepEqual(mainQueries.map(([sql]) => sql), ['BEGIN', 'SELECT transaction-owned-state', 'COMMIT']);
  assert.deepEqual(readQueries.map(([sql]) => sql),
    [AUTHENTICATED_HOSTED_SESSION_QUERY, AUTHENTICATED_HOSTED_CAPTURE_QUERY]);
  assert.deepEqual(calls, ['pool-start', 'quiesce', 'revoke', 'cleanup', 'pool-end']);
});

test('runner closes the primary client and partial read pool when read-pool startup fails', async () => {
  const environment = hostedEnvironment(); const calls = []; let adapterCreated = false;
  await assert.rejects(runAuthenticatedHostedAcceptance(environment, {
    verifyCheckout: async () => undefined,
    createDatabase: () => ({ connect: async () => calls.push('database-connect'),
      end: async () => calls.push('database-end') }),
    createObservationReadPool: () => ({
      start: async () => { calls.push('pool-start'); throw new Error('read-pool-start-failed'); },
      end: async () => calls.push('pool-end'),
    }),
    createPostgresAdapter: () => { adapterCreated = true; return {}; },
  }), /read-pool-start-failed/u);
  assert.equal(adapterCreated, false);
  assert.deepEqual(calls, ['database-connect', 'pool-start', 'pool-end', 'database-end']);
});

test('read-pool close failure is retained after quiescence and primary cleanup continue', async () => {
  const environment = hostedEnvironment(); const calls = [];
  const adapter = {
    preflight: async () => validPreflight(environment),
    activate: async () => { throw new Error('activation-failed'); },
    quiesce: async () => calls.push('quiesce'), cleanup: async () => calls.push('cleanup'),
    verifyCleanup: async () => ({ activeSessions: 0, activeIdentities: 0, activeMemberships: 0, armedPermits: 0,
      activeSecretMaterial: 0, unapprovedActiveResidue: 0, nonExerciseChanged: false,
      immutableHistoryPreserved: true }),
  };
  await assert.rejects(runAuthenticatedHostedAcceptance(environment, {
    database: {}, verifyCheckout: async () => undefined,
    createObservationReadPool: () => ({ start: async () => calls.push('pool-start'),
      query: async () => ({ rows: [] }), end: async () => { calls.push('pool-end'); throw new Error('pool-close-failed'); } }),
    createPostgresAdapter: () => adapter,
    createIdentityAdapter: () => ({ revokeAll: async () => calls.push('revoke') }),
  }), error => {
    assert.equal(error.message, 'AUTHENTICATED_HOSTED_RUNNER_CLEANUP_INCOMPLETE');
    assert.match(String(error.errors?.at(-1)?.message), /pool-close-failed/u);
    return true;
  });
  assert.deepEqual(calls, ['pool-start', 'quiesce', 'revoke', 'cleanup', 'pool-end']);
});

const hostedEnvironment = () => ({
  GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REPOSITORY:'APReddy-AutoBotz/AvalaOS-Core',
  GITHUB_WORKFLOW_REF:'APReddy-AutoBotz/AvalaOS-Core/.github/workflows/authenticated-product-acceptance.yml@refs/heads/main',
  GITHUB_JOB:'hosted-authenticated',GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',RELEASE_SHA:'a'.repeat(40),GITHUB_SHA:'a'.repeat(40),
  HOSTED_PILOT_URL:'https://avalaos-pilot.netlify.app',NETLIFY_DEPLOY_ID:'b'.repeat(24),
  AUTHENTICATED_ACCEPTANCE_EXECUTION_KIND:'hosted_authenticated_synthetic',AUTHENTICATED_ACCEPTANCE_AUTH_KIND:'supabase_auth',
  AUTHENTICATED_ACCEPTANCE_SUPABASE_URL:`https://${fixtureProjectRef}.supabase.co`,
  AUTHENTICATED_ACCEPTANCE_EXPECTED_PROJECT_REF:'abcdefghijklmnopqrst',AUTHENTICATED_ACCEPTANCE_TARGET_PUBLIC_DIGEST:sha('target'),
  AUTHENTICATED_ACCEPTANCE_SUPABASE_SERVICE_ROLE_KEY:'service-role-key-value-longer-than-thirty-two-characters',
  AUTHENTICATED_ACCEPTANCE_DATABASE_URL:'postgresql://postgres:synthetic-password@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=verify-full',
  AUTHENTICATED_ACCEPTANCE_BACKEND_DIGEST:sha('backend'),AUTHENTICATED_ACCEPTANCE_MIGRATION_VERSION:'20261019161723',
  AUTHENTICATED_ACCEPTANCE_MIGRATION_DIGEST:sha('migration'),AUTHENTICATED_ACCEPTANCE_EXERCISE_DIGEST:sha('exercise'),
  AUTHENTICATED_ACCEPTANCE_CATALOG_DIGEST:sha('catalog'),AUTHENTICATED_ACCEPTANCE_SOURCE_DIGEST:sha('source'),
  AUTHENTICATED_ACCEPTANCE_BASELINE_DIGEST:sha('baseline'),AUTHENTICATED_ACCEPTANCE_SYNTHETIC_ONLY:'true',
  AUTHENTICATED_ACCEPTANCE_PRODUCTION:'false',AUTHENTICATED_ACCEPTANCE_CUSTOMER_DATA:'false',
  AUTHENTICATED_ACCEPTANCE_PROVIDERS_ENABLED:'false',AUTHENTICATED_ACCEPTANCE_PAID_CALLS:'false',
  AUTHENTICATED_ACCEPTANCE_SECRET_BACKEND:'supabase_vault',AVALA_PROVIDER_SECRET_BACKEND:'supabase_vault',
  AUTHENTICATED_ACCEPTANCE_SCOPE:JSON.stringify({organizationId:'11111111-1111-4111-8111-111111111111',
    workspaceId:'22222222-2222-4222-8222-222222222222',roleIds:{author:'33333333-3333-4333-8333-333333333333',
      reviewer:'44444444-4444-4444-8444-444444444444',approver:'55555555-5555-4555-8555-555555555555',
      outsider:'66666666-6666-4666-8666-666666666666',
      deliveryOwner:'77777777-7777-4777-8777-777777777777'}}),
});

const validPreflight = environment => ({syntheticTarget:true,production:false,releaseSha:environment.RELEASE_SHA,
  deploymentId:environment.NETLIFY_DEPLOY_ID,migrationVersion:environment.AUTHENTICATED_ACCEPTANCE_MIGRATION_VERSION,
  backendDigest:environment.AUTHENTICATED_ACCEPTANCE_BACKEND_DIGEST,providersEnabled:false,runtimeReady:true,
  secretBackendKind:'supabase_vault',secretBackendWritable:true,
  publicTargetDigest:environment.AUTHENTICATED_ACCEPTANCE_TARGET_PUBLIC_DIGEST,
  baselineDigest:environment.AUTHENTICATED_ACCEPTANCE_BASELINE_DIGEST,customerRows:0,unapprovedActiveResidue:0,
  scopeReady:true,observationStartedAt:'2026-10-13T00:00:00.000Z'});

async function fixture(t, mode = 'exact') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'authenticated-source-test-'));
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('authenticated-source-test-'));
    await rm(root, { recursive: true, force: true });
  });
  const save = async (directory, relative, text) => {
    const file = path.join(directory, 'supabase', 'functions', relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, text);
  };
  await save(root, '_shared/shared.ts', shared);
  await save(root, '_shared/nested.ts', nested);
  await mkdir(path.join(root, 'services'), { recursive: true });
  await writeFile(path.join(root, 'services/contract.ts'), contract);
  const expected = {};
  for (const slug of functions) {
    await save(root, `${slug}/index.ts`, entry);
    expected[`${slug}:${slug}/index.ts`] = sha(entry);
    expected[`${slug}:_shared/shared.ts`] = sha(shared);
    expected[`${slug}:_shared/nested.ts`] = sha(nested);
    expected[`${slug}:services/contract.ts`] = sha(contract);
  }
  const deployments={};let fetchCount=0;
  for(const [index,slug] of functions.entries())deployments[slug]={
    id:`00000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,version:index+1,status:'ACTIVE'};
  const multipart=slug=>{
    const form=new FormData();const deployment=deployments[slug];
    const metadata={deployment_id:`${fixtureProjectRef}_${deployment.id}_${deployment.version}`,
      original_size:4096,compressed_size:2048,module_count:4,
      deno2_entrypoint_path:`source/supabase/functions/${slug}/index.ts`};
    if(mode==='metadata-extra')metadata.unknown=true;
    if(mode==='metadata-entrypoint')metadata.deno2_entrypoint_path='source/wrong.ts';
    if(mode==='metadata-deployment')metadata.deployment_id='wrong';
    if(mode==='metadata-count')metadata.module_count=5;
    form.append('metadata',mode==='metadata-invalid'?'{':mode==='metadata-large'?'x'.repeat(64*1024+1):JSON.stringify(metadata));
    const sources=[
      [`source/supabase/functions/${slug}/index.ts`,entry.replaceAll('\n','\r\n')],
      ['source/supabase/functions/_shared/shared.ts',shared],
      ['source/supabase/functions/_shared/nested.ts',mode==='stale-first'&&slug===functions[0]
        ?'export const value = 0;\n':mode==='invalid-byte'?Buffer.from([0xff]):nested],
      [mode==='path-traversal'?'source/services/../contract.ts':'source/services/contract.ts',contract],
    ];
    for(const [remote,text] of sources){
      if(mode==='missing-transitive'&&remote.endsWith('/nested.ts'))continue;
      if(mode==='missing-repository-dependency'&&remote==='source/services/contract.ts')continue;
      form.append(mode==='unknown-field'?'unknown':'file',new Blob([text]),remote);
    }
    if(mode==='extra')form.append('file',new Blob(['extra']),'source/extra.ts');
    if(mode==='duplicate-file')form.append('file',new Blob([entry]),`source/supabase/functions/${slug}/index.ts`);
    if(mode==='duplicate-metadata')form.append('metadata','{}');
    return new Response(form);
  };
  const fetchImpl=async(url,options)=>{
    const slug=functions[fetchCount++];
    assert.equal(url,`https://api.supabase.com/v1/projects/${fixtureProjectRef}/functions/${slug}/body`);
    assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
    assert.equal(options.headers.authorization,'Bearer fake-management-token-only');
    assert.equal(options.headers.accept,'multipart/form-data');
    return multipart(slug);
  };
  return { root,deployments,fetchImpl,multipart,
    config: { projectRef: fixtureProjectRef, backendDigest: canonicalDigest(expected) } };
}

async function functionsOnlyFixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'authenticated-functions-layout-test-'));
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('authenticated-functions-layout-test-'));
    await rm(root, { recursive: true, force: true });
  });
  const slug=functions[0];
  const localEntry="import { value } from '../_shared/shared.ts';\nexport default value;\n";
  const localShared='export const value = 1;\n';
  const entryPath=path.join(root,'supabase','functions',slug,'index.ts');
  const sharedPath=path.join(root,'supabase','functions','_shared','shared.ts');
  await mkdir(path.dirname(entryPath),{recursive:true});
  await mkdir(path.dirname(sharedPath),{recursive:true});
  await writeFile(entryPath,localEntry);await writeFile(sharedPath,localShared);
  const deployment={id:'00000000-0000-4000-8000-000000000001',version:1,status:'ACTIVE'};
  const multipart=({entrypoint=`functions/${slug}/index.ts`,fileLayout='functions'}={})=>{
    const form=new FormData();
    form.append('metadata',JSON.stringify({deployment_id:`${fixtureProjectRef}_${deployment.id}_${deployment.version}`,
      original_size:4096,compressed_size:2048,module_count:2,deno2_entrypoint_path:entrypoint}));
    const entryPrefix=['functions','mixed','traversal'].includes(fileLayout)?'functions':'source/supabase/functions';
    const sharedPrefix=fileLayout==='functions'?'functions':'source/supabase/functions';
    form.append('file',new Blob([localEntry]),`${entryPrefix}/${slug}/index.ts`);
    form.append('file',new Blob([localShared]),fileLayout==='traversal'
      ?'functions/_shared/../_shared/shared.ts':`${sharedPrefix}/_shared/shared.ts`);
    return new Response(form);
  };
  return {root,slug,deployment,multipart};
}

async function closureFixture(t, entryText, dependencies = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'authenticated-closure-test-'));
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('authenticated-closure-test-'));
    await rm(root, { recursive: true, force: true });
  });
  const entryPath = path.join(root, 'supabase', 'functions', 'fixture', 'index.ts');
  await mkdir(path.dirname(entryPath), { recursive: true });
  await writeFile(entryPath, entryText);
  for (const [relative, text] of Object.entries(dependencies)) {
    const file = path.join(path.dirname(entryPath), relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, text);
  }
  return root;
}

test('runtime closure excludes only whole-statement type imports and exports', async t => {
  const root = await closureFixture(t, [
    "import type { Imported } from './missing-import.ts';",
    "export type { Exported } from './missing-export.ts';",
    'export const runtime = 1;',
  ].join('\n'));
  const closure = await collectAuthenticatedEdgeRuntimeClosure(root, 'fixture');
  assert.deepEqual([...closure.keys()], ['fixture/index.ts']);
});

test('runtime closure retains static, inline, mixed, re-export and literal dynamic dependencies', async t => {
  const sources = {
    'default.ts':'export default 1;\n', 'namespace.ts':'export const value = 1;\n',
    'side-effect.ts':'globalThis;\n', 'inline.ts':'export type Inline = string;\n',
    'mixed.ts':'export type Mixed = string; export const runtime = 1;\n',
    'reexport.ts':'export const value = 1;\n', 'export-all.ts':'export const value = 1;\n',
    'dynamic.ts':'export const value = 1;\n',
  };
  const root = await closureFixture(t, [
    "import Default from './default.ts';",
    "import * as Namespace from './namespace.ts';",
    "import './side-effect.ts';",
    "import { type Inline } from './inline.ts';",
    "import { type Mixed, runtime } from './mixed.ts';",
    "export { value } from './reexport.ts';",
    "export * from './export-all.ts';",
    "void import('./dynamic.ts');",
    'void Default; void Namespace; void runtime;',
  ].join('\n'), sources);
  const closure = await collectAuthenticatedEdgeRuntimeClosure(root, 'fixture');
  assert.deepEqual([...closure.keys()].toSorted(), [
    'fixture/default.ts', 'fixture/dynamic.ts', 'fixture/export-all.ts', 'fixture/index.ts',
    'fixture/inline.ts', 'fixture/mixed.ts', 'fixture/namespace.ts', 'fixture/reexport.ts',
    'fixture/side-effect.ts',
  ]);
});

for (const [label, source] of [
  ['inline type', "import { type Missing } from './missing-inline.ts';\n"],
  ['mixed', "import { type Missing, runtime } from './missing-mixed.ts';\nvoid runtime;\n"],
]) {
  test(`runtime closure requires ${label} import dependencies`, async t => {
    const root = await closureFixture(t, source);
    await assert.rejects(collectAuthenticatedEdgeRuntimeClosure(root, 'fixture'),
      /BACKEND_LOCAL_DEPENDENCY_UNRESOLVED/u);
  });
}

test('runtime closure rejects an unresolved relative runtime import', async t => {
  const root = await closureFixture(t, "import './missing-runtime.ts';\n");
  await assert.rejects(collectAuthenticatedEdgeRuntimeClosure(root, 'fixture'),
    /BACKEND_LOCAL_DEPENDENCY_UNRESOLVED/u);
});

test('runtime closure rejects parser errors', async t => {
  const root = await closureFixture(t, "import { value from './dependency.ts';\n");
  await assert.rejects(collectAuthenticatedEdgeRuntimeClosure(root, 'fixture'),
    /BACKEND_LOCAL_SOURCE_PARSE_REJECTED/u);
});

test('runtime closure rejects non-literal dynamic imports', async t => {
  const root = await closureFixture(t, "const dependency = './dependency.ts';\nvoid import(dependency);\n");
  await assert.rejects(collectAuthenticatedEdgeRuntimeClosure(root, 'fixture'),
    /BACKEND_LOCAL_DYNAMIC_IMPORT_REJECTED/u);
});

test('runtime closure rejects a relative dependency symlink that escapes the repository', async t => {
  const root = await closureFixture(t, "import './dependency.ts';\n");
  const outside = await mkdtemp(path.join(os.tmpdir(), 'authenticated-closure-outside-'));
  t.after(async () => {
    assert.equal(path.dirname(outside), path.resolve(os.tmpdir()));
    assert.ok(path.basename(outside).startsWith('authenticated-closure-outside-'));
    await rm(outside, { recursive: true, force: true });
  });
  const target = path.join(outside, 'dependency.ts');
  await writeFile(target, 'export const value = 1;\n');
  try {
    await symlink(target, path.join(root, 'supabase', 'functions', 'fixture', 'dependency.ts'), 'file');
  } catch (error) {
    if (['EACCES', 'EPERM', 'UNKNOWN'].includes(error?.code)) {
      t.skip('file symlinks are unavailable for this Windows test process');
      return;
    }
    throw error;
  }
  await assert.rejects(collectAuthenticatedEdgeRuntimeClosure(root, 'fixture'),
    /BACKEND_LOCAL_DEPENDENCY_ESCAPE/u);
});

test('multipart source attestation verifies all functions and transitive dependencies',async t=>{
  const sample=await fixture(t);const result=await downloadAndVerifyAuthenticatedEdgeSources(sample.config,{
    root:sample.root,fetchImpl:sample.fetchImpl,deployments:sample.deployments,
    managementToken:'fake-management-token-only'});
  assert.deepEqual(result,{backendDigest:sample.config.backendDigest,files:functions.length*4});
  assert.equal(await readFile(path.join(sample.root,'supabase/functions/_shared/nested.ts'),'utf8'),nested);
});

test('canonical review staging retains only the complete bounded two-project output set',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'canonical-review-stage-test-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const source=path.join(root,'browser-workspace','evidence');
  const destination=path.join(root,'authenticated-canonical-review');
  await mkdir(source,{recursive:true});
  const suffixes=['decision-pack.md','decision-pack.png','studio-brd.md','studio-brd.png',
    'delivery-package.md','delivery-package.png','monitor-baseline.png','database-evidence.json'];
  for(const project of ['desktop-chromium','pixel-7-chromium']){
    await writeFile(path.join(source,`canonical-${project}.json`),'{}\n');
    for(const suffix of suffixes)await writeFile(path.join(source,`${project}-ap-invoice-exception-${suffix}`),'bounded\n');
  }
  await writeFile(path.join(source,'browser-desktop-chromium.json'),'must-not-stage\n');
  const staged=await stageAuthenticatedCanonicalReviewOutputs(source,destination,{tempRoot:root});
  assert.equal(staged.length,18);
  assert.deepEqual((await readdir(destination)).toSorted(),[...staged].toSorted());
  await assert.rejects(readFile(path.join(destination,'browser-desktop-chromium.json')),/ENOENT/u);
});

test('multipart source attestation accepts the exact functions-only layout when the closure stays under functions',async t=>{
  const sample=await functionsOnlyFixture(t);
  const compared=await verifyAuthenticatedEdgeSourceResponse(sample.multipart(),{root:sample.root,slug:sample.slug,
    projectRef:fixtureProjectRef,deployment:sample.deployment});
  assert.deepEqual(Object.keys(compared).toSorted(),[
    `${sample.slug}:_shared/shared.ts`,`${sample.slug}:${sample.slug}/index.ts`,
  ].toSorted());
  const repositoryCompared=await verifyAuthenticatedEdgeSourceResponse(sample.multipart({
    entrypoint:`source/supabase/functions/${sample.slug}/index.ts`,fileLayout:'repository'}),{
    root:sample.root,slug:sample.slug,projectRef:fixtureProjectRef,deployment:sample.deployment});
  assert.deepEqual(repositoryCompared,compared);
});

test('functions-only layout rejects a dependency symlink into repository-level services',async t=>{
  const sample=await functionsOnlyFixture(t);
  const link=path.join(sample.root,'supabase/functions/_shared/shared.ts');
  const target=path.join(sample.root,'services/shared.ts');
  await mkdir(path.dirname(target),{recursive:true});await writeFile(target,await readFile(link));await rm(link);
  try{await symlink(target,link,'file');}catch(error){
    if(['EACCES','EPERM','UNKNOWN'].includes(error?.code)){
      t.skip('file symlinks are unavailable for this Windows test process');return;
    }throw error;
  }
  await assert.rejects(verifyAuthenticatedEdgeSourceResponse(sample.multipart(),{root:sample.root,slug:sample.slug,
    projectRef:fixtureProjectRef,deployment:sample.deployment}),/BACKEND_SOURCE_METADATA_REJECTED/u);
});

test('functions-only metadata rejects a closure with a repository-level dependency',async t=>{
  const sample=await fixture(t);const slug=functions[0];const deployment=sample.deployments[slug];
  const form=new FormData();
  form.append('metadata',JSON.stringify({deployment_id:`${fixtureProjectRef}_${deployment.id}_${deployment.version}`,
    original_size:4096,compressed_size:2048,module_count:4,deno2_entrypoint_path:`functions/${slug}/index.ts`}));
  form.append('file',new Blob([entry]),`functions/${slug}/index.ts`);
  form.append('file',new Blob([shared]),'functions/_shared/shared.ts');
  form.append('file',new Blob([nested]),'functions/_shared/nested.ts');
  form.append('file',new Blob([contract]),'functions/services/contract.ts');
  await assert.rejects(verifyAuthenticatedEdgeSourceResponse(new Response(form),{root:sample.root,slug,
    projectRef:fixtureProjectRef,deployment}),/BACKEND_SOURCE_METADATA_REJECTED/u);
});

for(const [label,entrypoint,fileLayout,code] of [
  ['source-functions entrypoint',`source/functions/${functions[0]}/index.ts`,'functions','BACKEND_SOURCE_METADATA_REJECTED'],
  ['wrong-slug functions entrypoint',`functions/${functions[1]}/index.ts`,'functions','BACKEND_SOURCE_METADATA_REJECTED'],
  ['mixed repository-root files',`functions/${functions[0]}/index.ts`,'mixed','BACKEND_DEPENDENCY_CLOSURE_EXTRA'],
  ['short files under repository metadata',`source/supabase/functions/${functions[0]}/index.ts`,'functions',
    'BACKEND_DEPENDENCY_CLOSURE_EXTRA'],
  ['short-root traversal alias',`functions/${functions[0]}/index.ts`,'traversal','BACKEND_SOURCE_MULTIPART_REJECTED'],
])test(`functions-only source attestation rejects ${label}`,async t=>{
  const sample=await functionsOnlyFixture(t);
  await assert.rejects(verifyAuthenticatedEdgeSourceResponse(sample.multipart({entrypoint,fileLayout}),{
    root:sample.root,slug:sample.slug,projectRef:fixtureProjectRef,deployment:sample.deployment}),new RegExp(code,'u'));
});

for(const [mode,code] of [
  ['stale-first','BACKEND_SOURCE_FILE_MISMATCH'],
  ['invalid-byte','BACKEND_SOURCE_FILE_MISMATCH'],
  ['missing-transitive','BACKEND_DEPENDENCY_CLOSURE_MISSING'],
  ['missing-repository-dependency','BACKEND_DEPENDENCY_CLOSURE_MISSING'],
  ['extra','BACKEND_DEPENDENCY_CLOSURE_EXTRA'],
  ['metadata-invalid','BACKEND_SOURCE_METADATA_REJECTED'],
  ['metadata-extra','BACKEND_SOURCE_METADATA_REJECTED'],
  ['metadata-entrypoint','BACKEND_SOURCE_METADATA_REJECTED'],
  ['metadata-deployment','BACKEND_SOURCE_METADATA_REJECTED'],
  ['metadata-count','BACKEND_SOURCE_METADATA_REJECTED'],
  ['metadata-large','BACKEND_SOURCE_MULTIPART_REJECTED'],
  ['duplicate-metadata','BACKEND_SOURCE_MULTIPART_REJECTED'],
  ['duplicate-file','BACKEND_SOURCE_MULTIPART_REJECTED'],
  ['unknown-field','BACKEND_SOURCE_MULTIPART_REJECTED'],
  ['path-traversal','BACKEND_SOURCE_MULTIPART_REJECTED'],
])test(`multipart source verification rejects ${mode}`,async t=>{
  const sample=await fixture(t,mode);
  await assert.rejects(downloadAndVerifyAuthenticatedEdgeSources(sample.config,{root:sample.root,
    fetchImpl:sample.fetchImpl,deployments:sample.deployments,managementToken:'fake-management-token-only'}),
  new RegExp(code,'u'));
});

test('offline multipart verifier returns only the selected function digest map',async t=>{
  const sample=await fixture(t);const slug=functions[0];
  const compared=await verifyAuthenticatedEdgeSourceResponse(sample.multipart(slug),{root:sample.root,slug,
    projectRef:fixtureProjectRef,deployment:sample.deployments[slug]});
  assert.deepEqual(Object.keys(compared).toSorted(),[
    `${slug}:_shared/nested.ts`,`${slug}:_shared/shared.ts`,`${slug}:services/contract.ts`,`${slug}:${slug}/index.ts`,
  ].toSorted());
});

for(const [label,response,code] of [
  ['status',new Response(null,{status:403,headers:{'content-type':'multipart/form-data; boundary=abc'}}),
    'BACKEND_SOURCE_STATUS_REJECTED'],
  ['media type',new Response('no',{status:200,headers:{'content-type':'application/octet-stream'}}),
    'BACKEND_SOURCE_CONTENT_TYPE_REJECTED'],
  ['missing boundary',new Response('no',{status:200,headers:{'content-type':'multipart/form-data'}}),
    'BACKEND_SOURCE_CONTENT_TYPE_REJECTED'],
  ['zero declared size',new Response('x',{status:200,headers:{'content-type':'multipart/form-data; boundary=abc',
    'content-length':'0'}}),'BACKEND_SOURCE_SIZE_REJECTED'],
  ['oversized declaration',new Response('x',{status:200,headers:{'content-type':'multipart/form-data; boundary=abc',
    'content-length':String(33*1024*1024)}}),'BACKEND_SOURCE_SIZE_REJECTED'],
  ['malformed multipart',new Response('not-multipart',{status:200,
    headers:{'content-type':'multipart/form-data; boundary=abc'}}),'BACKEND_SOURCE_MULTIPART_REJECTED'],
])test(`multipart response rejects ${label}`,async t=>{
  const sample=await fixture(t);const slug=functions[0];
  await assert.rejects(verifyAuthenticatedEdgeSourceResponse(response,{root:sample.root,slug,
    projectRef:fixtureProjectRef,deployment:sample.deployments[slug]}),new RegExp(code,'u'));
});

test('multipart response rejects redirects and requests never follow them',async t=>{
  const sample=await fixture(t);const response=sample.multipart(functions[0]);
  Object.defineProperty(response,'redirected',{value:true});
  await assert.rejects(downloadAndVerifyAuthenticatedEdgeSources(sample.config,{root:sample.root,
    deployments:sample.deployments,managementToken:'fake-management-token-only',
    fetchImpl:async(_url,options)=>{assert.equal(options.redirect,'error');return response;}}),
  /BACKEND_SOURCE_REDIRECT_REJECTED/u);
});

test('multipart response enforces the streamed byte bound',async t=>{
  const sample=await fixture(t);const oversized=new ReadableStream({start(controller){
    controller.enqueue(new Uint8Array(32*1024*1024));controller.enqueue(new Uint8Array([1]));controller.close();}});
  await assert.rejects(downloadAndVerifyAuthenticatedEdgeSources(sample.config,{root:sample.root,
    deployments:sample.deployments,managementToken:'fake-management-token-only',
    fetchImpl:async()=>new Response(oversized,{status:200,headers:{'content-type':'multipart/form-data; boundary=abc'}})}),
  /BACKEND_SOURCE_SIZE_REJECTED/u);
});

test('multipart fetch sanitizes cancellation',async t=>{
  const sample=await fixture(t);const aborted=new Error('sensitive');aborted.name='AbortError';
  await assert.rejects(downloadAndVerifyAuthenticatedEdgeSources(sample.config,{root:sample.root,
    deployments:sample.deployments,managementToken:'fake-management-token-only',fetchImpl:async()=>{throw aborted;}}),
  /^Error: AUTHENTICATED_HOSTED_RUNNER_DIAGNOSTIC_SOURCE_DOWNLOAD_TIMEOUT$/u);
});

test('multipart source verification requires every exact deployment binding',async t=>{
  const sample=await fixture(t);sample.deployments[functions[0]]={...sample.deployments[functions[0]],status:'INACTIVE'};
  await assert.rejects(downloadAndVerifyAuthenticatedEdgeSources(sample.config,{root:sample.root,
    fetchImpl:sample.fetchImpl,deployments:sample.deployments,managementToken:'fake-management-token-only'}),
  /BACKEND_DEPLOYMENT_BINDING_REJECTED/u);
});

test('protected backend binding rejects a missing canonical Delivery command deployment',async t=>{
  const sample=await fixture(t);delete sample.deployments['enterprise-intelligence-command'];
  await assert.rejects(downloadAndVerifyAuthenticatedEdgeSources(sample.config,{root:sample.root,
    fetchImpl:sample.fetchImpl,deployments:sample.deployments,managementToken:'fake-management-token-only'}),
  /BACKEND_DEPLOYMENT_BINDING_REJECTED/u);
});

const deploymentVerificationFixture=sample=>{
  const config={origin:'https://avalaos-pilot.netlify.app',releaseSha:'a'.repeat(40),deploymentId:'b'.repeat(24),
    projectRef:fixtureProjectRef,backendDigest:sample.config.backendDigest,targetPublicDigest:sha('target')};
  const rows=functions.map(slug=>({slug,...sample.deployments[slug]}));
  const frontend=()=>new Response('<div id="root"></div>',{status:200,headers:{
    'x-avalaos-release':config.releaseSha,'x-avalaos-environment':'hosted_nonproduction_pilot',
    'x-avalaos-netlify-deploy-id':config.deploymentId}});
  return {config,rows,frontend};
};

test('deployment verification passes stable inventory bindings to source verification',async t=>{
  const sample=await fixture(t);const setup=deploymentVerificationFixture(sample);let inventoryCalls=0;let supplied;
  const fetchImpl=async url=>url===setup.config.origin?setup.frontend():new Response(JSON.stringify(setup.rows),{
    status:200,headers:{'content-type':'application/json','x-call':String(++inventoryCalls)}});
  const result=await verifyAuthenticatedHostedDeployment(setup.config,{fetchImpl,managementToken:'fake-management-token-only',
    verifyDownloadedSources:async(_config,options)=>{supplied=options.deployments;return {}}});
  assert.equal(inventoryCalls,2);assert.equal(supplied.get(functions[0]).version,1);
  assert.equal(result.backendDigest,setup.config.backendDigest);
});

test('local deployment verification uses exact build identity and preserves backend source checks',async t=>{
  const sample=await fixture(t);const setup=deploymentVerificationFixture(sample);
  const config={...setup.config,origin:'http://127.0.0.1:4173',deploymentId:null,
    executionKind:'local_real_backend_authenticated',buildDigest:sha('local-build'),
    localBuildWorkspace:path.join(os.tmpdir(),'avalaos-local-acceptance-fixture')};
  let frontendInput;let inventoryCalls=0;let sourceCalled=false;
  const fetchImpl=async()=>new Response(JSON.stringify(setup.rows),{
    status:200,headers:{'content-type':'application/json','x-call':String(++inventoryCalls)}});
  const result=await verifyAuthenticatedHostedDeployment(config,{fetchImpl,
    managementToken:'fake-management-token-only',
    verifyLocalFrontend:async input=>{frontendInput=input;return {verified:true};},
    verifyDownloadedSources:async()=>{sourceCalled=true;return {};}});
  assert.deepEqual(frontendInput,{workspace:config.localBuildWorkspace,releaseSha:config.releaseSha,
    buildDigest:config.buildDigest,fetchImpl});
  assert.equal(inventoryCalls,2);assert.equal(sourceCalled,true);
  assert.equal(result.deploymentId,null);
  assert.equal(result.executionKind,'local_real_backend_authenticated');
  assert.equal(result.buildDigest,config.buildDigest);
});

for(const [label,change,code] of [
  ['missing',rows=>rows.slice(1),'BACKEND_FUNCTION_MISSING'],
  ['duplicate',rows=>[...rows,rows[0]],'BACKEND_INVENTORY_REJECTED'],
])test(`deployment verification rejects ${label} initial inventory before source verification`,async t=>{
  const sample=await fixture(t);const setup=deploymentVerificationFixture(sample);let sourceCalled=false;
  const rows=change(setup.rows);
  const fetchImpl=async url=>url===setup.config.origin?setup.frontend():new Response(JSON.stringify(rows),{
    status:200,headers:{'content-type':'application/json'}});
  await assert.rejects(verifyAuthenticatedHostedDeployment(setup.config,{fetchImpl,
    managementToken:'fake-management-token-only',verifyDownloadedSources:async()=>{sourceCalled=true;}}),new RegExp(code,'u'));
  assert.equal(sourceCalled,false);
});

test('deployment verification rejects version drift after source verification',async t=>{
  const sample=await fixture(t);const setup=deploymentVerificationFixture(sample);let inventories=0;let sourceCalled=false;
  const fetchImpl=async url=>{if(url===setup.config.origin)return setup.frontend();inventories+=1;
    const rows=inventories===1?setup.rows:setup.rows.map((row,index)=>index===0?{...row,version:row.version+1}:row);
    return new Response(JSON.stringify(rows),{status:200,headers:{'content-type':'application/json'}});};
  await assert.rejects(verifyAuthenticatedHostedDeployment(setup.config,{fetchImpl,
    managementToken:'fake-management-token-only',verifyDownloadedSources:async()=>{sourceCalled=true;}}),
  /BACKEND_INVENTORY_DRIFT/u);assert.equal(sourceCalled,true);assert.equal(inventories,2);
});

test('database connection diagnostics are sanitized and the failed owned client is closed', async () => {
  const environment=hostedEnvironment();const calls=[];let adapterCreated=false;
  await assert.rejects(runAuthenticatedHostedAcceptance(environment,{verifyCheckout:async()=>{},
    createDatabase:()=>({connect:async()=>{calls.push('connect');const error=new Error('postgresql://secret@host/db');
      error.code='ENOTFOUND';throw error;},end:async()=>calls.push('end')}),
    createPostgresAdapter:()=>{adapterCreated=true;return {};}}),
  /^Error: AUTHENTICATED_HOSTED_RUNNER_DIAGNOSTIC_DATABASE_CONNECT_DNS$/u);
  assert.deepEqual(calls,['connect','end']);assert.equal(adapterCreated,false);
});

test('database close failure keeps cleanup precedence and only retains sanitized diagnostics', async () => {
  const environment=hostedEnvironment();let caught;
  try {await runAuthenticatedHostedAcceptance(environment,{verifyCheckout:async()=>{},
    createDatabase:()=>({connect:async()=>{const error=new Error('primary-sensitive-value');error.code='ENOTFOUND';throw error;},
      end:async()=>{throw new Error('cleanup-sensitive-value');}})});
  } catch(error){caught=error;}
  assert.equal(caught?.message,'AUTHENTICATED_HOSTED_RUNNER_CLEANUP_INCOMPLETE');
  assert.deepEqual(caught?.errors?.map(error=>error.message),[
    'AUTHENTICATED_HOSTED_RUNNER_DIAGNOSTIC_DATABASE_CONNECT_DNS',
    'AUTHENTICATED_HOSTED_RUNNER_DIAGNOSTIC_DATABASE_CONNECT_UNCLASSIFIED',
  ]);
});

test('preflight diagnostics stop before activation without exposing the injected error', async () => {
  const environment=hostedEnvironment();const calls=[];
  const adapter={preflight:async()=>{calls.push('preflight');throw new Error('fixture-sensitive-value-must-never-appear');},
    activate:async()=>calls.push('activate')};
  await assert.rejects(runAuthenticatedHostedAcceptance(environment,{database:{},verifyCheckout:async()=>{},
    createPostgresAdapter:()=>adapter,createIdentityAdapter:()=>({})}),
  /^Error: AUTHENTICATED_HOSTED_RUNNER_DIAGNOSTIC_DATABASE_SCOPE_BASELINE_UNCLASSIFIED$/u);
  assert.deepEqual(calls,['preflight']);
});

test('activation diagnostics retain the exact stage and clean an unknown activation outcome', async () => {
  const environment=hostedEnvironment();const calls=[];
  const adapter={preflight:async()=>validPreflight(environment),
    activate:async()=>{calls.push('activate');throw new Error('fixture-sensitive-value-must-never-appear');},
    quiesce:async()=>calls.push('quiesce'),cleanup:async()=>calls.push('cleanup'),
    verifyCleanup:async()=>({activeSessions:0,activeIdentities:0,activeMemberships:0,armedPermits:0,
      activeSecretMaterial:0,unapprovedActiveResidue:0,nonExerciseChanged:false,immutableHistoryPreserved:true})};
  await assert.rejects(runAuthenticatedHostedAcceptance(environment,{database:{},verifyCheckout:async()=>{},
    createPostgresAdapter:()=>adapter,createIdentityAdapter:()=>({revokeAll:async()=>calls.push('revoke')})}),
  /^Error: AUTHENTICATED_HOSTED_RUNNER_DIAGNOSTIC_ACTIVATION_UNCLASSIFIED$/u);
  assert.deepEqual(calls,['activate','quiesce','revoke','cleanup']);
});

test('runner cancellation after activation stops before finalization and follows cleanup', async () => {
  const environment=hostedEnvironment();const calls=[];const signalSource=new EventEmitter();
  const adapter={
    preflight:async()=>validPreflight(environment),
    activate:async()=>calls.push('activate'),quiesce:async()=>calls.push('quiesce'),cleanup:async()=>calls.push('cleanup'),
    verifyCleanup:async()=>({activeSessions:0,activeIdentities:0,activeMemberships:0,armedPermits:0,
      activeSecretMaterial:0,unapprovedActiveResidue:0,nonExerciseChanged:false,immutableHistoryPreserved:true}),
  };
  await assert.rejects(runAuthenticatedHostedAcceptance(environment,{database:{},signalSource,verifyCheckout:async()=>{},
    createPostgresAdapter:()=>adapter,createIdentityAdapter:()=>({revokeAll:async()=>calls.push('revoke')}),
    startServer:async()=>({baseUrl:'http://127.0.0.1:1',controlToken:'token',close:async()=>calls.push('close')}),
    runPlaywright:async()=>signalSource.emit('SIGINT')}),/AUTHENTICATED_HOSTED_RUNNER_BROWSER_CANCELLED/u);
  assert.deepEqual(calls,['activate','close','quiesce','revoke','cleanup']);
  assert.equal(signalSource.listenerCount('SIGINT'),0);assert.equal(signalSource.listenerCount('SIGTERM'),0);
});

test('unsettled runtime preserves the primary failure and skips cleanup and database close', async t => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'authenticated-unsettled-runtime-test-'));
  t.after(() => rm(outputRoot, { recursive: true, force: true }));
  const outputPaths = {
    browser: path.join(outputRoot, 'browser.json'), server: path.join(outputRoot, 'server.json'),
    binding: path.join(outputRoot, 'binding.json'), diagnostic: path.join(outputRoot, 'diagnostic.json'),
    v2ReloadDiagnostic: path.join(outputRoot, 'v2.json'),
  };
  const environment = hostedEnvironment(); const calls = [];
  const adapter = {
    preflight: async () => validPreflight(environment), activate: async () => calls.push('activate'),
    quiesce: async () => calls.push('quiesce'), cleanup: async () => calls.push('cleanup'),
  };
  await assert.rejects(runAuthenticatedHostedAcceptance(environment, {
    outputPaths,
    createDatabase: () => ({ connect: async () => calls.push('connect'), end: async () => calls.push('end') }),
    verifyCheckout: async () => undefined,
    createPostgresAdapter: () => adapter,
    createIdentityAdapter: () => ({ revokeAll: async () => calls.push('revoke') }),
    startServer: async () => ({ baseUrl: 'http://127.0.0.1:1', controlToken: 'token',
      stopAndDrain: async () => { calls.push('stop'); throw new Error('owned handler still running'); } }),
    runPlaywright: async () => { throw new Error('primary browser failure'); },
  }), error => {
    assert.equal(error.message, 'AUTHENTICATED_HOSTED_RUNNER_CLEANUP_INCOMPLETE');
    assert.match(String(error.errors?.[0]?.message), /primary browser failure/u);
    return true;
  });
  assert.deepEqual(calls, ['connect', 'activate', 'stop']);
});

test('browser child environment is a strict public and ephemeral allowlist', () => {
  const secret='fixture-sensitive-value-must-never-appear';
  const environment={PATH:process.env.PATH,NODE_OPTIONS:`--require=${secret}`,
    AUTHENTICATED_ACCEPTANCE_DATABASE_URL:secret,
    AUTHENTICATED_ACCEPTANCE_SUPABASE_SERVICE_ROLE_KEY:secret,
    AUTHENTICATED_ACCEPTANCE_SUPABASE_MANAGEMENT_TOKEN:secret,
    AUTHENTICATED_ACCEPTANCE_SCOPE:secret,AVALA_VAULT_TOKEN:secret,OPENAI_API_KEY:secret,GITHUB_TOKEN:secret};
  const child=buildAuthenticatedHostedChildEnvironment(environment,
    {origin:'https://avalaos-pilot.netlify.app',supabaseUrl:`https://${fixtureProjectRef}.supabase.co`,
      acceptanceMode:'full_acceptance'},
    {baseUrl:'http://127.0.0.1:1234',controlToken:'ephemeral-loopback-token'},
    {browserEvidence:path.join(os.tmpdir(),'owned','evidence'),playwright:path.join(os.tmpdir(),'owned','playwright'),
      diagnostic:path.join(os.tmpdir(),'owned','diagnostic.json')});
  assert.equal(child.ENTERPRISE_LIFECYCLE_CONTROL_TOKEN,'ephemeral-loopback-token');
  assert.equal(child.AUTHENTICATED_ACCEPTANCE_SUPABASE_URL,`https://${fixtureProjectRef}.supabase.co`);
  assert.equal(child.AUTHENTICATED_ACCEPTANCE_MODE,'full_acceptance');
  assert.equal(child.ENTERPRISE_LIFECYCLE_CANONICAL_AP_INVOICE_EXCEPTION,'1');
  const focusedChild=buildAuthenticatedHostedChildEnvironment(environment,
    {origin:'https://avalaos-pilot.netlify.app',supabaseUrl:`https://${fixtureProjectRef}.supabase.co`,
      acceptanceMode:'govern_studio_diagnostic'},
    {baseUrl:'http://127.0.0.1:1234',controlToken:'ephemeral-loopback-token'},
    {browserEvidence:path.join(os.tmpdir(),'owned','evidence'),playwright:path.join(os.tmpdir(),'owned','playwright'),
      diagnostic:path.join(os.tmpdir(),'owned','diagnostic.json')});
  assert.equal(Object.hasOwn(focusedChild,'ENTERPRISE_LIFECYCLE_CANONICAL_AP_INVOICE_EXCEPTION'),false);
  assert.equal(JSON.stringify(child).includes(secret),false);
  for(const forbidden of ['NODE_OPTIONS','AUTHENTICATED_ACCEPTANCE_DATABASE_URL','AUTHENTICATED_ACCEPTANCE_SUPABASE_SERVICE_ROLE_KEY',
    'AUTHENTICATED_ACCEPTANCE_SUPABASE_MANAGEMENT_TOKEN','AUTHENTICATED_ACCEPTANCE_SCOPE','AVALA_VAULT_TOKEN','OPENAI_API_KEY','GITHUB_TOKEN']){
    assert.equal(Object.hasOwn(child,forbidden),false,forbidden);
  }
});

test('focused V2 diagnostic runner selects one Desktop prefix, cleans up, and emits no full evidence', async t => {
  const environment = { ...hostedEnvironment(), AUTHENTICATED_ACCEPTANCE_MODE: 'v2_primary_prefix_diagnostic' };
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'authenticated-v2-output-test-'));
  t.after(() => rm(outputRoot, { recursive: true, force: true }));
  const outputPaths = {
    browser: path.join(outputRoot, 'browser.json'),
    server: path.join(outputRoot, 'server.json'),
    binding: path.join(outputRoot, 'binding.json'),
    diagnostic: path.join(outputRoot, 'diagnostic.json'),
    v2ReloadDiagnostic: path.join(outputRoot, 'v2-diagnostic.json'),
  };
  for (const file of [outputPaths.browser, outputPaths.server, outputPaths.binding]) {
    await writeFile(file, 'preserved-prior-evidence\n');
  }
  const calls = [];
  const frameCounts = value => Object.fromEntries(AUTHENTICATED_V2_RELOAD_COUNT_KEYS.map(key => [key, value]));
  const frames = [
    { ...frameCounts(0), targetHash: sha('before-create') },
    { ...frameCounts(1), targetHash: sha('after-create') },
    { ...frameCounts(1), targetHash: sha('after-create') },
  ];
  let frameIndex = 0; let controller;
  const actorId = '33333333-3333-4333-8333-333333333333';
  const sessionId = '77777777-7777-4777-8777-777777777777';
  const accessToken = `${Buffer.from('{}').toString('base64url')}.${
    Buffer.from(JSON.stringify({ sub: actorId, session_id: sessionId })).toString('base64url')}.${'x'.repeat(48)}`;
  const adapter = {
    preflight: async () => validPreflight(environment),
    activate: async () => calls.push('activate'),
    frame: async () => frames[frameIndex++],
    quiesce: async () => calls.push('quiesce'),
    cleanup: async () => calls.push('cleanup'),
    verifyCleanup: async () => ({ activeSessions: 0, activeIdentities: 0, activeMemberships: 0, armedPermits: 0,
      activeSecretMaterial: 0, unapprovedActiveResidue: 0, nonExerciseChanged: false,
      immutableHistoryPreserved: true }),
  };
  const browser = (overrides = {}) => ({ sessionObserved: true, selectedScopeObserved: true,
    selectedProcessObserved: true, serverContextObserved: true, resumedDraftRendered: false,
    failureRendered: false, readStages: emptyAuthenticatedV2ReloadReadStages(), ...overrides });
  await runAuthenticatedHostedAcceptance(environment, {
    outputPaths,
    database: {},
    verifyCheckout: async () => calls.push('checkout'),
    createPostgresAdapter: () => adapter,
    createIdentityAdapter: () => ({ verifySession: async () => ({ actorId, sessionId }),
      revokeAll: async () => calls.push('revoke') }),
    createBrowserWorkspace: () => mkdtemp(path.join(os.tmpdir(), 'authenticated-hosted-browser-')),
    startServer: async value => {
      controller = value;
      return { baseUrl: 'http://127.0.0.1:1234', controlToken: 'ephemeral-token',
        close: async () => calls.push('close') };
    },
    runPlaywright: async (_command, args, options) => {
      assert.deepEqual(args.slice(-2), ['--project=desktop-chromium', '--grep=@v2-primary-prefix-diagnostic']);
      assert.equal(options.env.AUTHENTICATED_ACCEPTANCE_MODE, 'v2_primary_prefix_diagnostic');
      controller.projects.set('desktop-chromium', { identities: { author: { id: actorId } } });
      controller.boundSessions.set('desktop-chromium:author', { actorId, sessionId });
      const send = (phase, snapshot = browser()) => controller.recordV2ReloadDiagnosticCheckpoint({
        schemaVersion: AUTHENTICATED_V2_RELOAD_CHECKPOINT_SCHEMA, phase, projectName: 'desktop-chromium',
        persona: 'author', accessToken, browser: snapshot,
      });
      await send('before-create');
      await send('before-reload');
      const stages = emptyAuthenticatedV2ReloadReadStages().map(row => ({ ...row, status: 'passed', httpStatus: 200,
        rowCount: ['case-discovery', 'case', 'draft-head'].includes(row.stage) ? 1 : 0,
        lifecycle: { requested: 1, responseStarted: 1, completed: 1, transportFailed: 0, pending: 0,
          bodyCompleted: 1, bodyFailed: 0, bodyPending: 0, transportFailures: emptyTransportFailures() } }));
      await send('after-reload', browser({ resumedDraftRendered: true, readStages: stages }));
    },
  });
  const result = JSON.parse(await readFile(outputPaths.v2ReloadDiagnostic, 'utf8'));
  assert.equal(result.observedOutcome, 'draft_resumed');
  assert.equal(result.reloadProjectionUnchanged, true);
  assert.equal(result.acceptancePromoted, false);
  assert.deepEqual(calls, ['checkout', 'activate', 'close', 'quiesce', 'revoke', 'cleanup']);
  for (const file of [outputPaths.browser, outputPaths.server, outputPaths.binding]) {
    assert.equal(await readFile(file, 'utf8'), 'preserved-prior-evidence\n');
  }
});

test('reviewer selection runner uses one Desktop case and writes its result only after verified cleanup', async t => {
  const approvedExerciseDigest=sha('reviewer-runner-approved');const buildDigest=sha('reviewer-runner-build');
  const environment={...hostedEnvironment(),AUTHENTICATED_ACCEPTANCE_MODE:'reviewer_selection_diagnostic',
    ACCEPTANCE_EXECUTION_KIND:'local_real_backend',AUTHENTICATED_ACCEPTANCE_EXECUTION_KIND:'local_real_backend_authenticated',
    HOSTED_PILOT_URL:'http://127.0.0.1:4173',NETLIFY_DEPLOY_ID:'',AUTHENTICATED_ACCEPTANCE_BUILD_DIGEST:buildDigest,
    AUTHENTICATED_ACCEPTANCE_APPROVED_EXERCISE_DIGEST:approvedExerciseDigest,
    AUTHENTICATED_ACCEPTANCE_EXERCISE_DIGEST:deriveLocalAcceptanceExerciseDigest({approvedExerciseDigest,buildDigest,
      releaseSha:'a'.repeat(40)}),
    LOCAL_ACCEPTANCE_BUILD_ROOT:path.join(os.tmpdir(),'avalaos-local-acceptance-reviewer-runner-fixture')};
  const outputBase=path.join(process.cwd(),'output','local-private','authenticated-product-acceptance');
  await mkdir(outputBase,{recursive:true});
  const outputRoot=await mkdtemp(path.join(outputBase,'reviewer-runner-output-'));t.after(()=>rm(outputRoot,{recursive:true,force:true}));
  const outputPaths={browser:path.join(outputRoot,'browser.json'),server:path.join(outputRoot,'server.json'),
    binding:path.join(outputRoot,'binding.json'),diagnostic:path.join(outputRoot,'diagnostic.json'),
    reviewerSelectionDiagnostic:path.join(outputRoot,'reviewer.json')};
  const calls=[];let controller;
  const adapter={preflight:async()=>({...validPreflight(environment),deploymentId:null,
    executionKind:'local_real_backend_authenticated',buildDigest}),activate:async()=>calls.push('activate'),
    quiesce:async()=>calls.push('quiesce'),cleanup:async()=>calls.push('cleanup'),
    verifyCleanup:async()=>({activeSessions:0,activeIdentities:0,activeMemberships:0,armedPermits:0,
      activeSecretMaterial:0,unapprovedActiveResidue:0,nonExerciseChanged:false,immutableHistoryPreserved:true})};
  await runAuthenticatedHostedAcceptance(environment,{outputPaths,database:{},verifyCheckout:async()=>calls.push('checkout'),
    createPostgresAdapter:()=>adapter,createIdentityAdapter:()=>({revokeAll:async()=>calls.push('revoke')}),
    createBrowserWorkspace:()=>mkdtemp(path.join(os.tmpdir(),'authenticated-hosted-browser-')),
    startServer:async value=>{controller=value;controller.reviewerSelectionDiagnosticResult=()=>{
      assert.deepEqual(calls,['checkout','activate','close','quiesce','revoke','cleanup']);
      return {schemaVersion:'authenticated-reviewer-selection-diagnostic-v2'};
    };return {baseUrl:'http://127.0.0.1:1234',controlToken:'token',close:async()=>calls.push('close')};},
    runPlaywright:async(_command,args,options)=>{
      assert.deepEqual(args.slice(-2),['--project=desktop-chromium','--grep=@reviewer-selection-diagnostic']);
      assert.equal(options.env.AUTHENTICATED_ACCEPTANCE_MODE,'reviewer_selection_diagnostic');
    }});
  assert.deepEqual(JSON.parse(await readFile(outputPaths.reviewerSelectionDiagnostic,'utf8')),
    {schemaVersion:'authenticated-reviewer-selection-diagnostic-v2'});
  for(const key of ['browser','server','binding'])await assert.rejects(readFile(outputPaths[key],'utf8'),/ENOENT/u);
});

test('Govern and Studio runner selects two serial Desktop tests and writes only its bounded result after cleanup', async t => {
  const approvedExerciseDigest=sha('govern-studio-runner-approved');const buildDigest=sha('govern-studio-runner-build');
  const environment={...hostedEnvironment(),AUTHENTICATED_ACCEPTANCE_MODE:'govern_studio_diagnostic',
    ACCEPTANCE_EXECUTION_KIND:'local_real_backend',AUTHENTICATED_ACCEPTANCE_EXECUTION_KIND:'local_real_backend_authenticated',
    HOSTED_PILOT_URL:'http://127.0.0.1:4173',NETLIFY_DEPLOY_ID:'',AUTHENTICATED_ACCEPTANCE_BUILD_DIGEST:buildDigest,
    AUTHENTICATED_ACCEPTANCE_APPROVED_EXERCISE_DIGEST:approvedExerciseDigest,
    AUTHENTICATED_ACCEPTANCE_EXERCISE_DIGEST:deriveLocalAcceptanceExerciseDigest({approvedExerciseDigest,buildDigest,
      releaseSha:'a'.repeat(40)}),
    LOCAL_ACCEPTANCE_BUILD_ROOT:path.join(os.tmpdir(),'avalaos-local-acceptance-govern-studio-runner-fixture')};
  const outputBase=path.join(process.cwd(),'output','local-private','authenticated-product-acceptance');
  await mkdir(outputBase,{recursive:true});
  const outputRoot=await mkdtemp(path.join(outputBase,'govern-studio-runner-output-'));
  t.after(()=>rm(outputRoot,{recursive:true,force:true}));
  const outputPaths={browser:path.join(outputRoot,'browser.json'),server:path.join(outputRoot,'server.json'),
    binding:path.join(outputRoot,'binding.json'),diagnostic:path.join(outputRoot,'diagnostic.json'),
    governStudioDiagnostic:path.join(outputRoot,'govern-studio.json')};
  for(const key of ['browser','server','binding'])await writeFile(outputPaths[key],'preserved-prior-evidence\n');
  const calls=[];let controller;
  const adapter={preflight:async()=>({...validPreflight(environment),deploymentId:null,
    executionKind:'local_real_backend_authenticated',buildDigest}),activate:async()=>calls.push('activate'),
    quiesce:async()=>calls.push('quiesce'),cleanup:async()=>calls.push('cleanup'),
    verifyCleanup:async()=>({activeSessions:0,activeIdentities:0,activeMemberships:0,armedPermits:0,
      activeSecretMaterial:0,unapprovedActiveResidue:0,nonExerciseChanged:false,immutableHistoryPreserved:true})};
  await runAuthenticatedHostedAcceptance(environment,{outputPaths,database:{},verifyCheckout:async()=>calls.push('checkout'),
    createPostgresAdapter:()=>adapter,createIdentityAdapter:()=>({revokeAll:async()=>calls.push('revoke')}),
    createBrowserWorkspace:()=>mkdtemp(path.join(os.tmpdir(),'authenticated-hosted-browser-')),
    startServer:async value=>{controller=value;controller.governStudioDiagnosticResult=()=>{
      assert.deepEqual(calls,['checkout','activate','close','quiesce','revoke','cleanup']);
      return {schemaVersion:'authenticated-govern-studio-diagnostic-v1'};
    };return {baseUrl:'http://127.0.0.1:1234',controlToken:'token',close:async()=>calls.push('close')};},
    runPlaywright:async(_command,args,options)=>{
      assert.deepEqual(args.slice(-2),['--project=desktop-chromium','--grep=@govern-studio-diagnostic']);
      assert.equal(options.env.AUTHENTICATED_ACCEPTANCE_MODE,'govern_studio_diagnostic');
    }});
  assert.deepEqual(JSON.parse(await readFile(outputPaths.governStudioDiagnostic,'utf8')),
    {schemaVersion:'authenticated-govern-studio-diagnostic-v1'});
  for(const key of ['browser','server','binding'])assert.equal(await readFile(outputPaths[key],'utf8'),
    'preserved-prior-evidence\n');
});

test('Govern and Studio runner removes stale focused evidence and retains only sanitized failure after cleanup', async t => {
  const approvedExerciseDigest=sha('govern-studio-failure-approved');const buildDigest=sha('govern-studio-failure-build');
  const environment={...hostedEnvironment(),AUTHENTICATED_ACCEPTANCE_MODE:'govern_studio_diagnostic',
    ACCEPTANCE_EXECUTION_KIND:'local_real_backend',AUTHENTICATED_ACCEPTANCE_EXECUTION_KIND:'local_real_backend_authenticated',
    HOSTED_PILOT_URL:'http://127.0.0.1:4173',NETLIFY_DEPLOY_ID:'',AUTHENTICATED_ACCEPTANCE_BUILD_DIGEST:buildDigest,
    AUTHENTICATED_ACCEPTANCE_APPROVED_EXERCISE_DIGEST:approvedExerciseDigest,
    AUTHENTICATED_ACCEPTANCE_EXERCISE_DIGEST:deriveLocalAcceptanceExerciseDigest({approvedExerciseDigest,buildDigest,
      releaseSha:'a'.repeat(40)}),
    LOCAL_ACCEPTANCE_BUILD_ROOT:path.join(os.tmpdir(),'avalaos-local-acceptance-govern-studio-failure-fixture')};
  const outputRoot=await mkdtemp(path.join(os.tmpdir(),'authenticated-govern-studio-failure-output-'));
  t.after(()=>rm(outputRoot,{recursive:true,force:true}));
  const outputPaths={browser:path.join(outputRoot,'browser.json'),server:path.join(outputRoot,'server.json'),
    binding:path.join(outputRoot,'binding.json'),diagnostic:path.join(outputRoot,'diagnostic.json'),
    governStudioDiagnostic:path.join(outputRoot,'govern-studio.json')};
  await writeFile(outputPaths.governStudioDiagnostic,'stale-focused-evidence\n');
  const calls=[];
  const adapter={preflight:async()=>({...validPreflight(environment),deploymentId:null,
    executionKind:'local_real_backend_authenticated',buildDigest}),activate:async()=>calls.push('activate'),
  quiesce:async()=>calls.push('quiesce'),cleanup:async()=>calls.push('cleanup'),
  verifyCleanup:async()=>({activeSessions:0,activeIdentities:0,activeMemberships:0,armedPermits:0,
    activeSecretMaterial:0,unapprovedActiveResidue:0,nonExerciseChanged:false,immutableHistoryPreserved:true})};
  await assert.rejects(runAuthenticatedHostedAcceptance(environment,{outputPaths,database:{},
    verifyCheckout:async()=>{},createPostgresAdapter:()=>adapter,
    createIdentityAdapter:()=>({revokeAll:async()=>calls.push('revoke')}),
    createBrowserWorkspace:()=>mkdtemp(path.join(os.tmpdir(),'authenticated-hosted-browser-')),
    startServer:async()=>({baseUrl:'http://127.0.0.1:1234',controlToken:'token',
      close:async()=>calls.push('close')}),
    runPlaywright:async()=>{throw new Error('govern studio browser failure');}}),/govern studio browser failure/u);
  const diagnostic=JSON.parse(await readFile(outputPaths.diagnostic,'utf8'));
  assert.deepEqual(diagnostic.failure,{phase:'BROWSER_EXECUTION',category:'RUNNER_REJECTED'});
  assert.equal(diagnostic.cleanup.status,'verified');
  assert.deepEqual(calls,['activate','close','quiesce','revoke','cleanup']);
  await assert.rejects(readFile(outputPaths.governStudioDiagnostic,'utf8'),/ENOENT/u);
  for(const key of ['browser','server','binding'])await assert.rejects(readFile(outputPaths[key],'utf8'),/ENOENT/u);
});

test('focused V2 diagnostic browser failure still writes a partial sanitized artifact after cleanup', async t => {
  const environment = { ...hostedEnvironment(), AUTHENTICATED_ACCEPTANCE_MODE: 'v2_primary_prefix_diagnostic' };
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'authenticated-v2-failure-output-test-'));
  t.after(() => rm(outputRoot, { recursive: true, force: true }));
  const outputPaths = {
    browser: path.join(outputRoot, 'browser.json'), server: path.join(outputRoot, 'server.json'),
    binding: path.join(outputRoot, 'binding.json'), diagnostic: path.join(outputRoot, 'diagnostic.json'),
    v2ReloadDiagnostic: path.join(outputRoot, 'v2-diagnostic.json'),
  };
  const calls = [];
  const adapter = {
    preflight: async () => validPreflight(environment), activate: async () => calls.push('activate'),
    quiesce: async () => calls.push('quiesce'), cleanup: async () => calls.push('cleanup'),
    verifyCleanup: async () => ({ activeSessions: 0, activeIdentities: 0, activeMemberships: 0, armedPermits: 0,
      activeSecretMaterial: 0, unapprovedActiveResidue: 0, nonExerciseChanged: false,
      immutableHistoryPreserved: true }),
  };
  await assert.rejects(runAuthenticatedHostedAcceptance(environment, {
    outputPaths, database: {}, verifyCheckout: async () => {}, createPostgresAdapter: () => adapter,
    createIdentityAdapter: () => ({ revokeAll: async () => calls.push('revoke') }),
    createBrowserWorkspace: () => mkdtemp(path.join(os.tmpdir(), 'authenticated-hosted-browser-')),
    startServer: async () => ({ baseUrl: 'http://127.0.0.1:1234', controlToken: 'ephemeral-token',
      close: async () => calls.push('close') }),
    runPlaywright: async () => { throw new Error('private browser failure'); },
  }), /private browser failure/u);
  const partial = JSON.parse(await readFile(outputPaths.v2ReloadDiagnostic, 'utf8'));
  assert.equal(partial.diagnosticCompleted, false);
  assert.equal(partial.observedOutcome, 'control_failure');
  assert.equal(partial.acceptancePromoted, false);
  const diagnostic = JSON.parse(await readFile(outputPaths.diagnostic, 'utf8'));
  assert.deepEqual(diagnostic.failure, { phase: 'BROWSER_EXECUTION', category: 'RUNNER_REJECTED' });
  assert.equal(diagnostic.cleanup.status, 'verified');
  assert.deepEqual(calls, ['activate', 'close', 'quiesce', 'revoke', 'cleanup']);
});

test('runner retains real controller action counters through failure and cleanup', async t => {
  const environment = hostedEnvironment();
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'observation-timing-runner-'));
  t.after(() => rm(outputRoot, { recursive: true, force: true }));
  const outputPaths = Object.fromEntries(['browser','server','binding','diagnostic'].map(key => [key,path.join(outputRoot, key+'.json')]));
  let controller, captureCount = 0, queryCount = 0;
  const calls = [];
  const adapter = {
    preflight: async () => validPreflight(environment), activate: async () => {},
    quiesce: async () => calls.push('quiesce'), cleanup: async () => calls.push('cleanup'),
    verifyCleanup: async () => ({activeSessions:0,activeIdentities:0,activeMemberships:0,armedPermits:0,
      activeSecretMaterial:0,unapprovedActiveResidue:0,nonExerciseChanged:false,immutableHistoryPreserved:true}),
  };
  await assert.rejects(runAuthenticatedHostedAcceptance(environment, {
    outputPaths, database: { query: async () => { queryCount++; return {rows:[]}; } },
    verifyCheckout: async () => {},
    createPostgresAdapter: ({db}) => ({...adapter, observe: async () => {
      await db.query(AUTHENTICATED_HOSTED_CAPTURE_QUERY, ['private-param']);
      return {capturedAt:new Date(Date.UTC(2026,0,1,0,0,++captureCount)).toISOString(),records:[]};
    }}),
    createIdentityAdapter: () => ({ revokeAll: async () => calls.push('revoke') }),
    createBrowserWorkspace: () => mkdtemp(path.join(os.tmpdir(), 'authenticated-hosted-browser-')),
    startServer: async value => {
      controller = value;
      return {baseUrl:'http://127.0.0.1:1234',controlToken:'token',close:async()=>calls.push('close')};
    },
    runPlaywright: async () => {
      controller.projects.set('desktop-chromium', {lastBoundaryAt:'2026-01-01T00:00:00.000Z'});
      controller.resolveBrowserActionBinding = async () => ({actorHash:'sha256:'+'a'.repeat(64),sessionHash:'sha256:'+'b'.repeat(64)});
      const action = await controller.beginBrowserAction({projectName:'desktop-chromium',accessToken:'private-token',
        requestBody:{method:'GET'},route:'/functions/v1/tenant-session'});
      const prepared = await controller.prepareBrowserAction({projectName:'desktop-chromium',actionId:action.actionId,
        status:200,responseBody:{}});
      await controller.finishBrowserAction({projectName:'desktop-chromium',actionId:action.actionId,status:200,
        preparationMode:'server-owned',...prepared});
      throw new Error('private browser failure');
    },
  }), error => {
    assert.match(error.message, /private browser failure/u);
    assert.equal(error.authenticatedHostedDiagnosticWriteFailed, undefined,
      error.authenticatedHostedDiagnosticWriteCategory);
    return true;
  });
  const diagnostic = JSON.parse(await readFile(outputPaths.diagnostic,'utf8'));
  assert.equal(queryCount, 2);
  for (const key of ['admission','prepare','finish','beforeObservation','afterObservation','beforeCaptureQuery','afterCaptureQuery']) {
    assert.equal(diagnostic.observationTimings[key].count, 1);
    assert.equal(diagnostic.observationTimings[key].inFlight, 0);
  }
  assert.equal(diagnostic.cleanup.status, 'verified');
  assert.ok(!JSON.stringify(diagnostic).includes('private'));
  assert.deepEqual(calls, ['close','quiesce','revoke','cleanup']);
});

test('browser child wrapper preserves only validated nonzero diagnostics', async t => {
  const root=await mkdtemp(path.join(os.tmpdir(),'authenticated-child-test-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const diagnosticPath=path.join(root,'diagnostic.json');
  await writeFile(diagnosticPath,JSON.stringify({schemaVersion:'authenticated-hosted-playwright-diagnostic-v1',
    project:'desktop-chromium',testCategory:'project-bootstrap',category:'unexpected-failure'}));
  await assert.rejects(runAuthenticatedHostedChild(process.execPath,['-e','process.exit(7)'],{env:{}},{diagnosticPath}),error=>{
    assert.equal(error.message,'AUTHENTICATED_HOSTED_RUNNER_BROWSER_EXIT_NONZERO');
    assert.deepEqual(error.authenticatedHostedPlaywrightDiagnostic,{schemaVersion:'authenticated-hosted-playwright-diagnostic-v1',
      project:'desktop-chromium',testCategory:'project-bootstrap',category:'unexpected-failure'});
    return true;
  });
  await writeFile(diagnosticPath,JSON.stringify({schemaVersion:'authenticated-hosted-playwright-diagnostic-v1',
    project:'desktop-chromium',testCategory:'project-bootstrap',category:'unexpected-failure',raw:'secret'}));
  await assert.rejects(runAuthenticatedHostedChild(process.execPath,['-e','process.exit(8)'],{env:{}},{diagnosticPath}),error=>{
    assert.equal(error.authenticatedHostedPlaywrightDiagnostic,null);return true;
  });
});

test('browser child wrapper distinguishes timeout and cancellation without child output', async () => {
  await assert.rejects(runAuthenticatedHostedChild(process.execPath,['-e','setInterval(()=>{},1000)'],{env:{}},
    {timeoutMs:50}),/AUTHENTICATED_HOSTED_RUNNER_BROWSER_TIMEOUT/u);
  const cancellation=new AbortController();
  const running=runAuthenticatedHostedChild(process.execPath,['-e','setInterval(()=>{},1000)'],{env:{}},
    {timeoutMs:5_000,cancellationSignal:cancellation.signal});
  setTimeout(()=>cancellation.abort('raw-sensitive-reason'),50);
  await assert.rejects(running,error=>error.message==='AUTHENTICATED_HOSTED_RUNNER_BROWSER_CANCELLED'
    &&!error.message.includes('raw-sensitive-reason'));
});

test('native secret cleanup consumes the exact fenced job and proves physical absence without retries',async()=>{
  const secret={id:'11111111-1111-4111-8111-111111111111',provider:'openai',
    secret_ref:'AVALA_PROVIDER_SECRET_OPENAI_22222222222242228222222222222222_TEST',
    safe_fingerprint:'sha256:1234567890abcdef12345678'};
  const queries=[];let claims=0;
  const database={query:async(sql,params)=>{queries.push({sql,params});
    if(sql.includes('claim_provider_secret_cleanup_job'))return {rows:[{value:claims++===0?{state:'claimed',
      jobId:'33333333-3333-4333-8333-333333333333',keyRefId:secret.id,
      organizationId:'22222222-2222-4222-8222-222222222222',provider:'openai',backendKind:'supabase_vault',
      safeFingerprint:secret.safe_fingerprint,executionFence:4}:{state:'empty'}}]};
    if(sql.includes('delete_for_cleanup'))return {rows:[{value:{outcome:'deleted',backendKind:'supabase_vault',
      safeFingerprint:secret.safe_fingerprint}}]};
    if(sql.includes('complete_provider_secret_cleanup_job'))return {rows:[{value:{state:'completed',
      jobId:'33333333-3333-4333-8333-333333333333',executionFence:4}}]};
    throw new Error('unexpected query');}};
  assert.deepEqual(await cleanupAuthenticatedSupabaseVaultSecrets(database,{backendKind:'supabase_vault',
    exerciseId:'44444444-4444-4444-8444-444444444444',organizationId:'22222222-2222-4222-8222-222222222222',
    secrets:[secret]}),{backendKind:'supabase_vault',removed:1});
  assert.equal(queries.filter(item=>item.sql.includes('delete_for_cleanup')).length,1);
  assert.equal(queries.filter(item=>item.sql.includes('complete_provider_secret_cleanup_job')).length,1);
});

test('native observation and cleanup reject unowned or mismatched physical material',async()=>{
  const observedDatabase={query:async()=>({rows:[{value:{backendKind:'supabase_vault',exists:false,
    fingerprintMatches:false,state:'deleted'}}]})};
  assert.deepEqual(await observeAuthenticatedSupabaseVaultSecret(observedDatabase,{exerciseId:'1',keyRefId:'2',
    organizationId:'3',provider:'openai',safeFingerprint:'sha256:1234567890abcdef12345678'}),
  {backendKind:'supabase_vault',exists:false,fingerprintMatches:false,state:'deleted'});
  let deleted=false;
  const mismatchDatabase={query:async sql=>{
    if(sql.includes('claim_provider_secret_cleanup_job'))return {rows:[{value:{state:'claimed',
      jobId:'33333333-3333-4333-8333-333333333333',keyRefId:'99999999-9999-4999-8999-999999999999',
      organizationId:'22222222-2222-4222-8222-222222222222',provider:'openai',backendKind:'supabase_vault',
      safeFingerprint:'sha256:1234567890abcdef12345678',executionFence:1}}]};
    if(sql.includes('delete_for_cleanup'))deleted=true;
    return {rows:[]};}};
  await assert.rejects(cleanupAuthenticatedSupabaseVaultSecrets(mismatchDatabase,{backendKind:'supabase_vault',
    organizationId:'22222222-2222-4222-8222-222222222222',secrets:[{id:'11111111-1111-4111-8111-111111111111',
      provider:'openai',secret_ref:'synthetic',safe_fingerprint:'sha256:1234567890abcdef12345678'}]}),
  /SECRET_CLEANUP_JOB_REJECTED/u);
  assert.equal(deleted,false);
});
