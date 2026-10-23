import { createHash, randomUUID } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { lstat, mkdtemp, open, readFile, readdir, realpath, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

import pg from 'pg';
import ts from 'typescript';

import { canonicalDigest, canonicalFileDigest } from './assessV1OracleEvidence.mjs';
import {
  AUTHENTICATED_HOSTED_OPERATION_TIMEOUT_MS,
  AUTHENTICATED_HOSTED_OUTPUT_PATHS,
  AuthenticatedHostedController,
  startAuthenticatedHostedControllerServer,
  validateAuthenticatedHostedControllerEnvironment,
} from './authenticatedHostedController.mjs';
import {
  AUTHENTICATED_HOSTED_SESSION_QUERY,
  createAuthenticatedHostedIdentityAdapter,
  createAuthenticatedHostedPostgresAdapter,
} from './authenticatedHostedControllerAdapters.mjs';
import { AUTHENTICATED_HOSTED_CAPTURE_QUERY } from './authenticatedHostedObservationAdapter.mjs';
import { authenticatedHostedFailureCode, createAuthenticatedHostedRunDiagnostic,
  validateAuthenticatedHostedPlaywrightDiagnostic, withAuthenticatedHostedDiagnostic } from './authenticatedHostedDiagnostics.mjs';
import { verifyAuthenticatedHostedCheckoutState } from './authenticatedHostedCheckout.mjs';
import { verifyHostedDeployment } from './verify-hosted-deployment.mjs';
import { authenticatedAcceptanceMode } from './authenticatedV2ReloadDiagnostic.mjs';
import { createObservationTimings } from './authenticatedObservationTimings.mjs';
import { createAuthenticatedObservationReadPool } from './authenticatedObservationReadPool.mjs';
import { createControlledHumanPostgresClientConfig,
  validatePrivilegedPostgresConnectionString } from './prCControlledHumanPostgresTls.mjs';
import { LOCAL_AUTHENTICATED_EXECUTION_KIND, verifyLocalAcceptanceServer } from './localAcceptanceBuild.mjs';

const execFileAsync = promisify(execFile);
const AUTHENTICATED_MIGRATION_VERSION = '20261019161723';
const AUTHENTICATED_EDGE_FUNCTIONS=Object.freeze(['tenant-session','process-command','assess-command','assess-v2-command',
  'studio-artifact-command','studio-artifact-download','studio-delivery-authority-command','legacy-delivery-command',
  'legacy-delivery-query','studio-delivery-outcome-query','enterprise-intelligence-query','synthetic-admin',
  'pilot-operations-query','enterprise-provider-lifecycle','enterprise-provider-lifecycle-authority',
  'enterprise-provider-lifecycle-recovery']);
const MAX_EDGE_SOURCE_RESPONSE_BYTES=32*1024*1024;
const MAX_EDGE_SOURCE_FILES=2048;
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
  await verifyAuthenticatedHostedCheckoutState(config.releaseSha, { root, git });
  const expectedMigrationVersion = AUTHENTICATED_MIGRATION_VERSION;
  if (config.migrationVersion !== expectedMigrationVersion) fail('MIGRATION_BINDING_MISMATCH');
  const migrationNames = (await readdir(path.join(root, 'supabase', 'migrations')))
    .filter(name => name.startsWith(`${expectedMigrationVersion}_`) && name.endsWith('.sql'));
  if (migrationNames.length !== 1) fail('MIGRATION_BINDING_MISMATCH');
  const migrationPath = path.join('supabase', 'migrations', migrationNames[0]);
  const [catalogText, provenanceText, migrationText] = await Promise.all([
    readFile(path.join(root, 'tests/acceptance/catalog/test-catalog.json'), 'utf8'),
    readFile(path.join(root, 'tests/acceptance/source-provenance.json'), 'utf8'),
    readFile(path.join(root, migrationPath), 'utf8'),
  ]);
  const catalog = JSON.parse(catalogText);
  const provenance = JSON.parse(provenanceText);
  if (canonicalDigest(catalog) !== config.catalogDigest
    || canonicalDigest(provenance.sourceDigests) !== config.sourceDigest) fail('SOURCE_BINDING_MISMATCH');
  for (const [relative, expected] of Object.entries(provenance.sourceDigests ?? {})) {
    if (canonicalFileDigest(path.join(root, relative)) !== expected) fail('SOURCE_FILE_MISMATCH');
  }
  const migrationDigest = sha(migrationText.replace(/\r\n/gu, '\n'));
  if (migrationDigest !== config.migrationDigest) fail('MIGRATION_BINDING_MISMATCH');
  return { catalogDigest: config.catalogDigest, sourceDigest: config.sourceDigest, migrationDigest };
}

const statIfPresent = async file => {
  try {
    return await stat(file);
  } catch (error) {
    if (['ENOENT','ENOTDIR'].includes(error?.code)) return null;
    throw error;
  }
};

const localModuleSpecifier = value => value.startsWith('./') || value.startsWith('../');
const sourceScriptKind = file => {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.js') || file.endsWith('.mjs')) return ts.ScriptKind.JS;
  if (file.endsWith('.json')) return ts.ScriptKind.JSON;
  return ts.ScriptKind.TS;
};

