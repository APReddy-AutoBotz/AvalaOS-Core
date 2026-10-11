import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

import pg from 'pg';

import { canonicalDigest, canonicalFileDigest } from './assessV1OracleEvidence.mjs';
import {
  AUTHENTICATED_HOSTED_OUTPUT_PATHS,
  AuthenticatedHostedController,
  startAuthenticatedHostedControllerServer,
  validateAuthenticatedHostedControllerEnvironment,
} from './authenticatedHostedController.mjs';
import {
  createAuthenticatedHostedIdentityAdapter,
  createAuthenticatedHostedPostgresAdapter,
} from './authenticatedHostedControllerAdapters.mjs';
import { verifyHostedDeployment } from './verify-hosted-deployment.mjs';
import { createControlledHumanPostgresClientConfig,
  validatePrivilegedPostgresConnectionString } from './prCControlledHumanPostgresTls.mjs';

const execFileAsync = promisify(execFile);
const MIGRATION_PATH = 'supabase/migrations/20261010144356_authenticated_hosted_exercise_authority.sql';
const AUTHENTICATED_EDGE_FUNCTIONS=Object.freeze(['tenant-session','process-command','assess-command','assess-v2-command',
  'studio-artifact-command','studio-artifact-download','studio-delivery-authority-command','legacy-delivery-command',
  'legacy-delivery-query','studio-delivery-outcome-query','enterprise-intelligence-query','synthetic-admin',
  'pilot-operations-query','enterprise-provider-lifecycle','enterprise-provider-lifecycle-authority',
  'enterprise-provider-lifecycle-recovery']);
const sha = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const fail = code => { throw new Error(`AUTHENTICATED_HOSTED_RUNNER_${code}`); };

export function validateAuthenticatedDatabaseTarget(config){
  let target;try{target=new URL(config.databaseUrl);}catch{fail('DATABASE_TARGET_REJECTED');}
  let tls=false;try{tls=validatePrivilegedPostgresConnectionString(config.databaseUrl,{allowLoopback:false});}catch{}
  const direct=target.hostname===`db.${config.projectRef}.supabase.co`
    &&decodeURIComponent(target.username)==='postgres'&&['','5432'].includes(target.port);
  const pooled=/^[a-z0-9]+(?:-[a-z0-9]+)*[.]pooler[.]supabase[.]com$/u.test(target.hostname)
    &&decodeURIComponent(target.username)===`postgres.${config.projectRef}`&&['','5432','6543'].includes(target.port);
  if(!tls||!['postgres:','postgresql:'].includes(target.protocol)||target.password.length===0
    ||target.pathname!=='/postgres'||target.hash!==''||(!direct&&!pooled))fail('DATABASE_TARGET_REJECTED');
  return true;
}

export async function verifyAuthenticatedHostedCheckout(config, { root = process.cwd(), git = execFileAsync } = {}) {
  const [head, status, catalogText, provenanceText, migrationText] = await Promise.all([
    git('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }),
    git('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: root, encoding: 'utf8' }),
    readFile(path.join(root, 'tests/acceptance/catalog/test-catalog.json'), 'utf8'),
    readFile(path.join(root, 'tests/acceptance/source-provenance.json'), 'utf8'),
    readFile(path.join(root, MIGRATION_PATH), 'utf8'),
  ]);
  if (head.stdout.trim() !== config.releaseSha || status.stdout.trim()) fail('CHECKOUT_NOT_EXACT_CLEAN_RELEASE');
  const catalog = JSON.parse(catalogText);
  const provenance = JSON.parse(provenanceText);
  if (canonicalDigest(catalog) !== config.catalogDigest
    || canonicalDigest(provenance.sourceDigests) !== config.sourceDigest) fail('SOURCE_BINDING_MISMATCH');
  for (const [relative, expected] of Object.entries(provenance.sourceDigests ?? {})) {
    if (canonicalFileDigest(path.join(root, relative)) !== expected) fail('SOURCE_FILE_MISMATCH');
  }
  const migrationDigest = sha(migrationText.replace(/\r\n/gu, '\n'));
  if (config.migrationVersion !== path.basename(MIGRATION_PATH).slice(0, 14)
    || migrationDigest !== config.migrationDigest) fail('MIGRATION_BINDING_MISMATCH');
  return { catalogDigest: config.catalogDigest, sourceDigest: config.sourceDigest, migrationDigest };
}

const sourceFiles = async directory => {
  const output = [];
  const visit = async current => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (entry.isFile()) output.push(target);
    }
  };
  await visit(directory);
  return output.toSorted();
};

