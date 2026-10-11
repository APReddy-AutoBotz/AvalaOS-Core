import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { canonicalDigest } from './assessV1OracleEvidence.mjs';
import { cleanupAuthenticatedSupabaseVaultSecrets, collectAuthenticatedEdgeRuntimeClosure,
  downloadAndVerifyAuthenticatedEdgeSources,
  observeAuthenticatedSupabaseVaultSecret, runAuthenticatedHostedAcceptance } from './runAuthenticatedHostedAcceptance.mjs';

const functions = ['tenant-session','process-command','assess-command','assess-v2-command',
  'studio-artifact-command','studio-artifact-download','studio-delivery-authority-command',
  'legacy-delivery-command','legacy-delivery-query','studio-delivery-outcome-query',
  'enterprise-intelligence-query','synthetic-admin','pilot-operations-query',
  'enterprise-provider-lifecycle','enterprise-provider-lifecycle-authority','enterprise-provider-lifecycle-recovery'];
const sha = text => `sha256:${createHash('sha256').update(text).digest('hex')}`;
const shared = "export { value } from './nested.ts';\n";
const nested = "export { value } from '../../../services/contract.ts';\n";
const contract = 'export const value = 1;\n';
const entry = "import { value } from '../_shared/shared.ts';\nexport default value;\n";
// Deterministic fixture identity; never a configured hosted project.
const fixtureProjectRef = 'abcdefghijklmnopqrst';
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
  AUTHENTICATED_ACCEPTANCE_BACKEND_DIGEST:sha('backend'),AUTHENTICATED_ACCEPTANCE_MIGRATION_VERSION:'20261011053000',
  AUTHENTICATED_ACCEPTANCE_MIGRATION_DIGEST:sha('migration'),AUTHENTICATED_ACCEPTANCE_EXERCISE_DIGEST:sha('exercise'),
  AUTHENTICATED_ACCEPTANCE_CATALOG_DIGEST:sha('catalog'),AUTHENTICATED_ACCEPTANCE_SOURCE_DIGEST:sha('source'),
  AUTHENTICATED_ACCEPTANCE_BASELINE_DIGEST:sha('baseline'),AUTHENTICATED_ACCEPTANCE_SYNTHETIC_ONLY:'true',
  AUTHENTICATED_ACCEPTANCE_PRODUCTION:'false',AUTHENTICATED_ACCEPTANCE_CUSTOMER_DATA:'false',
  AUTHENTICATED_ACCEPTANCE_PROVIDERS_ENABLED:'false',AUTHENTICATED_ACCEPTANCE_PAID_CALLS:'false',
  AUTHENTICATED_ACCEPTANCE_SECRET_BACKEND:'supabase_vault',AVALA_PROVIDER_SECRET_BACKEND:'supabase_vault',
  AUTHENTICATED_ACCEPTANCE_SCOPE:JSON.stringify({organizationId:'11111111-1111-4111-8111-111111111111',
    workspaceId:'22222222-2222-4222-8222-222222222222',roleIds:{author:'33333333-3333-4333-8333-333333333333',
      reviewer:'44444444-4444-4444-8444-444444444444',approver:'55555555-5555-4555-8555-555555555555',
      outsider:'66666666-6666-4666-8666-666666666666'}}),
});

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
  const directories = [];
  const cli = async (command, args, options) => {
    assert.equal(command, 'supabase');
    assert.deepEqual(args.slice(0, 2), ['functions', 'download']);
    assert.equal(args.includes('--use-api'), false);
    assert.equal(args.includes('--use-docker'), true);
    assert.equal(args[args.indexOf('--workdir') + 1], options.cwd);
    assert.match(await readFile(path.join(options.cwd, 'supabase/config.toml'), 'utf8'), /project_id/u);
    assert.equal(options.env.SUPABASE_ACCESS_TOKEN, 'fake-management-token-only');
    directories.push(options.cwd);
    const slug = args[2];
    // Docker unbundling targets supabase/functions/<slug>, then recreates the
    // module graph relative to its lowest repository-local source path.
    const decoded = relative => `${slug}/${relative}`;
    await save(options.cwd, decoded(`supabase/functions/${slug}/index.ts`), entry.replaceAll('\n', '\r\n'));
    await save(options.cwd, decoded('supabase/functions/_shared/shared.ts'), shared);
    if (mode !== 'missing-transitive') await save(options.cwd, decoded('supabase/functions/_shared/nested.ts'),
      mode === 'stale-first' && slug === functions[0] ? 'export const value = 0;\n' : nested);
    if (mode !== 'missing-repository-dependency') await save(options.cwd, decoded('services/contract.ts'), contract);
    if (mode === 'shadow-shared') await save(options.cwd, '_shared/shared.ts', shared);
    return { stdout: '', stderr: '' };
  };
  return { root, directories, cli, config: { projectRef: 'abcdefghijklmnopqrst', backendDigest: canonicalDigest(expected) } };
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