const runtimeModuleSpecifiers = (file, text) => {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, sourceScriptKind(file));
  if (source.parseDiagnostics.length !== 0) fail('BACKEND_LOCAL_SOURCE_PARSE_REJECTED');
  const specifiers = [];
  const add = node => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) specifiers.push(node.text);
    else fail('BACKEND_LOCAL_DYNAMIC_IMPORT_REJECTED');
  };
  const visit = node => {
    if (ts.isImportDeclaration(node)) {
      if (!node.importClause?.isTypeOnly) add(node.moduleSpecifier);
    } else if (ts.isExportDeclaration(node)) {
      if (!node.isTypeOnly && node.moduleSpecifier) add(node.moduleSpecifier);
    } else if (ts.isImportEqualsDeclaration(node)) {
      if (!node.isTypeOnly && ts.isExternalModuleReference(node.moduleReference)
        && node.moduleReference.expression) add(node.moduleReference.expression);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      if (node.arguments.length === 0) fail('BACKEND_LOCAL_DYNAMIC_IMPORT_REJECTED');
      add(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return specifiers;
};

export async function collectAuthenticatedEdgeRuntimeClosure(root, slug) {
  const localFunctionsRoot = path.join(root, 'supabase', 'functions');
  const canonicalRoot = await realpath(root);
  const entry = path.join(localFunctionsRoot, slug, 'index.ts');
  const pending = [entry];
  const closure = new Map();
  while (pending.length) {
    const file = pending.pop();
    const rootRelative = path.relative(root, file).replaceAll('\\', '/');
    if (rootRelative.startsWith('../') || path.isAbsolute(rootRelative)) fail('BACKEND_LOCAL_DEPENDENCY_ESCAPE');
    const functionRelative = path.relative(localFunctionsRoot, file).replaceAll('\\', '/');
    const relative = functionRelative.startsWith('../') ? rootRelative : functionRelative;
    if (closure.has(relative)) continue;
    if (!(await statIfPresent(file))?.isFile()) fail('BACKEND_LOCAL_DEPENDENCY_UNRESOLVED');
    const canonicalFile = await realpath(file);
    const canonicalRelative = path.relative(canonicalRoot, canonicalFile).replaceAll('\\', '/');
    if (canonicalRelative.startsWith('../') || path.isAbsolute(canonicalRelative)) {
      fail('BACKEND_LOCAL_DEPENDENCY_ESCAPE');
    }
    closure.set(relative, file);
    const text = await readFile(file, 'utf8');
    for (const specifier of runtimeModuleSpecifiers(file, text)) {
      if (!localModuleSpecifier(specifier)) continue;
      const requested = path.resolve(path.dirname(file), specifier);
      const requestedRelative = path.relative(root, requested).replaceAll('\\', '/');
      if (requestedRelative.startsWith('../') || path.isAbsolute(requestedRelative)) {
        fail('BACKEND_LOCAL_DEPENDENCY_ESCAPE');
      }
      let dependency;
      for (const candidate of [requested, `${requested}.ts`, `${requested}.tsx`, `${requested}.js`, `${requested}.mjs`,
        `${requested}.json`, path.join(requested, 'index.ts'), path.join(requested, 'index.tsx'),
        path.join(requested, 'index.js')]) {
        if ((await statIfPresent(candidate))?.isFile()) { dependency = candidate; break; }
      }
      if (!dependency) fail('BACKEND_LOCAL_DEPENDENCY_UNRESOLVED');
      const dependencyRelative = path.relative(root, dependency).replaceAll('\\', '/');
      if (dependencyRelative.startsWith('../') || path.isAbsolute(dependencyRelative)) {
        fail('BACKEND_LOCAL_DEPENDENCY_ESCAPE');
      }
      pending.push(dependency);
    }
  }
  return closure;
}

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const deploymentFor=(deployments,slug)=>deployments instanceof Map?deployments.get(slug):deployments?.[slug];
const validDeployment=deployment=>deployment&&uuid.test(deployment.id??'')&&Number.isSafeInteger(deployment.version)
  &&deployment.version>0&&deployment.status==='ACTIVE';

const normalizeCrlfBytes=input=>{
  const source=Buffer.from(input);const normalized=Buffer.allocUnsafe(source.length);let read=0;let written=0;
  while(read<source.length){if(source[read]===13&&source[read+1]===10){normalized[written++]=10;read+=2;}
    else normalized[written++]=source[read++];}
  return normalized.subarray(0,written);
};

const boundedMultipartBody=async response=>{
  const reject=async code=>{await response?.body?.cancel?.().catch(()=>undefined);fail(code);};
  if(response?.redirected===true)await reject('BACKEND_SOURCE_REDIRECT_REJECTED');
  if(response?.status!==200)await reject('BACKEND_SOURCE_STATUS_REJECTED');
  const contentType=String(response.headers?.get?.('content-type')??'').trim();
  const match=contentType.match(/^multipart\/form-data\s*;\s*boundary=(?:"([0-9A-Za-z'()+_,.\/:=?-]{1,70})"|([0-9A-Za-z'()+_,.\/:=?-]{1,70}))$/u);
  if(!match)await reject('BACKEND_SOURCE_CONTENT_TYPE_REJECTED');
  const declared=String(response.headers?.get?.('content-length')??'');
  if(declared!==''&&(!/^\d+$/u.test(declared)||Number(declared)<1||Number(declared)>MAX_EDGE_SOURCE_RESPONSE_BYTES)){
    await reject('BACKEND_SOURCE_SIZE_REJECTED');
  }
  if(!response.body?.getReader)await reject('BACKEND_SOURCE_BODY_REJECTED');
  const chunks=[];let received=0;const reader=response.body.getReader();
  try{for(;;){const {done,value}=await reader.read();if(done)break;const chunk=Buffer.from(value);received+=chunk.length;
      if(received>MAX_EDGE_SOURCE_RESPONSE_BYTES)fail('BACKEND_SOURCE_SIZE_REJECTED');chunks.push(chunk);}
    if(received===0)fail('BACKEND_SOURCE_BODY_REJECTED');
  }catch(error){await reader.cancel().catch(()=>undefined);throw error;}finally{reader.releaseLock();}
  const bounded=new Response(Buffer.concat(chunks,received),{headers:{'content-type':contentType}});
  try{return await bounded.formData();}catch{fail('BACKEND_SOURCE_MULTIPART_REJECTED');}
};

const canonicalRemoteSourcePath=value=>typeof value==='string'&&(value.startsWith('source/')||value.startsWith('functions/'))
  &&!value.includes('\\')&&!/[\u0000-\u001f\u007f]/u.test(value)&&!path.posix.isAbsolute(value)
  &&path.posix.normalize(value)===value&&value.split('/').every(segment=>segment!==''&&segment!=='.'&&segment!=='..');

export async function verifyAuthenticatedEdgeSourceResponse(response,{root=process.cwd(),slug,projectRef,deployment,
  expected}={}){
  if(!AUTHENTICATED_EDGE_FUNCTIONS.includes(slug)||!/^[a-z0-9]{20}$/u.test(projectRef??'')||!validDeployment(deployment)){
    fail('BACKEND_SOURCE_INPUT_REJECTED');
  }
  const closure=expected??await collectAuthenticatedEdgeRuntimeClosure(root,slug);
  if(!(closure instanceof Map)||closure.size<1||closure.size>MAX_EDGE_SOURCE_FILES)fail('BACKEND_SOURCE_INPUT_REJECTED');
  const form=await boundedMultipartBody(response);
  let metadataText=null;const files=new Map();
  for(const [field,value] of form.entries()){
    if(typeof value==='string'){
      if(field!=='metadata'||metadataText!==null||Buffer.byteLength(value,'utf8')>64*1024){
        fail('BACKEND_SOURCE_MULTIPART_REJECTED');
      }
      metadataText=value;continue;
    }
    if(field!=='file'||!(value instanceof Blob)||!canonicalRemoteSourcePath(value.name)||files.has(value.name)){
      fail('BACKEND_SOURCE_MULTIPART_REJECTED');
    }
    files.set(value.name,value);
  }
  if(metadataText===null)fail('BACKEND_SOURCE_METADATA_REJECTED');
  let metadata;try{metadata=JSON.parse(metadataText);}catch{fail('BACKEND_SOURCE_METADATA_REJECTED');}
  const metadataKeys=['compressed_size','deno2_entrypoint_path','deployment_id','module_count','original_size'];
  const repositoryEntrypoint=`source/supabase/functions/${slug}/index.ts`;
  const functionsEntrypoint=`functions/${slug}/index.ts`;
  if(!metadata||Array.isArray(metadata)||Object.keys(metadata).toSorted().join('|')!==metadataKeys.join('|')
    ||metadata.deployment_id!==`${projectRef}_${deployment.id}_${deployment.version}`
    ||![repositoryEntrypoint,functionsEntrypoint].includes(metadata.deno2_entrypoint_path)
    ||metadata.module_count!==closure.size
    ||!['original_size','compressed_size'].every(key=>Number.isSafeInteger(metadata[key])&&metadata[key]>=0
      &&metadata[key]<=MAX_EDGE_SOURCE_RESPONSE_BYTES))fail('BACKEND_SOURCE_METADATA_REJECTED');
  const functionsLayout=metadata.deno2_entrypoint_path===functionsEntrypoint;
  const localFunctionsRoot=path.join(root,'supabase','functions');
  const canonicalFunctionsRoot=functionsLayout?await realpath(localFunctionsRoot):null;
  const expectedFiles=new Map();
  for(const [normalizedRelative,local] of closure){
    const relative=path.relative(root,local).replaceAll('\\','/');
    if(relative===''||relative.startsWith('../')||path.isAbsolute(relative))fail('BACKEND_LOCAL_DEPENDENCY_ESCAPE');
    const functionsRelative=path.relative(localFunctionsRoot,local).replaceAll('\\','/');
    if(functionsLayout){
      const canonicalFunctionsRelative=path.relative(canonicalFunctionsRoot,await realpath(local)).replaceAll('\\','/');
      if(functionsRelative===''||functionsRelative.startsWith('../')||path.isAbsolute(functionsRelative)
        ||canonicalFunctionsRelative===''||canonicalFunctionsRelative.startsWith('../')
        ||path.isAbsolute(canonicalFunctionsRelative))fail('BACKEND_SOURCE_METADATA_REJECTED');
    }
    const remote=functionsLayout?`functions/${functionsRelative}`:`source/${relative}`;
    if(!canonicalRemoteSourcePath(remote))fail('BACKEND_LOCAL_DEPENDENCY_ESCAPE');
    expectedFiles.set(remote,{normalizedRelative,local});
  }
  if(files.size>expectedFiles.size)fail('BACKEND_DEPENDENCY_CLOSURE_EXTRA');
  if(files.size<expectedFiles.size)fail('BACKEND_DEPENDENCY_CLOSURE_MISSING');
  if([...files.keys()].some(remote=>!expectedFiles.has(remote)))fail('BACKEND_DEPENDENCY_CLOSURE_EXTRA');
  const compared={};
  for(const [remote,{normalizedRelative,local}] of expectedFiles){
    const file=files.get(remote);if(!file)fail('BACKEND_DEPENDENCY_CLOSURE_MISSING');
    const [remoteBytes,localBytes]=await Promise.all([file.arrayBuffer().then(Buffer.from),readFile(local)]);
    const normalizedRemote=normalizeCrlfBytes(remoteBytes);const normalizedLocal=normalizeCrlfBytes(localBytes);
    if(!normalizedRemote.equals(normalizedLocal))fail('BACKEND_SOURCE_FILE_MISMATCH');
    compared[`${slug}:${normalizedRelative}`]=sha(normalizedLocal);
  }
  return compared;
}

export async function downloadAndVerifyAuthenticatedEdgeSources(config,{root=process.cwd(),managementToken,
  fetchImpl=fetch,deployments,signal}={}){
  if(typeof managementToken!=='string'||managementToken.length<16||!/^[a-z0-9]{20}$/u.test(config?.projectRef??'')){
    fail('BACKEND_INVENTORY_CREDENTIAL_REQUIRED');
  }
  const compared={};
  for(const slug of AUTHENTICATED_EDGE_FUNCTIONS){
    const deployment=deploymentFor(deployments,slug);if(!validDeployment(deployment))fail('BACKEND_DEPLOYMENT_BINDING_REJECTED');
    const expected=await withAuthenticatedHostedDiagnostic('SOURCE_PREPARE',()=>collectAuthenticatedEdgeRuntimeClosure(root,slug));
    const timeout=AbortSignal.timeout(30_000);const requestSignal=signal?AbortSignal.any([signal,timeout]):timeout;
    const response=await withAuthenticatedHostedDiagnostic('SOURCE_DOWNLOAD',()=>fetchImpl(
      `https://api.supabase.com/v1/projects/${config.projectRef}/functions/${slug}/body`,{method:'GET',redirect:'error',
        signal:requestSignal,headers:{authorization:`Bearer ${managementToken}`,accept:'multipart/form-data',
          'user-agent':'avalaos-authenticated-acceptance'}}));
    Object.assign(compared,await withAuthenticatedHostedDiagnostic('SOURCE_COMPARE',()=>
      verifyAuthenticatedEdgeSourceResponse(response,{root,slug,projectRef:config.projectRef,deployment,expected})));
  }
  if(canonicalDigest(compared)!==config.backendDigest)fail('BACKEND_SOURCE_DIGEST_MISMATCH');
  return {backendDigest:config.backendDigest,files:Object.keys(compared).length};
}

const authenticatedDeployments=rows=>{
  if(!Array.isArray(rows)||rows.length>512)fail('BACKEND_INVENTORY_REJECTED');
  const deployments=new Map();
  for(const slug of AUTHENTICATED_EDGE_FUNCTIONS){
    const matches=rows.filter(item=>(item?.slug??item?.name)===slug);
    if(matches.length!==1)fail(matches.length===0?'BACKEND_FUNCTION_MISSING':'BACKEND_INVENTORY_REJECTED');
    const item=matches[0];const deployment={id:item.id,version:item.version,status:item.status};
    if(!validDeployment(deployment))fail('BACKEND_INVENTORY_REJECTED');deployments.set(slug,deployment);
  }
  return deployments;
};

export async function verifyAuthenticatedHostedDeployment(config, { fetchImpl = fetch, managementToken,
  verifyDownloadedSources = downloadAndVerifyAuthenticatedEdgeSources,
  verifyLocalFrontend = verifyLocalAcceptanceServer } = {}) {
  if(!/^[a-z0-9]{20}$/u.test(config?.projectRef??''))fail('BACKEND_INVENTORY_REJECTED');
  let identity;
  if (config.executionKind === LOCAL_AUTHENTICATED_EXECUTION_KIND) {
    await verifyLocalFrontend({ workspace: config.localBuildWorkspace, releaseSha: config.releaseSha,
      buildDigest: config.buildDigest, fetchImpl });
    identity = { release: config.releaseSha, deployId: null, buildDigest: config.buildDigest };
  } else {
    identity = await verifyHostedDeployment({ hostedUrl: config.origin, expectedHead: config.releaseSha,
      expectedDeployId: config.deploymentId, fetchImpl });
    const response = await fetchImpl(config.origin, { redirect: 'error', headers: { Accept: 'text/html',
      'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok || response.headers.get('x-avalaos-release') !== config.releaseSha
      || response.headers.get('x-avalaos-environment') !== 'hosted_nonproduction_pilot'
      || response.headers.get('x-avalaos-netlify-deploy-id') !== config.deploymentId) fail('DEPLOYMENT_MARKER_MISMATCH');
    await response.body?.cancel();
  }
  if(typeof managementToken!=='string'||managementToken.length<16)fail('BACKEND_INVENTORY_CREDENTIAL_REQUIRED');
  const inventoryResponse=await fetchImpl(`https://api.supabase.com/v1/projects/${config.projectRef}/functions`,{
    redirect:'error',signal:AbortSignal.timeout(15_000),headers:{authorization:`Bearer ${managementToken}`,'user-agent':'avalaos-authenticated-acceptance'} });
  if(inventoryResponse.status!==200||inventoryResponse.redirected===true){
    await inventoryResponse.body?.cancel().catch(()=>undefined);fail('BACKEND_INVENTORY_REJECTED');
  }
  const inventory=await inventoryResponse.json().catch(()=>null);const rows=Array.isArray(inventory)?inventory:inventory?.functions;
  const deployments=authenticatedDeployments(rows);
  await verifyDownloadedSources(config,{managementToken,fetchImpl,deployments});
  const finalInventoryResponse=await fetchImpl(`https://api.supabase.com/v1/projects/${config.projectRef}/functions`,{
    redirect:'error',signal:AbortSignal.timeout(15_000),headers:{authorization:`Bearer ${managementToken}`,
      'user-agent':'avalaos-authenticated-acceptance'} });
  if(finalInventoryResponse.status!==200||finalInventoryResponse.redirected===true){
    await finalInventoryResponse.body?.cancel().catch(()=>undefined);fail('BACKEND_INVENTORY_REJECTED');
  }
  const finalInventory=await finalInventoryResponse.json().catch(()=>null);
  const finalRows=Array.isArray(finalInventory)?finalInventory:finalInventory?.functions;
  const finalDeployments=authenticatedDeployments(finalRows);
  for(const slug of AUTHENTICATED_EDGE_FUNCTIONS){const before=deployments.get(slug);const after=finalDeployments.get(slug);
    if(before.id!==after.id||before.version!==after.version||before.status!==after.status)fail('BACKEND_INVENTORY_DRIFT');}
  return { syntheticTarget: true, production: false, releaseSha: identity.release,
    deploymentId: identity.deployId, executionKind: config.executionKind, buildDigest: config.buildDigest,
    backendDigest: config.backendDigest, publicTargetDigest: config.targetPublicDigest };
}

const normalizedRemoteDigest=value=>typeof value==='string'&&/^(?:sha256:)?[0-9a-f]{64}$/u.test(value)
  ?(value.startsWith('sha256:')?value:`sha256:${value}`):null;

export async function verifyAuthenticatedHashicorpSecretBackend(environment, { fetchImpl = fetch, projectRef, organizationId } = {}) {
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

export async function verifyAuthenticatedSupabaseVaultBackend(environment, { fetchImpl=fetch,projectRef,database }={}){
  const managementToken=environment.AUTHENTICATED_ACCEPTANCE_SUPABASE_MANAGEMENT_TOKEN;
  if(!database||typeof database.query!=='function'||!/^[a-z0-9]{20}$/u.test(projectRef??'')
    ||typeof managementToken!=='string'||managementToken.length<16)fail('SECRET_BACKEND_REQUIRED');
  const metadataResponse=await fetchImpl(`https://api.supabase.com/v1/projects/${projectRef}/secrets`,{
    redirect:'error',signal:AbortSignal.timeout(15_000),headers:{authorization:`Bearer ${managementToken}`,
      'user-agent':'avalaos-authenticated-acceptance'} });
  const metadata=await metadataResponse.json().catch(()=>null);
  const metadataRows=Array.isArray(metadata)?metadata:Array.isArray(metadata?.secrets)?metadata.secrets:[];
  const selector=metadataRows.find(item=>item?.name==='AVALA_PROVIDER_SECRET_BACKEND');
  if(!metadataResponse.ok||![selector?.value,selector?.digest,selector?.value_digest,selector?.sha256]
    .map(normalizedRemoteDigest).includes(sha('supabase_vault')))fail('REMOTE_SECRET_CONFIGURATION_REJECTED');
  const capability=(await database.query('SELECT public.enterprise_provider_secret_backend_capability() value')).rows[0]?.value;
  if(capability?.backendKind!=='supabase_vault'||capability?.available!==true
    ||capability?.migrationTip!==environment.AUTHENTICATED_ACCEPTANCE_MIGRATION_VERSION
    ||capability?.exerciseActive!==false||capability?.providerCallsAuthorized!==false){
    fail('SECRET_BACKEND_CAPABILITY_REJECTED');
  }
  const boundary=(await database.query(`WITH wrappers(signature) AS(VALUES
      ('public.enterprise_provider_secret_backend_capability()'),
      ('public.enterprise_provider_secret_write(uuid,uuid,bigint,uuid,uuid,text,text,text,text)'),
      ('public.enterprise_provider_secret_resolve(uuid,uuid,text,text,text)'),
      ('public.enterprise_provider_secret_resolve_for_receipt(uuid,uuid,bigint,uuid,uuid,text,text,text)'),
      ('public.enterprise_provider_secret_observe(uuid,uuid,uuid,text,text)'),
      ('public.enterprise_provider_secret_inventory(uuid,uuid)'),
      ('public.enterprise_provider_secret_delete_for_receipt(uuid,uuid,bigint,uuid,uuid,text,text,text)'),
      ('public.enterprise_provider_secret_delete_for_cleanup(uuid,uuid,bigint,uuid,uuid,text,text,text)')
    ) SELECT count(*) FILTER(WHERE to_regprocedure(signature) IS NOT NULL)::int wrapper_count,
      bool_and(has_function_privilege('service_role',to_regprocedure(signature),'EXECUTE')) service_execute,
      bool_or(has_function_privilege('anon',to_regprocedure(signature),'EXECUTE')) anon_execute,
      bool_or(has_function_privilege('authenticated',to_regprocedure(signature),'EXECUTE')) authenticated_execute,
      has_schema_privilege('anon','vault','USAGE') anon_vault_usage,
      has_schema_privilege('authenticated','vault','USAGE') authenticated_vault_usage,
      has_table_privilege('anon','vault.secrets','SELECT') anon_secret_read,
      has_table_privilege('authenticated','vault.secrets','SELECT') authenticated_secret_read,
      has_table_privilege('anon','vault.decrypted_secrets','SELECT') anon_decrypted_read,
      has_table_privilege('authenticated','vault.decrypted_secrets','SELECT') authenticated_decrypted_read
    FROM wrappers`)).rows[0];
  if(boundary?.wrapper_count!==8||boundary?.service_execute!==true||boundary?.anon_execute!==false
    ||boundary?.authenticated_execute!==false||boundary?.anon_vault_usage!==false
    ||boundary?.authenticated_vault_usage!==false||boundary?.anon_secret_read!==false
    ||boundary?.authenticated_secret_read!==false||boundary?.anon_decrypted_read!==false
    ||boundary?.authenticated_decrypted_read!==false)fail('SECRET_BACKEND_BOUNDARY_REJECTED');
  const residue=(await database.query(`SELECT
      (SELECT count(*)::int FROM public.enterprise_provider_secret_cleanup_jobs WHERE state<>'completed') unfinished_cleanup,
      (SELECT count(*)::int FROM public.enterprise_ai_command_receipts
        WHERE status='claimed' AND execution_plan->>'secretOwnership'='managed_write') unfinished_managed_writes,
      (SELECT count(*)::int FROM public.enterprise_provider_secret_backend_ownerships
        WHERE backend_kind='supabase_vault' AND state<>'deleted') native_material_residue,
      (SELECT count(*)::int FROM public.enterprise_ai_capability_routes route
        JOIN public.ai_provider_configs config ON config.id=route.provider_config_id AND config.org_id=route.org_id
        JOIN public.ai_provider_key_refs ref ON ref.id=config.key_ref_id AND ref.org_id=config.org_id
        WHERE route.enabled AND route.deleted_at IS NULL
          AND ref.secret_backend_kind IS DISTINCT FROM 'supabase_vault') incompatible_enabled_routes`)).rows[0];
  if(residue?.unfinished_cleanup!==0||residue?.unfinished_managed_writes!==0||residue?.native_material_residue!==0
    ||residue?.incompatible_enabled_routes!==0)fail('SECRET_BACKEND_RESIDUE_REJECTED');
  return {kind:'supabase_vault',writable:true};
}

export async function verifyAuthenticatedSecretBackend(environment,dependencies={}){
  const selected=environment.AUTHENTICATED_ACCEPTANCE_SECRET_BACKEND;
  if(!['hashicorp_vault','supabase_vault'].includes(selected)
    ||environment.AVALA_PROVIDER_SECRET_BACKEND!==selected)fail('SECRET_BACKEND_SELECTOR_REJECTED');
  return selected==='supabase_vault'
    ?verifyAuthenticatedSupabaseVaultBackend(environment,dependencies)
    :verifyAuthenticatedHashicorpSecretBackend(environment,dependencies);
}

export async function observeAuthenticatedSupabaseVaultSecret(database,input){
  const result=(await database.query(`SELECT public.enterprise_provider_secret_observe($1,$2,$3,$4,$5) value`,
    [input.exerciseId,input.keyRefId,input.organizationId,input.provider,input.safeFingerprint])).rows[0]?.value;
  if(result?.backendKind!=='supabase_vault'||typeof result?.exists!=='boolean'
    ||typeof result?.fingerprintMatches!=='boolean'||!['written','deleted','unowned'].includes(result?.state)){
    fail('SECRET_OBSERVATION_REJECTED');
  }
  return result;
}

export async function cleanupAuthenticatedSupabaseVaultSecrets(database,input){
  if(input?.backendKind!=='supabase_vault'||!Array.isArray(input.secrets)||input.secrets.length===0){
    fail('SECRET_CLEANUP_INPUT_REJECTED');
  }
  const expected=new Map(input.secrets.map(secret=>[secret.id,secret]));
  if(expected.size!==input.secrets.length)fail('SECRET_CLEANUP_INPUT_REJECTED');
  const completed=new Set();
  for(let index=0;index<=expected.size;index+=1){
    const executionToken=randomUUID();
    const claim=(await database.query('SELECT public.enterprise_ai_claim_provider_secret_cleanup_job($1) value',
      [executionToken])).rows[0]?.value;
    if(claim?.state==='empty')break;
    const secret=expected.get(claim?.keyRefId);
    if(claim?.state!=='claimed'||!secret||claim?.organizationId!==input.organizationId
      ||claim?.provider!==secret.provider||claim?.backendKind!=='supabase_vault'
      ||claim?.safeFingerprint!==secret.safe_fingerprint||!Number.isSafeInteger(Number(claim?.executionFence))
      ||Number(claim.executionFence)<1){
      fail('SECRET_CLEANUP_JOB_REJECTED');
    }
    try{
      const removed=(await database.query(`SELECT public.enterprise_provider_secret_delete_for_cleanup(
          $1,$2,$3,$4,$5,$6,$7,$8) value`,[claim.jobId,executionToken,claim.executionFence,secret.id,
        input.organizationId,secret.provider,secret.secret_ref,secret.safe_fingerprint])).rows[0]?.value;
      if(removed?.backendKind!=='supabase_vault'||!['deleted','absent'].includes(removed?.outcome)
        ||removed?.safeFingerprint!==secret.safe_fingerprint)fail('SECRET_CLEANUP_REJECTED');
      const settled=(await database.query('SELECT public.enterprise_ai_complete_provider_secret_cleanup_job($1,$2,$3) value',
        [claim.jobId,executionToken,claim.executionFence])).rows[0]?.value;
      if(settled?.state!=='completed'||settled?.jobId!==claim.jobId
        ||Number(settled?.executionFence)!==Number(claim.executionFence))fail('SECRET_CLEANUP_SETTLEMENT_REJECTED');
      completed.add(secret.id);
    }catch(error){
      await database.query('SELECT public.enterprise_ai_fail_provider_secret_cleanup_job($1,$2,$3,$4)',
        [claim.jobId,executionToken,claim.executionFence,'hosted_cleanup_failed']).catch(()=>undefined);
      throw error;
    }
  }
  if(completed.size!==expected.size)fail('SECRET_CLEANUP_INCOMPLETE');
  return {backendKind:'supabase_vault',removed:completed.size};
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

const childError = (category, diagnostic = null) => {
  const error = new Error(`AUTHENTICATED_HOSTED_RUNNER_BROWSER_${category}`);
  error.authenticatedHostedChildCategory = category;
  error.authenticatedHostedPlaywrightDiagnostic = diagnostic;
  return error;
};

const readChildDiagnostic = async diagnosticPath => {
  let handle;
  try {
    const linked = await lstat(diagnosticPath);
    if (linked.isSymbolicLink() || !linked.isFile() || linked.size < 2 || linked.size > 2_000) return null;
    handle = await open(diagnosticPath, 'r');
    const before = await handle.stat();
    if (!before.isFile() || before.size !== linked.size || before.dev !== linked.dev || before.ino !== linked.ino) return null;
    const bytes = Buffer.alloc(before.size);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    const after = await handle.stat();
    if (bytesRead !== bytes.length || after.size !== before.size || after.dev !== before.dev || after.ino !== before.ino) return null;
    const raw = bytes.toString('utf8');
    return validateAuthenticatedHostedPlaywrightDiagnostic(JSON.parse(raw));
  } catch { return null; }
  finally { await handle?.close().catch(() => undefined); }
};

export const runAuthenticatedHostedChild = (command, args, options, {
  timeoutMs = 30 * 60_000,
  cancellationSignal,
  diagnosticPath,
  spawnImpl = spawn,
} = {}) => new Promise((resolve, reject) => {
  let child;
  try { child = spawnImpl(command, args, { ...options, stdio: ['ignore','pipe','pipe'], windowsHide: true }); }
  catch { reject(childError('START_FAILED')); return; }
  child.stdout?.resume(); child.stderr?.resume();
  let termination=null;let forceTimer;
  const terminate=reason=>{if(termination)return;termination=reason;child.kill('SIGTERM');
    forceTimer=setTimeout(()=>child.kill('SIGKILL'),10_000);forceTimer.unref?.();};
  const onCancel=()=>terminate('CANCELLED');
  if(cancellationSignal?.aborted)onCancel();else cancellationSignal?.addEventListener('abort',onCancel,{once:true});
  const timer=setTimeout(()=>terminate('TIMEOUT'),timeoutMs);
  timer.unref?.();
  const done=()=>{clearTimeout(timer);clearTimeout(forceTimer);cancellationSignal?.removeEventListener('abort',onCancel);};
  child.once('error', () => { done(); reject(childError('START_FAILED')); });
  child.once('exit', async code => {
    done();
    const diagnostic = diagnosticPath ? await readChildDiagnostic(diagnosticPath) : null;
    if(termination)reject(childError(termination, diagnostic));
    else if(code===0)resolve();else reject(childError('EXIT_NONZERO', diagnostic));
  });
});

const CHILD_RUNTIME_KEYS = Object.freeze([
  'PATH', 'Path', 'HOME', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'SystemRoot', 'SYSTEMROOT',
  'ComSpec', 'PATHEXT', 'TEMP', 'TMP', 'TMPDIR', 'PLAYWRIGHT_BROWSERS_PATH', 'LANG', 'LC_ALL',
]);

export function buildAuthenticatedHostedChildEnvironment(environment, config, server, paths) {
  const child = {};
  for (const key of CHILD_RUNTIME_KEYS) if (typeof environment[key] === 'string' && environment[key]) child[key] = environment[key];
  return Object.freeze({
    ...child,
    CI: 'true',
    ACCEPTANCE_EXECUTION_KIND: config.executionKind === LOCAL_AUTHENTICATED_EXECUTION_KIND
      ? 'local_real_backend' : 'hosted_preview',
    AUTHENTICATED_ACCEPTANCE_EXECUTION_KIND: config.executionKind,
    ENTERPRISE_LIFECYCLE_APP_BASE_URL: config.origin,
    ENTERPRISE_LIFECYCLE_API_BASE_URL: config.supabaseUrl,
    ENTERPRISE_LIFECYCLE_CONTROL_URL: server.baseUrl,
    ENTERPRISE_LIFECYCLE_CONTROL_TOKEN: server.controlToken,
    ENTERPRISE_LIFECYCLE_AUTHENTICATED: 'true',
    ENTERPRISE_LIFECYCLE_HOSTED_REAL_AUTH: 'true',
    AUTHENTICATED_ACCEPTANCE_SUPABASE_URL: config.supabaseUrl,
    ENTERPRISE_LIFECYCLE_OUTPUT_DIR: paths.browserEvidence,
    AUTHENTICATED_HOSTED_PLAYWRIGHT_OUTPUT_DIR: paths.playwright,
    AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH: paths.diagnostic,
    AUTHENTICATED_ACCEPTANCE_MODE: config.acceptanceMode,
  });
}

const atomicJson = async (destination, document) => {
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, destination);
};

const removeIfPresent = async file => {
  if (!file) return;
  try { await unlink(file); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
};
const safeRunCategory = (error, child) => error?.authenticatedHostedChildCategory==='EXIT_NONZERO' && !child
  ? 'UNCLASSIFIED' : ['START_FAILED','EXIT_NONZERO','TIMEOUT','CANCELLED']
  .includes(error?.authenticatedHostedChildCategory) ? error.authenticatedHostedChildCategory
    : 'RUNNER_REJECTED';
const removeOwnedBrowserWorkspace = async directory => {
  if (!directory) return;
  const root = path.resolve(os.tmpdir());
  const resolved = path.resolve(directory);
  if (path.dirname(resolved) !== root || !path.basename(resolved).startsWith('authenticated-hosted-browser-')) {
    throw new Error('AUTHENTICATED_HOSTED_RUNNER_TEMP_CLEANUP_REJECTED');
  }
  await rm(resolved, { recursive: true, force: true });
};

export function createAuthenticatedHostedDatabaseClientConfig(databaseUrl) {
  return Object.freeze({
    ...createControlledHumanPostgresClientConfig(databaseUrl, {
      allowLoopback: false,
      applicationName: 'authenticated_hosted_acceptance',
      connectionTimeoutMillis: 20_000,
    }),
    query_timeout: AUTHENTICATED_HOSTED_OPERATION_TIMEOUT_MS,
    // The server cancels first; the client deadline is only a bounded fallback.
    // pg.Client remains serial, so cleanup queries cannot overtake a statement.
    statement_timeout: AUTHENTICATED_HOSTED_OPERATION_TIMEOUT_MS - 1_000,
  });
}

export async function stopAuthenticatedHostedRuntime(server, controller) {
  const errors = [];
  if (server) {
    try {
      if (typeof server.stopAndDrain === 'function') await server.stopAndDrain();
      else if (typeof server.close === 'function') await server.close();
      else errors.push(new Error('AUTHENTICATED_HOSTED_RUNNER_SERVER_SETTLEMENT_REQUIRED'));
    } catch (error) { errors.push(error); }
  }
  try { await controller.stopControlIntakeAndJoin(); }
  catch (error) { errors.push(error); }
  if (errors.length) throw new AggregateError(errors, 'AUTHENTICATED_HOSTED_RUNNER_RUNTIME_SETTLEMENT_INCOMPLETE');
  return { settled: true };
}

async function runAuthenticatedHostedAcceptanceCore(environment, dependencies, diagnosticState, outputPaths) {
  const config = validateAuthenticatedHostedControllerEnvironment(environment);
  validateAuthenticatedDatabaseTarget(config);
  await (dependencies.verifyCheckout ?? verifyAuthenticatedHostedCheckout)(config);
  const databaseClientConfig = createAuthenticatedHostedDatabaseClientConfig(config.databaseUrl);
  const ownsDatabase = !dependencies.database;
  const database = dependencies.database ?? await withAuthenticatedHostedDiagnostic('DATABASE_CONNECT', async () =>
    (dependencies.createDatabase ?? (clientConfig => new pg.Client(clientConfig)))(
      databaseClientConfig));
  if (ownsDatabase) {
    try {
      await withAuthenticatedHostedDiagnostic('DATABASE_CONNECT', () => database.connect());
    } catch (primaryError) {
      try { await withAuthenticatedHostedDiagnostic('DATABASE_CONNECT', () => database.end()); }
      catch (cleanupError) {
        throw new AggregateError([primaryError,cleanupError], 'AUTHENTICATED_HOSTED_RUNNER_CLEANUP_INCOMPLETE');
      }
      throw primaryError;
    }
  }
  const usesObservationReadPool = (!dependencies.database && !dependencies.createDatabase)
    || Boolean(dependencies.createObservationReadPool);
  let observationReadPool = null;
  if (usesObservationReadPool) {
    try {
      observationReadPool = (dependencies.createObservationReadPool ?? createAuthenticatedObservationReadPool)({
        clientConfig: databaseClientConfig,
      });
      await observationReadPool.start();
    } catch (primaryError) {
      const cleanupErrors = [];
      if (observationReadPool) {
        try { await observationReadPool.end(); } catch (error) { cleanupErrors.push(error); }
      }
      if (ownsDatabase) {
        try { await withAuthenticatedHostedDiagnostic('DATABASE_CONNECT', () => database.end()); }
        catch (error) { cleanupErrors.push(error); }
      }
      if (cleanupErrors.length) {
        throw new AggregateError([primaryError, ...cleanupErrors], 'AUTHENTICATED_HOSTED_RUNNER_CLEANUP_INCOMPLETE');
      }
      throw primaryError;
    }
  }
  const observationTimings = createObservationTimings();
  const observedDatabase = { query: (sql, values) => observationTimings.query(
    observationReadPool && [AUTHENTICATED_HOSTED_SESSION_QUERY, AUTHENTICATED_HOSTED_CAPTURE_QUERY].includes(sql)
      ? observationReadPool : database,
    sql,
    values,
  ) };
  diagnosticState.observationTimings = observationTimings;
  const rawAdapter = (dependencies.createPostgresAdapter ?? createAuthenticatedHostedPostgresAdapter)({
    config, db: observedDatabase,
    verifyDeployment: () => (dependencies.verifyDeployment ?? verifyAuthenticatedHostedDeployment)(config,
      {managementToken:environment.AUTHENTICATED_ACCEPTANCE_SUPABASE_MANAGEMENT_TOKEN}),
    verifySecretBackend: () => (dependencies.verifySecretBackend ?? verifyAuthenticatedSecretBackend)(environment,
      {projectRef:config.projectRef,organizationId:config.scope.organizationId,database}),
    observeSecretBackend:input=>(dependencies.observeSecretBackend??observeAuthenticatedSupabaseVaultSecret)(database,input),
    cleanupSecretBackend:input=>dependencies.cleanupSecretBackend
      ?dependencies.cleanupSecretBackend(input)
      :config.secretBackendKind==='supabase_vault'
        ?cleanupAuthenticatedSupabaseVaultSecrets(database,input)
        :cleanupAuthenticatedVaultSecret(environment,input),
  });
  const adapter = {
    ...rawAdapter,
    observe: input => observationTimings.observe(() => rawAdapter.observe(input)),
    preflight: input => { diagnosticState.phase='PREFLIGHT';
      return withAuthenticatedHostedDiagnostic('DATABASE_SCOPE_BASELINE', () => rawAdapter.preflight(input)); },
    activate: input => { diagnosticState.phase='ACTIVATION';
      return withAuthenticatedHostedDiagnostic('ACTIVATION', () => rawAdapter.activate(input)); },
  };
  const rawIdentity = (dependencies.createIdentityAdapter ?? createAuthenticatedHostedIdentityAdapter)({ config, db: observedDatabase });
  const identity = { ...rawIdentity,
    verifySession: input => observationTimings.identity(() => rawIdentity.verifySession(input)),
  };
  const controller = new AuthenticatedHostedController({ config, adapter, identity });
  const beginBrowserAction = controller.beginBrowserAction.bind(controller);
  const prepareBrowserAction = controller.prepareBrowserAction.bind(controller);
  const finishBrowserAction = controller.finishBrowserAction.bind(controller);
  controller.beginBrowserAction = (...args) => observationTimings.admission(() => beginBrowserAction(...args));
  controller.prepareBrowserAction = (...args) => observationTimings.prepare(() => prepareBrowserAction(...args));
  controller.finishBrowserAction = (...args) => observationTimings.finish(() => finishBrowserAction(...args));
  diagnosticState.controller = controller;
  const cancellation=new AbortController();const signalSource=dependencies.signalSource??process;
  const cancelSigterm=()=>cancellation.abort('SIGNAL_SIGTERM');const cancelSigint=()=>cancellation.abort('SIGNAL_SIGINT');
  const throwIfCancelled=()=>{if(cancellation.signal.aborted)throw childError('CANCELLED');};
  signalSource.on('SIGTERM',cancelSigterm);signalSource.on('SIGINT',cancelSigint);
  let server;
  let browserWorkspace;
  let finalized = false;
  let runtimeSettled = false;
  let primaryError = null;
  try {
    throwIfCancelled();
    await controller.preflightAndActivate();
    throwIfCancelled();
    diagnosticState.phase = 'CONTROLLER_START';
    server = await (dependencies.startServer ?? startAuthenticatedHostedControllerServer)(controller);
    throwIfCancelled();
    browserWorkspace = await (dependencies.createBrowserWorkspace ?? (() => mkdtemp(path.join(os.tmpdir(), 'authenticated-hosted-browser-'))))();
    const browserPaths = {
      browserEvidence: path.join(browserWorkspace, 'evidence'),
      playwright: path.join(browserWorkspace, 'playwright'),
      diagnostic: path.join(browserWorkspace, 'playwright-diagnostic.json'),
    };
    const playwrightArgs=[path.resolve('node_modules/@playwright/test/cli.js'), 'test',
      '--config=playwright.authenticated-hosted.config.ts', '--workers=1',
      ...(config.acceptanceMode === 'v2_primary_prefix_diagnostic'
        ? ['--project=desktop-chromium', '--grep=@v2-primary-prefix-diagnostic']
        : config.acceptanceMode === 'reviewer_selection_diagnostic'
          ? ['--project=desktop-chromium', '--grep=@reviewer-selection-diagnostic']
          : config.acceptanceMode === 'govern_studio_diagnostic'
            ? ['--project=desktop-chromium', '--grep=@govern-studio-diagnostic'] : [])];
    const playwrightOptions={
        cwd: process.cwd(), env: buildAuthenticatedHostedChildEnvironment(environment, config, server, browserPaths),
      };
    diagnosticState.phase = 'BROWSER_EXECUTION';
    if(dependencies.runPlaywright)await dependencies.runPlaywright(process.execPath,playwrightArgs,playwrightOptions);
    else await runAuthenticatedHostedChild(process.execPath,playwrightArgs,playwrightOptions,
      {timeoutMs:30*60_000,cancellationSignal:cancellation.signal,diagnosticPath:browserPaths.diagnostic});
    throwIfCancelled();
    if (config.acceptanceMode === 'full_acceptance') {
      diagnosticState.phase = 'FINALIZATION';
      await stopAuthenticatedHostedRuntime(server, controller);
      runtimeSettled = true;
      const output = await controller.finalize();
      throwIfCancelled();
      await Promise.all([
        atomicJson(outputPaths.binding, output.profile),
        atomicJson(outputPaths.browser, output.browser),
        atomicJson(outputPaths.server, output.server),
      ]);
      finalized = true;
      diagnosticState.cleanup = 'verified';
      return { outputPaths };
    }
    diagnosticState.phase = 'FINALIZATION';
  } catch (error) {
    primaryError = error;
    diagnosticState.primaryError = error;
    diagnosticState.child = error?.authenticatedHostedPlaywrightDiagnostic ?? null;
  } finally {
    const cleanupErrors=[];
    if (!runtimeSettled) {
      try {
        await stopAuthenticatedHostedRuntime(server, controller);
        runtimeSettled = true;
      } catch (error) { cleanupErrors.push(error); }
    }
    if (!finalized && runtimeSettled) {
      try { await controller.abortAndQuiesce(); } catch (error) { cleanupErrors.push(error); }
    }
    if (observationReadPool) {
      try { await observationReadPool.end(); } catch (error) { cleanupErrors.push(error); }
    }
    if (ownsDatabase && runtimeSettled) {
      try { await withAuthenticatedHostedDiagnostic('DATABASE_CONNECT', () => database.end()); }
      catch (error) { cleanupErrors.push(error); }
    }
    try { await removeOwnedBrowserWorkspace(browserWorkspace); }
    catch { cleanupErrors.push(new Error('AUTHENTICATED_HOSTED_RUNNER_TEMP_CLEANUP_INCOMPLETE')); }
    signalSource.removeListener('SIGTERM',cancelSigterm);signalSource.removeListener('SIGINT',cancelSigint);
    if (cleanupErrors.length) {
      diagnosticState.cleanup = 'failed';
      throw new AggregateError([...(primaryError?[primaryError]:[]),...cleanupErrors],
        'AUTHENTICATED_HOSTED_RUNNER_CLEANUP_INCOMPLETE');
    }
    if (controller.active || controller.activationAttempted) diagnosticState.cleanup = 'verified';
  }
  if (config.acceptanceMode === 'v2_primary_prefix_diagnostic' && controller.quiesced) {
    try {
      await atomicJson(outputPaths.v2ReloadDiagnostic, controller.v2ReloadDiagnosticResult());
    } catch (error) {
      if (!primaryError) {
        primaryError = error;
        diagnosticState.primaryError = error;
      }
    }
  }
  if (config.acceptanceMode === 'reviewer_selection_diagnostic' && controller.quiesced && !primaryError) {
    try {
      await atomicJson(outputPaths.reviewerSelectionDiagnostic, controller.reviewerSelectionDiagnosticResult());
    } catch (error) {
      primaryError = error;
      diagnosticState.primaryError = error;
    }
  }
  if (config.acceptanceMode === 'govern_studio_diagnostic' && controller.quiesced && !primaryError) {
    try {
      await atomicJson(outputPaths.governStudioDiagnostic, controller.governStudioDiagnosticResult());
    } catch (error) {
      primaryError = error;
      diagnosticState.primaryError = error;
    }
  }
  if (!primaryError && config.acceptanceMode === 'v2_primary_prefix_diagnostic') return { outputPaths };
  if (!primaryError && config.acceptanceMode === 'reviewer_selection_diagnostic') return { outputPaths };
  if (!primaryError && config.acceptanceMode === 'govern_studio_diagnostic') return { outputPaths };
  throw primaryError;
}

export async function runAuthenticatedHostedAcceptance(environment = process.env, dependencies = {}) {
  const outputPaths = dependencies.outputPaths ?? AUTHENTICATED_HOSTED_OUTPUT_PATHS;
  const mode = authenticatedAcceptanceMode(environment);
  const stalePaths = mode === 'v2_primary_prefix_diagnostic'
    ? [outputPaths.diagnostic, outputPaths.v2ReloadDiagnostic]
    : mode === 'reviewer_selection_diagnostic'
      ? [outputPaths.diagnostic, outputPaths.reviewerSelectionDiagnostic]
      : mode === 'govern_studio_diagnostic'
        ? [outputPaths.diagnostic, outputPaths.governStudioDiagnostic]
    : [outputPaths.diagnostic];
  await Promise.all(stalePaths.map(removeIfPresent));
  const diagnosticState = { phase: 'PREFLIGHT', cleanup: 'not-required', controller: null,
    primaryError: null, child: null };
  try {
    const result = await runAuthenticatedHostedAcceptanceCore(environment, dependencies, diagnosticState, outputPaths);
    await removeIfPresent(outputPaths.diagnostic);
    return result;
  } catch (error) {
    const primaryError = diagnosticState.primaryError ?? error;
    const primary = { phase: diagnosticState.phase, category: safeRunCategory(primaryError, diagnosticState.child) };
    const cleanupFailed = diagnosticState.cleanup === 'failed';
    const identityWithProject = diagnosticState.controller?.failureDiagnostic?.() ?? null;
    const identity = identityWithProject
      ? { source: identityWithProject.source, operation: identityWithProject.operation, category: identityWithProject.category,
        ...(identityWithProject.upstreamCode ? { upstreamCode: identityWithProject.upstreamCode } : {}) }
      : null;
    const envelope = createAuthenticatedHostedRunDiagnostic({
      failure: cleanupFailed ? { phase: 'CLEANUP', category: 'CLEANUP_INCOMPLETE' } : primary,
      primary,
      child: diagnosticState.child,
      identity,
      observationTimings: diagnosticState.observationTimings?.snapshot() ?? null,
      cleanup: diagnosticState.cleanup,
    });
    try { await atomicJson(outputPaths.diagnostic, envelope); }
    catch (writeError) {
      error.authenticatedHostedDiagnosticWriteFailed = true;
      error.authenticatedHostedDiagnosticWriteCategory = ['EACCES','EPERM','ENOENT','ENOSPC'].includes(writeError?.code)
        ? writeError.code : 'UNCLASSIFIED';
    }
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runAuthenticatedHostedAcceptance().then(() => {
    console.log(JSON.stringify({ status: 'completed', outputs: AUTHENTICATED_HOSTED_OUTPUT_PATHS }));
  }).catch(error => {
    const code=authenticatedHostedFailureCode(error);
    console.error(code);
    process.exitCode = 1;
  });
}