export async function downloadAndVerifyAuthenticatedEdgeSources(config, { root = process.cwd(), cli = execFileAsync,
  managementToken } = {}) {
  if (typeof managementToken !== 'string' || managementToken.length < 16) fail('BACKEND_INVENTORY_CREDENTIAL_REQUIRED');
  for (const slug of AUTHENTICATED_EDGE_FUNCTIONS) {
    const local = path.join(root, 'supabase', 'functions', slug, 'index.ts');
    if (!(await stat(local).catch(() => null))?.isFile()) fail('BACKEND_LOCAL_FUNCTION_MISSING');
  }
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'authenticated-edge-source-'));
  try {
    const compared = {};
    const localFunctionsRoot=path.join(root,'supabase','functions');
    const localClosure=async slug=>{
      const pending=[path.join(localFunctionsRoot,slug,'index.ts')];const closure=new Map();
      while(pending.length){const file=pending.pop();
        const rootRelative=path.relative(root,file).replaceAll('\\','/');
        if(rootRelative.startsWith('../')||path.isAbsolute(rootRelative))fail('BACKEND_LOCAL_DEPENDENCY_ESCAPE');
        const functionRelative=path.relative(localFunctionsRoot,file).replaceAll('\\','/');
        const relative=functionRelative.startsWith('../')?rootRelative:functionRelative;
        if(closure.has(relative))continue;closure.set(relative,file);const text=await readFile(file,'utf8');
        for(const match of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)["'](\.{1,2}\/[^"']+)["']/gu)){
          const requested=path.resolve(path.dirname(file),match[1]);let dependency;
          for(const candidate of [requested,`${requested}.ts`,`${requested}.tsx`,`${requested}.js`,`${requested}.mjs`,
            `${requested}.json`,path.join(requested,'index.ts'),path.join(requested,'index.tsx'),path.join(requested,'index.js')]){
            if((await stat(candidate).catch(()=>null))?.isFile()){dependency=candidate;break;}
          }
          if(!dependency)continue;
          const dependencyRelative=path.relative(root,dependency);
          if(dependencyRelative.startsWith('..')||path.isAbsolute(dependencyRelative))fail('BACKEND_LOCAL_DEPENDENCY_ESCAPE');
          pending.push(dependency);
        }
      }return closure;
    };
    for (const slug of AUTHENTICATED_EDGE_FUNCTIONS) {
      const child=path.join(temporary,slug);await mkdir(path.join(child,'supabase'),{recursive:true});
      await writeFile(path.join(child,'supabase','config.toml'),`project_id = "${config.projectRef}"\n`,'utf8');
      await cli('supabase',['functions','download',slug,'--project-ref',config.projectRef,'--workdir',child,'--use-docker'], {
        cwd: child, encoding: 'utf8', env: { ...process.env, SUPABASE_ACCESS_TOKEN: managementToken,
          SUPABASE_TELEMETRY_DISABLED: 'true' }, windowsHide: true,
      });
      const downloadedRoot=path.join(child,'supabase','functions');
      const files=await sourceFiles(downloadedRoot).catch(()=>[]);const expected=await localClosure(slug);
      const layoutCandidates=[
        [downloadedRoot,localFunctionsRoot],[downloadedRoot,root],
        [path.join(downloadedRoot,slug),root],[path.join(downloadedRoot,slug),localFunctionsRoot],
        [path.join(downloadedRoot,slug),path.join(localFunctionsRoot,slug)],
      ];
      const mappings=[];
      for(const [remoteBase,localBase] of layoutCandidates){const mapping=[];let valid=true;
        for(const file of files){const relative=path.relative(remoteBase,file).replaceAll('\\','/');
          if(relative===''||relative.startsWith('../')||path.isAbsolute(relative)){valid=false;break;}
          const local=path.resolve(localBase,relative);const rootRelative=path.relative(root,local).replaceAll('\\','/');
          if(rootRelative.startsWith('../')||path.isAbsolute(rootRelative)){valid=false;break;}
          const functionRelative=path.relative(localFunctionsRoot,local).replaceAll('\\','/');
          const normalizedRelative=functionRelative.startsWith('../')?rootRelative:functionRelative;
          if(expected.get(normalizedRelative)!==local||mapping.some(item=>item.normalizedRelative===normalizedRelative)){
            valid=false;break;
          }
          mapping.push({file,local,normalizedRelative});
        }
        if(valid&&mapping.length===expected.size)mappings.push(mapping);
      }
      const unique=new Map(mappings.map(mapping=>[mapping.map(item=>`${item.file}:${item.normalizedRelative}`).sort().join('|'),mapping]));
      if(unique.size===0)fail('BACKEND_DEPENDENCY_CLOSURE_MISSING');
      if(unique.size!==1)fail('BACKEND_SOURCE_LAYOUT_AMBIGUOUS');
      for(const {file,local,normalizedRelative} of unique.values().next().value){
        const [remoteText,localText]=await Promise.all([readFile(file),readFile(local)]);
        const normalize=input=>input.toString('utf8').replace(/\r\n/gu,'\n');
        if(normalize(remoteText)!==normalize(localText))fail('BACKEND_SOURCE_FILE_MISMATCH');
        compared[`${slug}:${normalizedRelative}`]=sha(normalize(localText));
      }
    }
    if (canonicalDigest(compared) !== config.backendDigest) fail('BACKEND_SOURCE_DIGEST_MISMATCH');
    return { backendDigest: config.backendDigest, files: Object.keys(compared).length };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function verifyAuthenticatedHostedDeployment(config, { fetchImpl = fetch, managementToken,
  verifyDownloadedSources = downloadAndVerifyAuthenticatedEdgeSources } = {}) {
  const identity = await verifyHostedDeployment({ hostedUrl: config.origin, expectedHead: config.releaseSha,
    expectedDeployId: config.deploymentId, fetchImpl });
  const response = await fetchImpl(config.origin, { redirect: 'error', headers: { Accept: 'text/html',
    'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok || response.headers.get('x-avalaos-release') !== config.releaseSha
    || response.headers.get('x-avalaos-environment') !== 'hosted_nonproduction_pilot'
    || response.headers.get('x-avalaos-netlify-deploy-id') !== config.deploymentId) fail('DEPLOYMENT_MARKER_MISMATCH');
  await response.body?.cancel();
  if(typeof managementToken!=='string'||managementToken.length<16)fail('BACKEND_INVENTORY_CREDENTIAL_REQUIRED');
  const inventoryResponse=await fetchImpl(`https://api.supabase.com/v1/projects/${config.projectRef}/functions`,{
    redirect:'error',signal:AbortSignal.timeout(15_000),headers:{authorization:`Bearer ${managementToken}`,'user-agent':'avalaos-authenticated-acceptance'} });
  const inventory=await inventoryResponse.json().catch(()=>null);const rows=Array.isArray(inventory)?inventory:inventory?.functions;
  if(!inventoryResponse.ok||!Array.isArray(rows))fail('BACKEND_INVENTORY_REJECTED');
  for(const slug of AUTHENTICATED_EDGE_FUNCTIONS){
    const deployed=rows.find(item=>(item?.slug??item?.name)===slug&&(!item?.status||item.status==='ACTIVE'));
    if(!deployed)fail('BACKEND_FUNCTION_MISSING');
  }
  await verifyDownloadedSources(config,{managementToken});
  return { syntheticTarget: true, production: false, releaseSha: identity.release,
    deploymentId: identity.deployId, backendDigest: config.backendDigest, publicTargetDigest: config.targetPublicDigest };
}

const normalizedRemoteDigest=value=>typeof value==='string'&&/^(?:sha256:)?[0-9a-f]{64}$/u.test(value)
  ?(value.startsWith('sha256:')?value:`sha256:${value}`):null;

export async function verifyAuthenticatedSecretBackend(environment, { fetchImpl = fetch, projectRef, organizationId } = {}) {
  let address;
  try { address = new URL(environment.AVALA_VAULT_ADDR); } catch { fail('SECRET_BACKEND_REQUIRED'); }
  if (address.protocol !== 'https:' || address.origin !== environment.AVALA_VAULT_ADDR
    || address.username || address.password) fail('SECRET_BACKEND_REJECTED');
  const token = environment.AVALA_VAULT_TOKEN;
  const secretPath = environment.AUTHENTICATED_ACCEPTANCE_VAULT_SECRET_PATH;
  const managementToken=environment.AUTHENTICATED_ACCEPTANCE_SUPABASE_MANAGEMENT_TOKEN;
  if (typeof token !== 'string' || token.length < 16
    || !/^[-a-zA-Z0-9_/]{8,240}$/u.test(secretPath ?? '') || secretPath.includes('..')
    || !/^[a-z0-9]{20}$/u.test(projectRef??'') || typeof managementToken!=='string'||managementToken.length<16) {
    fail('SECRET_BACKEND_REQUIRED');
  }
  const metadataResponse=await fetchImpl(`https://api.supabase.com/v1/projects/${projectRef}/secrets`,{
    redirect:'error',signal:AbortSignal.timeout(15_000),headers:{authorization:`Bearer ${managementToken}`,'user-agent':'avalaos-authenticated-acceptance'} });
  const metadata=await metadataResponse.json().catch(()=>null);
  const metadataRows=Array.isArray(metadata)?metadata:Array.isArray(metadata?.secrets)?metadata.secrets:[];
  const expectedRemote=new Map([
    ['AVALA_VAULT_ADDR',sha(address.origin)],['AVALA_VAULT_TOKEN',sha(token)],
    ['AVALA_VAULT_PROVIDER_SECRET_PATH',sha(secretPath)],
  ]);
  if(!metadataResponse.ok||[...expectedRemote].some(([name,digest])=>{
    const row=metadataRows.find(item=>item?.name===name);return !row||![row.value,row.digest,row.value_digest,row.sha256]
      .map(normalizedRemoteDigest).includes(digest);
  })) fail('REMOTE_SECRET_CONFIGURATION_REJECTED');
  const tenant=String(organizationId??'').replaceAll('-','').toUpperCase();
  if(!/^[0-9A-F]{32}$/u.test(tenant))fail('SECRET_BACKEND_REQUIRED');
  const capabilityPath=`${secretPath}/${tenant}/*`;
  const response = await fetchImpl(`${address.origin}/v1/sys/capabilities-self`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
    headers: { 'content-type': 'application/json', 'x-vault-token': token },
    body: JSON.stringify({ paths: [capabilityPath] }),
  });
  const body = await response.json().catch(() => ({}));
  const capabilities = body?.capabilities?.[capabilityPath] ?? body?.capabilities ?? [];
  const effective = new Set(capabilities);
  const permitted = effective.has('root')
    || (effective.has('create') && effective.has('update') && effective.has('delete') && effective.has('read'));
  if (!response.ok || !Array.isArray(capabilities) || !permitted || effective.has('deny')) fail('SECRET_BACKEND_CAPABILITY_REJECTED');
  return { kind: 'hashicorp_vault', writable: true };
}

export async function cleanupAuthenticatedVaultSecret(environment,input,{fetchImpl=fetch}={}){
  const address=new URL(environment.AVALA_VAULT_ADDR);const base=environment.AUTHENTICATED_ACCEPTANCE_VAULT_SECRET_PATH;
  const tenant=input.organizationId.replaceAll('-','').toUpperCase();
  if(address.protocol!=='https:'||!/^[-a-zA-Z0-9_/]{8,240}$/u.test(base??'')
    ||!/^AVALA_PROVIDER_SECRET_[A-Z0-9_]+$/u.test(input.secretRef)||!/^[0-9A-F]{32}$/u.test(tenant))fail('SECRET_CLEANUP_INPUT_REJECTED');
  const parts=[base,tenant,input.secretRef].flatMap(part=>part.split('/')).map(encodeURIComponent).join('/');
  const response=await fetchImpl(new URL(`/v1/${parts}`,address.origin),{method:'DELETE',redirect:'error',signal:AbortSignal.timeout(15_000),
    headers:{'x-vault-token':environment.AVALA_VAULT_TOKEN,'content-type':'application/json'}});
  if(!response.ok&&response.status!==404)fail('SECRET_CLEANUP_REJECTED');
  const verify=await fetchImpl(new URL(`/v1/${parts}`,address.origin),{method:'GET',redirect:'error',signal:AbortSignal.timeout(15_000),
    headers:{'x-vault-token':environment.AVALA_VAULT_TOKEN,'content-type':'application/json'}});
  if(verify.status!==404)fail('SECRET_CLEANUP_RESIDUE');
  await verify.body?.cancel();
}

const run = (command, args, options, timeoutMs = 30 * 60_000, cancellationSignal) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { ...options, stdio: ['ignore','pipe','pipe'], windowsHide: true });
  child.stdout?.resume(); child.stderr?.resume();
  let termination=null;let forceTimer;
  const terminate=reason=>{if(termination)return;termination=reason;child.kill('SIGTERM');
    forceTimer=setTimeout(()=>child.kill('SIGKILL'),10_000);forceTimer.unref?.();};
  const onCancel=()=>terminate(String(cancellationSignal.reason??'CANCELLED'));
  if(cancellationSignal?.aborted)onCancel();else cancellationSignal?.addEventListener('abort',onCancel,{once:true});
  const timer=setTimeout(()=>terminate('CHILD_TIMEOUT'),timeoutMs);
  timer.unref?.();
  const done=()=>{clearTimeout(timer);clearTimeout(forceTimer);cancellationSignal?.removeEventListener('abort',onCancel);};
  child.once('error', error => { done(); reject(error); });
  child.once('exit', (code, signal) => { done(); if(termination)reject(new Error(`AUTHENTICATED_HOSTED_RUNNER_${termination}`));
    else if(code===0)resolve();else reject(new Error(`AUTHENTICATED_HOSTED_RUNNER_CHILD_FAILED:${code ?? signal}`)); });
});