test('deployed source attestation verifies each independent function and transitive dependency', async t => {
  const sample = await fixture(t);
  const result = await downloadAndVerifyAuthenticatedEdgeSources(sample.config,
    { root: sample.root, cli: sample.cli, managementToken: 'fake-management-token-only' });
  assert.equal(result.files, functions.length * 4);
  assert.equal(new Set(sample.directories).size, functions.length);
  for (const directory of sample.directories) assert.equal(await stat(directory).catch(() => null), null);
  // Only the temporary downloads were removed; the checked-out source survives.
  assert.equal(await readFile(path.join(sample.root, 'supabase/functions/_shared/nested.ts'), 'utf8'), nested);
});

test('a later fresh bundle cannot conceal an earlier function with a stale shared dependency', async t => {
  const sample = await fixture(t, 'stale-first');
  await assert.rejects(downloadAndVerifyAuthenticatedEdgeSources(sample.config,
    { root: sample.root, cli: sample.cli, managementToken: 'fake-management-token-only' }), /BACKEND_SOURCE_FILE_MISMATCH/u);
  assert.equal(sample.directories.length, 1);
  assert.equal(await stat(sample.directories[0]).catch(() => null), null);
});

test('a matching entry point and direct dependency cannot hide a missing transitive dependency', async t => {
  const sample = await fixture(t, 'missing-transitive');
  await assert.rejects(downloadAndVerifyAuthenticatedEdgeSources(sample.config,
    { root: sample.root, cli: sample.cli, managementToken: 'fake-management-token-only' }), /BACKEND_DEPENDENCY_CLOSURE_MISSING/u);
  assert.equal(await stat(sample.directories[0]).catch(() => null), null);
});

test('source attestation includes production contracts outside the functions directory', async t => {
  const sample = await fixture(t, 'missing-repository-dependency');
  await assert.rejects(downloadAndVerifyAuthenticatedEdgeSources(sample.config,
    { root: sample.root, cli: sample.cli, managementToken: 'fake-management-token-only' }), /BACKEND_DEPENDENCY_CLOSURE_MISSING/u);
});

test('a second flat shared tree cannot be mixed into the isolated Docker-decoded bundle', async t => {
  const sample = await fixture(t, 'shadow-shared');
  await assert.rejects(downloadAndVerifyAuthenticatedEdgeSources(sample.config,
    { root: sample.root, cli: sample.cli, managementToken: 'fake-management-token-only' }), /BACKEND_DEPENDENCY_CLOSURE_MISSING/u);
});

test('runner cancellation after activation stops before finalization and follows cleanup', async () => {
  const environment=hostedEnvironment();const calls=[];const signalSource=new EventEmitter();
  const adapter={
    preflight:async()=>({syntheticTarget:true,production:false,releaseSha:environment.RELEASE_SHA,
      deploymentId:environment.NETLIFY_DEPLOY_ID,migrationVersion:environment.AUTHENTICATED_ACCEPTANCE_MIGRATION_VERSION,
      backendDigest:environment.AUTHENTICATED_ACCEPTANCE_BACKEND_DIGEST,providersEnabled:false,runtimeReady:true,
      secretBackendKind:'supabase_vault',secretBackendWritable:true,
      publicTargetDigest:environment.AUTHENTICATED_ACCEPTANCE_TARGET_PUBLIC_DIGEST,
      baselineDigest:environment.AUTHENTICATED_ACCEPTANCE_BASELINE_DIGEST,customerRows:0,unapprovedActiveResidue:0,scopeReady:true}),
    activate:async()=>calls.push('activate'),quiesce:async()=>calls.push('quiesce'),cleanup:async()=>calls.push('cleanup'),
    verifyCleanup:async()=>({activeSessions:0,activeIdentities:0,activeMemberships:0,armedPermits:0,
      activeSecretMaterial:0,unapprovedActiveResidue:0,nonExerciseChanged:false,immutableHistoryPreserved:true}),
  };
  await assert.rejects(runAuthenticatedHostedAcceptance(environment,{database:{},signalSource,verifyCheckout:async()=>{},
    createPostgresAdapter:()=>adapter,createIdentityAdapter:()=>({revokeAll:async()=>calls.push('revoke')}),
    startServer:async()=>({baseUrl:'http://127.0.0.1:1',controlToken:'token',close:async()=>calls.push('close')}),
    runPlaywright:async()=>signalSource.emit('SIGINT')}),/AUTHENTICATED_HOSTED_RUNNER_SIGNAL_SIGINT/u);
  assert.deepEqual(calls,['activate','quiesce','revoke','cleanup','close']);
  assert.equal(signalSource.listenerCount('SIGINT'),0);assert.equal(signalSource.listenerCount('SIGTERM'),0);
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
