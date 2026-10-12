import { createHash, randomUUID } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

import pg from 'pg';
import ts from 'typescript';

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
import { withAuthenticatedHostedDiagnostic } from './authenticatedHostedDiagnostics.mjs';
import { verifyAuthenticatedHostedCheckoutState } from './authenticatedHostedCheckout.mjs';
import { verifyHostedDeployment } from './verify-hosted-deployment.mjs';
import { createControlledHumanPostgresClientConfig,
  validatePrivilegedPostgresConnectionString } from './prCControlledHumanPostgresTls.mjs';

const execFileAsync = promisify(execFile);
const MIGRATION_PATH = 'supabase/migrations/20261011053000_supabase_provider_secret_backend.sql';
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
  await verifyAuthenticatedHostedCheckoutState(config.releaseSha, { root, git });
  const [catalogText, provenanceText, migrationText] = await Promise.all([
    readFile(path.join(root, 'tests/acceptance/catalog/test-catalog.json'), 'utf8'),
    readFile(path.join(root, 'tests/acceptance/source-provenance.json'), 'utf8'),
    readFile(path.join(root, MIGRATION_PATH), 'utf8'),
  ]);
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
    if (!(await stat(file).catch(() => null))?.isFile()) fail('BACKEND_LOCAL_DEPENDENCY_UNRESOLVED');
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
        if ((await stat(candidate).catch(() => null))?.isFile()) { dependency = candidate; break; }
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
    for (const slug of AUTHENTICATED_EDGE_FUNCTIONS) {
      const child=path.join(temporary,slug);await mkdir(path.join(child,'supabase'),{recursive:true});
      await writeFile(path.join(child,'supabase','config.toml'),`project_id = "${config.projectRef}"\n`,'utf8');
      await withAuthenticatedHostedDiagnostic('SOURCE_DOWNLOAD', () => cli('supabase',
        ['functions','download',slug,'--project-ref',config.projectRef,'--workdir',child,'--use-docker'], {
          cwd: child, encoding: 'utf8', env: { ...process.env, SUPABASE_ACCESS_TOKEN: managementToken,
            SUPABASE_TELEMETRY_DISABLED: 'true' }, windowsHide: true,
        }), { source: 'cli' });
      const downloadedRoot=path.join(child,'supabase','functions');
      const files=await sourceFiles(downloadedRoot).catch(()=>[]);
      const expected=await collectAuthenticatedEdgeRuntimeClosure(root,slug);
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
  const ownsDatabase = !dependencies.database;
  const database = dependencies.database ?? await withAuthenticatedHostedDiagnostic('DATABASE_CONNECT', async () =>
    (dependencies.createDatabase ?? (clientConfig => new pg.Client(clientConfig)))(
      createControlledHumanPostgresClientConfig(config.databaseUrl,{
        allowLoopback:false,applicationName:'authenticated_hosted_acceptance',connectionTimeoutMillis:20_000})));
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
  const rawAdapter = (dependencies.createPostgresAdapter ?? createAuthenticatedHostedPostgresAdapter)({
    config, db: database,
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
    preflight: input => withAuthenticatedHostedDiagnostic('DATABASE_SCOPE_BASELINE', () => rawAdapter.preflight(input)),
    activate: input => withAuthenticatedHostedDiagnostic('ACTIVATION', () => rawAdapter.activate(input)),
  };
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
    if (ownsDatabase) try { await withAuthenticatedHostedDiagnostic('DATABASE_CONNECT', () => database.end()); }
    catch (error) { cleanupErrors.push(error); }
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