const atomicJson = async (destination, document) => {
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, destination);
};

export async function runAuthenticatedHostedAcceptance(environment = process.env, dependencies = {}) {
  const config = validateAuthenticatedHostedControllerEnvironment(environment);
  validateAuthenticatedDatabaseTarget(config);
  await (dependencies.verifyCheckout ?? verifyAuthenticatedHostedCheckout)(config);
  const database = dependencies.database ?? new pg.Client(createControlledHumanPostgresClientConfig(config.databaseUrl,{
    allowLoopback:false,applicationName:'authenticated_hosted_acceptance',connectionTimeoutMillis:20_000}));
  const ownsDatabase = !dependencies.database;
  if (ownsDatabase) await database.connect();
  const adapter = (dependencies.createPostgresAdapter ?? createAuthenticatedHostedPostgresAdapter)({
    config, db: database,
    verifyDeployment: () => (dependencies.verifyDeployment ?? verifyAuthenticatedHostedDeployment)(config,
      {managementToken:environment.AUTHENTICATED_ACCEPTANCE_SUPABASE_MANAGEMENT_TOKEN}),
    verifySecretBackend: () => (dependencies.verifySecretBackend ?? verifyAuthenticatedSecretBackend)(environment,
      {projectRef:config.projectRef,organizationId:config.scope.organizationId}),
    cleanupSecretBackend:input=>(dependencies.cleanupSecretBackend??cleanupAuthenticatedVaultSecret)(environment,input),
  });
  const identity = (dependencies.createIdentityAdapter ?? createAuthenticatedHostedIdentityAdapter)({ config, db: database });
  const controller = new AuthenticatedHostedController({ config, adapter, identity });
  const cancellation=new AbortController();const signalSource=dependencies.signalSource??process;
  const cancelSigterm=()=>cancellation.abort('SIGNAL_SIGTERM');const cancelSigint=()=>cancellation.abort('SIGNAL_SIGINT');
  const throwIfCancelled=()=>{if(cancellation.signal.aborted)fail(String(cancellation.signal.reason??'CANCELLED'));};
  signalSource.on('SIGTERM',cancelSigterm);signalSource.on('SIGINT',cancelSigint);
  let server;
  let finalized = false;
  let primaryError = null;
  try {
    await controller.preflightAndActivate();
    throwIfCancelled();
    server = await (dependencies.startServer ?? startAuthenticatedHostedControllerServer)(controller);
    throwIfCancelled();
    const playwrightArgs=[path.resolve('node_modules/@playwright/test/cli.js'), 'test',
      '--config=playwright.authenticated-hosted.config.ts', '--workers=1'];
    const playwrightOptions={
        cwd: process.cwd(), env: { ...environment, ENTERPRISE_LIFECYCLE_APP_BASE_URL: config.origin,
          ENTERPRISE_LIFECYCLE_API_BASE_URL: config.supabaseUrl,
          ENTERPRISE_LIFECYCLE_CONTROL_URL: server.baseUrl,
          ENTERPRISE_LIFECYCLE_CONTROL_TOKEN: server.controlToken,
          ENTERPRISE_LIFECYCLE_AUTHENTICATED: 'true', ENTERPRISE_LIFECYCLE_HOSTED_REAL_AUTH: 'true' },
      };
    if(dependencies.runPlaywright)await dependencies.runPlaywright(process.execPath,playwrightArgs,playwrightOptions);
    else await run(process.execPath,playwrightArgs,playwrightOptions,30*60_000,cancellation.signal);
    throwIfCancelled();
    const output = await controller.finalize();
    throwIfCancelled();
    await Promise.all([
      atomicJson(AUTHENTICATED_HOSTED_OUTPUT_PATHS.binding, output.profile),
      atomicJson(AUTHENTICATED_HOSTED_OUTPUT_PATHS.browser, output.browser),
      atomicJson(AUTHENTICATED_HOSTED_OUTPUT_PATHS.server, output.server),
    ]);
    finalized = true;
    return { outputPaths: AUTHENTICATED_HOSTED_OUTPUT_PATHS };
  } catch (error) {
    primaryError = error;
  } finally {
    const cleanupErrors=[];
    if (!finalized) try { await controller.abortAndQuiesce(); } catch (error) { cleanupErrors.push(error); }
    try { await server?.close(); } catch (error) { cleanupErrors.push(error); }
    if (ownsDatabase) try { await database.end(); } catch (error) { cleanupErrors.push(error); }
    signalSource.removeListener('SIGTERM',cancelSigterm);signalSource.removeListener('SIGINT',cancelSigint);
    if (cleanupErrors.length) throw new AggregateError([...(primaryError?[primaryError]:[]),...cleanupErrors],
      'AUTHENTICATED_HOSTED_RUNNER_CLEANUP_INCOMPLETE');
  }
  throw primaryError;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runAuthenticatedHostedAcceptance().then(() => {
    console.log(JSON.stringify({ status: 'completed', outputs: AUTHENTICATED_HOSTED_OUTPUT_PATHS }));
  }).catch(error => {
    const code=String(error?.message??'').match(/AUTHENTICATED_HOSTED_(?:RUNNER|CONTROLLER|OBSERVATION)_[A-Z0-9_]+/u)?.[0]
      ??'AUTHENTICATED_HOSTED_RUNNER_FAILED';
    console.error(code);
    process.exitCode = 1;
  });
}
