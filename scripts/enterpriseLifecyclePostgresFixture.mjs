import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import vm from 'node:vm';
import pg from 'pg';
import ts from 'typescript';
import { applySyntheticAiTerminalJournalMigrationForTest } from './syntheticAiTerminalJournalMigrationTestGuard.mjs';
import { createEnterpriseLifecycleStudioGeneration } from './enterpriseLifecycleStudioGeneration.mjs';
import { createAuthenticatedControlsFixture } from './authenticatedControlsFixture.mjs';
import { createAuthenticatedControlsPostgresAdapter } from './authenticatedControlsPostgresAdapter.mjs';

const { Client } = pg;
const root = process.cwd();
const duplicateSafeMigrations = new Set([
  '20260923133000_pr1e_evidence_claim_operator_binding.sql',
  '20260923142120_pr1e_govern_control_alias_binding.sql',
  '20260923144653_studio_command_authority_capabilities.sql',
  '20260923151115_studio_handoff_receipt_binding.sql',
  '20260923190853_pr_c_deferred_binding_authority.sql',
]);
const sha256 = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const stableJson = value => JSON.stringify(value, Object.keys(value).sort());
const uuid = ordinal => `a1000000-0000-4000-8000-${String(ordinal).padStart(12, '0')}`;
const json = (value, status = 200, extra = {}) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra },
});

export const validateEnterpriseLifecycleDatabaseUrl = value => {
  let parsed;
  try { parsed = new URL(value); }
  catch { throw new Error('ENTERPRISE_LIFECYCLE_DATABASE_URL_REJECTED'); }
  const hostname = parsed.hostname.toLowerCase();
  const database = decodeURIComponent(parsed.pathname);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)
    || !['127.0.0.1', '[::1]'].includes(hostname)
    || !['/postgres', '/avalaos_pilot_synthetic'].includes(database)
    || parsed.search || parsed.hash) {
    throw new Error('ENTERPRISE_LIFECYCLE_DATABASE_URL_REJECTED');
  }
  return parsed.toString();
};

const loadProductionModule = (() => {
  const repositoryRoot = path.resolve(root);
  const cache = new Map();
  const context = vm.createContext({
    Request, Response, Headers, URL, URLSearchParams, TextEncoder, TextDecoder,
    AbortController, DOMException, crypto: globalThis.crypto,
    console, setTimeout, clearTimeout, queueMicrotask,
  });
  context.structuredClone = vm.runInContext('(value) => JSON.parse(JSON.stringify(value))', context);
  const load = filename => {
    let resolved = path.resolve(filename);
    if (!path.extname(resolved)) resolved += '.ts';
    if (cache.has(resolved)) return cache.get(resolved).exports;
    const relative = path.relative(repositoryRoot, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative) || path.extname(resolved) !== '.ts') {
      throw new Error(`ENTERPRISE_LIFECYCLE_IMPORT_REJECTED:${relative}`);
    }
    const source = readFileSync(resolved, 'utf8');
    const compiled = ts.transpileModule(source, {
      fileName: resolved,
      reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    });
    const errors = (compiled.diagnostics ?? []).filter(item => item.category === ts.DiagnosticCategory.Error);
    if (errors.length) throw new Error(`ENTERPRISE_LIFECYCLE_TRANSPILE_FAILED:${relative}`);
    const module = { exports: {} };
    cache.set(resolved, module);
    const localRequire = specifier => {
      if (!specifier.startsWith('.')) throw new Error(`ENTERPRISE_LIFECYCLE_IMPORT_REJECTED:${specifier}`);
      const target = path.resolve(path.dirname(resolved), specifier);
      return load(path.extname(target) ? target : `${target}.ts`);
    };
    const wrapper = new vm.Script(`(function(exports,require,module,__filename,__dirname){${compiled.outputText}\n})`, { filename: resolved });
    wrapper.runInContext(context)(module.exports, localRequire, module, resolved, path.dirname(resolved));
    return module.exports;
  };
  load.clone = vm.runInContext('(value) => JSON.parse(JSON.stringify(value))', context);
  load.configureNetworkGuard = async effects => {
    let probing = true;
    let blockedProbe = 0;
    context.fetch = async () => {
      if (probing) blockedProbe += 1;
      else effects.egressAttempts += 1;
      throw new Error('ENTERPRISE_LIFECYCLE_NETWORK_FORBIDDEN');
    };
    let rejected = false;
    try { await vm.runInContext('fetch("https://guard-probe.invalid/")', context); }
    catch (error) { rejected = error?.message === 'ENTERPRISE_LIFECYCLE_NETWORK_FORBIDDEN'; }
    probing = false;
    effects.forbiddenNetworkGuardTriggered = rejected && blockedProbe === 1;
    assert.equal(effects.forbiddenNetworkGuardTriggered, true, 'ENTERPRISE_LIFECYCLE_NETWORK_GUARD_UNVERIFIED');
  };
  return load;
})();

const asRole = async (client, role, operation) => {
  await client.query('BEGIN');
  try {
    await client.query(`SET LOCAL ROLE ${role}`);
    const result = await operation();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
};

export const readEnterpriseLifecycleRequestBody = request => new Promise((resolve, reject) => {
  const chunks = [];
  let settled = false;
  const finish = (callback, value) => {
    if (settled) return;
    settled = true;
    request.off('end', onEnd);
    request.off('error', onError);
    request.off('aborted', onAborted);
    request.off('close', onClose);
    callback(value);
  };
  const onEnd = () => finish(resolve, Buffer.concat(chunks));
  const onError = error => {
    if (settled) {
      request.off('close', onClose);
      return;
    }
    finish(reject, error);
  };
  const onAborted = () => {
    if (settled) return;
    settled = true;
    request.off('end', onEnd);
    request.off('aborted', onAborted);
    reject(new Error('ENTERPRISE_LIFECYCLE_REQUEST_ABORTED'));
  };
  const onClose = () => {
    if (!request.complete) onAborted();
    request.off('error', onError);
  };
  request.on('data', chunk => chunks.push(chunk));
  request.once('end', onEnd);
  request.once('error', onError);
  request.once('aborted', onAborted);
  request.once('close', onClose);
});

const requestHeaders = incoming => {
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) {
    if (Array.isArray(value)) value.forEach(item => headers.append(name, item));
    else if (value !== undefined) headers.set(name, value);
  }
  return headers;
};

const responseToNode = async (response, outgoing) => {
  outgoing.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  outgoing.end(Buffer.from(await response.arrayBuffer()));
};

const migrationsForChain = () => readdirSync(path.join(root, 'supabase', 'migrations'))
  .filter(name => name.endsWith('.sql')).sort();

const applyCurrentMigrationChain = async client => {
  await client.query('BEGIN');
  try {
    await client.query("CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';");
    // Match the Supabase bootstrap contract before repository migrations apply
    // their narrower explicit revokes/grants. This is local transport authority,
    // not evidence about any hosted project's current ACLs.
    await client.query('GRANT USAGE ON SCHEMA public TO service_role; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  for (const name of migrationsForChain()) {
    const sql = readFileSync(path.join(root, 'supabase', 'migrations', name), 'utf8').replaceAll('\r\n', '\n');
    const apply = async () => {
      await client.query('BEGIN');
      try { await client.query(sql); await client.query('COMMIT'); }
      catch (error) { await client.query('ROLLBACK'); throw error; }
    };
    try {
      await applySyntheticAiTerminalJournalMigrationForTest(client, name, apply);
      if (duplicateSafeMigrations.has(name)) await apply();
    } catch (error) {
      throw new Error(`ENTERPRISE_LIFECYCLE_MIGRATION_FAILED:${name}:${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
  }
};

const createRoles = async admin => {
  const created = [];
  for (const [name, attributes] of [['anon', 'NOLOGIN'], ['authenticated', 'NOLOGIN'], ['service_role', 'NOLOGIN BYPASSRLS']]) {
    if (!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [name])).rowCount) {
      await admin.query(`CREATE ROLE ${name} ${attributes}`);
      created.push(name);
    }
  }
  return created;
};

const dbUrlFor = (adminUrl, database) => {
  const url = new URL(adminUrl);
  url.pathname = `/${database}`;
  return url.toString();
};

const connect = async connectionString => {
  const client = new Client({ connectionString });
  await client.connect();
  return client;
};

export async function createEnterpriseLifecycleFixture({
  databaseUrl = process.env.ENTERPRISE_LIFECYCLE_DATABASE_URL,
  port = 0,
  runId = process.env.GITHUB_RUN_ID ?? `local-${process.pid}`,
  runAttempt = process.env.GITHUB_RUN_ATTEMPT ?? '1',
  headSha = process.env.PILOT_ACCEPTANCE_HEAD ?? process.env.GITHUB_SHA ?? 'local-working-tree',
} = {}) {
  if (!databaseUrl) throw new Error('ENTERPRISE_LIFECYCLE_DATABASE_URL_REQUIRED');
  databaseUrl = validateEnterpriseLifecycleDatabaseUrl(databaseUrl);
  const startedAt = new Date().toISOString();
  const database = `enterprise_lifecycle_${process.pid}_${Date.now()}`.toLowerCase();
  const admin = await connect(databaseUrl);
  const createdRoles = await createRoles(admin);
  let db;
  let server;
  let databaseCreated = false;
  let cleanupAttempted = false;
  let cleanupSucceeded = false;
  try {
    await admin.query(`CREATE DATABASE ${database}`);
    databaseCreated = true;
    db = await connect(dbUrlFor(databaseUrl, database));
    await applyCurrentMigrationChain(db);

    const ids = {
      organization: uuid(1), workspace: uuid(2), foreignOrganization: uuid(3), foreignWorkspace: uuid(4),
      author: uuid(10), reviewer: uuid(11), approver: uuid(12), outsider: uuid(13),
      role: uuid(20), process: uuid(21), case: uuid(22), rejectCase: uuid(23), deniedCase: uuid(24),
      providerKeyRef: uuid(25), providerConfig: uuid(26), studioRoute: uuid(27), deliveryRestrictedRole: uuid(28),
    };
    const tokens = new Map([
      ['enterprise-author-token', ids.author], ['enterprise-reviewer-token', ids.reviewer],
      ['enterprise-approver-token', ids.approver], ['enterprise-outsider-token', ids.outsider],
    ]);
    const controlToken = `control-${randomUUID()}`;
    const executionId = sha256(`${runId}\u0000${headSha}\u0000${randomUUID()}`);
    const journeyBinding = sha256(JSON.stringify({ executionId, runId, headSha, logicalJourney: 'assess-govern-studio-v1' }));
    const evidence = {
      schemaVersion: 'enterprise-lifecycle-backend-evidence-v1', status: 'in_progress', journeyBinding,
      execution: { executionId, runId: String(runId), runAttempt: String(runAttempt), headSha, startedAt, completedAt: null },
      scope: { executionHash: executionId, organizationHash: sha256(ids.organization), workspaceHash: sha256(ids.workspace), caseHash: sha256(ids.case) },
      stages: [], assertions: {}, lineage: {}, negativeControls: {},
      providerEffects: { paidCalls: 0, calls: 0, syntheticProviderCalls: 0, egressAttempts: 0, egress: 0, browserSecrets: false, realProviderAllowed: false, syntheticAdapterEnabled: true, providerMode: 'synthetic-production-pipeline', forbiddenNetworkGuardTriggered: false },
      cleanup: { attempted: false, succeeded: false, residualRows: null }, sourceDigests: [],
    };
    await loadProductionModule.configureNetworkGuard(evidence.providerEffects);
    const aliases = { case: 'primary-case', review: 'primary-review', handoff: 'primary-handoff', artifact: 'primary-artifact' };

    await db.query('INSERT INTO auth.users(id) VALUES($1),($2),($3),($4)', [ids.author, ids.reviewer, ids.approver, ids.outsider]);
    await db.query("INSERT INTO profiles(id,email,full_name) VALUES($1,'author@fixture.invalid','Author'),($2,'reviewer@fixture.invalid','Reviewer'),($3,'approver@fixture.invalid','Approver'),($4,'outsider@fixture.invalid','Outsider')", [ids.author, ids.reviewer, ids.approver, ids.outsider]);
    await db.query("INSERT INTO organizations(id,name,slug) VALUES($1,'Enterprise lifecycle','enterprise-lifecycle'),($2,'Foreign tenant','foreign-lifecycle')", [ids.organization, ids.foreignOrganization]);
    await db.query("INSERT INTO workspaces(id,org_id,name,slug) VALUES($1,$2,'Lifecycle workspace','lifecycle'),($3,$4,'Foreign workspace','foreign-lifecycle')", [ids.workspace, ids.organization, ids.foreignWorkspace, ids.foreignOrganization]);
    await db.query("INSERT INTO roles(id,org_id,name,slug,scope,permissions) VALUES($1,$2,'Lifecycle authority','lifecycle-authority','organization','[]')", [ids.role, ids.organization]);
    await db.query("INSERT INTO roles(id,org_id,name,slug,scope,permissions) VALUES($1,$2,'Restricted Delivery operator','restricted-delivery-operator','organization','[]')", [ids.deliveryRestrictedRole, ids.organization]);
    await db.query("INSERT INTO role_capabilities(role_id,capability_key) SELECT $1,capability_key FROM capabilities WHERE capability_key IN('org.admin','assess.read','assess.create','assess.response.write','assess.finalize','assess.process.update','govern.resolve','studio.handoff.create','workitems.import','project.read','project.manage','backlog.read','backlog.manage','monitor.read') OR capability_key LIKE 'assess.v2.%' OR capability_key LIKE 'studio.%' OR capability_key LIKE 'task.%' OR capability_key LIKE 'delivery.%'", [ids.role]);
    await db.query("INSERT INTO role_capabilities(role_id,capability_key) SELECT $1,capability_key FROM capabilities WHERE capability_key IN('assess.read','task.read','task.update.own','project.read','backlog.read','delivery.outcomes.read')", [ids.deliveryRestrictedRole]);
    for (const actor of [ids.author, ids.reviewer, ids.approver]) {
      await db.query("INSERT INTO organization_members(org_id,user_id,role_id,status) VALUES($1,$2,$3,'active')", [ids.organization, actor, ids.role]);
      await db.query("INSERT INTO workspace_memberships(org_id,workspace_id,user_id,status) VALUES($1,$2,$3,'active')", [ids.organization, ids.workspace, actor]);
    }
    await db.query("INSERT INTO organizations(id,name,slug) VALUES($1,'Outsider tenant','outsider-tenant') ON CONFLICT DO NOTHING", [ids.foreignOrganization]);
    await db.query("INSERT INTO assess_processes(id,org_id,workspace_id,name,status,owner_id,created_by,updated_by) VALUES($1,$2,$3,'Connected lifecycle','Draft',$4,$4,$4)", [ids.process, ids.organization, ids.workspace, ids.author]);
    await db.query("INSERT INTO process_update_workspace_controls(org_id,workspace_id,enabled,read_only) VALUES($1,$2,true,false)", [ids.organization, ids.workspace]);
    await db.query(`INSERT INTO public.enterprise_transcript_workspace_flags(
      org_id,workspace_id,unified_byok_gateway_enabled,studio_multisource_enabled,module_handoffs_enabled,updated_by
    ) VALUES($1,$2,true,true,true,$3) ON CONFLICT(org_id,workspace_id) DO UPDATE SET
      unified_byok_gateway_enabled=true,studio_multisource_enabled=true,module_handoffs_enabled=true,updated_by=$3`, [ids.organization, ids.workspace, ids.author]);
    await db.query('UPDATE public.studio_artifact_runtime_control SET enabled=true,read_only=false,provider_enabled=true WHERE singleton');
    await db.query("INSERT INTO public.legacy_delivery_workspace_controls(org_id,workspace_id,writes_enabled) VALUES($1,$2,true) ON CONFLICT(org_id,workspace_id) DO UPDATE SET writes_enabled=true,updated_at=statement_timestamp()", [ids.organization, ids.workspace]);
    await db.query("INSERT INTO public.studio_delivery_workspace_controls(org_id,workspace_id,publication_writes_enabled,outcome_writes_enabled,pack_writes_enabled) VALUES($1,$2,true,true,true) ON CONFLICT(org_id,workspace_id) DO UPDATE SET publication_writes_enabled=true,outcome_writes_enabled=true,pack_writes_enabled=true,updated_at=statement_timestamp()", [ids.organization, ids.workspace]);
    await db.query(`INSERT INTO public.ai_provider_key_refs(
      id,org_id,provider,resolver_type,secret_ref,safe_label,status,created_by
    ) VALUES($1,$2,'openai','server_reference','fixture/provider/reference','Lifecycle synthetic adapter','active',$3)`, [ids.providerKeyRef, ids.organization, ids.author]);
    await db.query(`INSERT INTO public.ai_provider_configs(
      id,org_id,provider,display_name,key_ref_id,default_model,model_allowlist,endpoint_url,
      allowed_modes,allowed_operations,last_validated_at,status,created_by,updated_by
    ) VALUES($1,$2,'openai','Lifecycle synthetic adapter',$3,'fixture-model',ARRAY['fixture-model'],'https://invalid.example',
      ARRAY['pilot'],ARRAY['generate_document'],statement_timestamp(),'active',$4,$4)`, [ids.providerConfig, ids.organization, ids.providerKeyRef, ids.author]);
    await db.query(`INSERT INTO public.enterprise_ai_capability_routes(
      id,org_id,workspace_id,provider_config_id,capability,model,enabled,allowed_roles,version,created_by,updated_by
    ) VALUES($1,$2,$3,$4,'studio.document.generate','fixture-model',true,ARRAY[$5::text],1,$6,$6)`,
    [ids.studioRoute, ids.organization, ids.workspace, ids.providerConfig, ids.role, ids.author]);

    const commandModule = loadProductionModule(path.join(root, 'supabase', 'functions', '_shared', 'assessV2Command.ts'));
    const handlerModule = loadProductionModule(path.join(root, 'supabase', 'functions', '_shared', 'assessV2Handlers.ts'));
    const assessCommandModule = loadProductionModule(path.join(root, 'supabase', 'functions', '_shared', 'assessCommand.ts'));
    const assessRouterModule = loadProductionModule(path.join(root, 'supabase', 'functions', '_shared', 'assessRouter.ts'));
    const reviewCommandModule = loadProductionModule(path.join(root, 'supabase', 'functions', '_shared', 'assessV2ReviewCommand.ts'));
    const reviewHandlerModule = loadProductionModule(path.join(root, 'supabase', 'functions', '_shared', 'assessV2ReviewHandlers.ts'));
    const studioHandlerModule = loadProductionModule(path.join(root, 'supabase', 'functions', '_shared', 'studioArtifactHandler.ts'));
    const studioDbModule = loadProductionModule(path.join(root, 'supabase', 'functions', '_shared', 'studioArtifactDb.ts'));
    const studioGenerationModule = loadProductionModule(path.join(root, 'supabase', 'functions', '_shared', 'studioArtifactGeneration.ts'));
    const providerBudgetModule = loadProductionModule(path.join(root, 'supabase', 'functions', '_shared', 'providerBudget.ts'));
    const studioProviderModule = loadProductionModule(path.join(root, 'supabase', 'functions', '_shared', 'studioArtifactProvider.ts'));
    const templateModule = loadProductionModule(path.join(root, 'supabase', 'functions', '_shared', 'studioArtifactTemplateContract.ts'));
    const tenantAuthorityModule = loadProductionModule(path.join(root, 'supabase', 'functions', '_shared', 'tenantAuthority.ts'));
    const processCommandRouterModule = loadProductionModule(path.join(root, 'supabase', 'functions', '_shared', 'processCommandRouter.ts'));
    const studioDeliveryCommandModule = loadProductionModule(path.join(root, 'supabase', 'functions', '_shared', 'studioDeliveryCommand.ts'));
    const studioDeliveryQueryModule = loadProductionModule(path.join(root, 'supabase', 'functions', '_shared', 'studioDeliveryOutcomeQuery.ts'));
    const legacyDeliveryCommandModule = loadProductionModule(path.join(root, 'supabase', 'functions', '_shared', 'legacyDeliveryCommand.ts'));
    const legacyDeliveryQueryModule = loadProductionModule(path.join(root, 'supabase', 'functions', '_shared', 'legacyDeliveryQuery.ts'));
    const fixtureModule = loadProductionModule(path.join(root, 'services', 'assessV2', 'fixture.ts'));

    const actorFromRequest = request => {
      const token = request.headers.get('authorization')?.replace(/^Bearer\s+/iu, '');
      const actor = token ? tokens.get(token) : null;
      if (!actor) throw new Error('AUTHENTICATION_REQUIRED');
      return actor;
    };
    let actorTransactionTail = Promise.resolve();
    const actorTransaction = (actorId, operation) => {
      const run = actorTransactionTail.then(async () => {
        await db.query('BEGIN');
        try {
          await db.query('SET LOCAL ROLE authenticated');
          await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [actorId]);
          const result = await operation();
          await db.query('COMMIT');
          return result;
        } catch (error) {
          await db.query('ROLLBACK');
          throw error;
        }
      });
      actorTransactionTail = run.catch(() => {});
      return run;
    };
    const authorityFor = async (actorId, organizationId, workspaceId) => {
      try {
        const authority = await tenantAuthorityModule.resolveTenantAuthority(actorId, { organizationId, workspaceId }, {
          loadFreshProjection: async input => actorTransaction(actorId, async () => {
            const result = await db.query('SELECT public.get_tenant_context($1,$2) value', [input.organizationId, input.workspaceId]);
            return result.rows[0]?.value ?? null;
          }),
        });
        return {
          actorId: authority.userId,
          organizationId: authority.organizationId,
          workspaceId: authority.workspaceId,
          authorizationVersion: authority.authorizationVersion,
          capabilities: authority.capabilities,
        };
      } catch (error) {
        if (error?.code === 'TENANT_ACCESS_DENIED') return null;
        throw error;
      }
    };
    const authorizationVersion = async actorId => Number((await db.query('SELECT version FROM authorization_versions WHERE org_id=$1 AND user_id=$2', [ids.organization, actorId])).rows[0].version);
    const controlled = (value, ErrorType, mapping = {}) => {
      if (value?.errorCode) throw new ErrorType(mapping[value.errorCode] ?? value.errorCode);
      if (!value || !['committed', 'replayed'].includes(value.outcome) || !value.resource) throw new Error('COMMAND_UNAVAILABLE');
      return value;
    };
    const serviceQuery = (sql, values) => asRole(db, 'service_role', () => db.query(sql, values));
    const fixtureQuery = (sql, values) => db.query(sql, values);
    const actorQuery = (actorId, sql, values = []) => actorTransaction(actorId, () => db.query(sql, values));
    const fixtureActors = {
      author: { token: 'enterprise-author-token', user: { id: ids.author, email: 'author@fixture.invalid' } },
      reviewer: { token: 'enterprise-reviewer-token', user: { id: ids.reviewer, email: 'reviewer@fixture.invalid' } },
      approver: { token: 'enterprise-approver-token', user: { id: ids.approver, email: 'approver@fixture.invalid' } },
      outsider: { token: 'enterprise-outsider-token', user: { id: ids.outsider, email: 'outsider@fixture.invalid' } },
    };
    const controlsFixture = createAuthenticatedControlsFixture({
      scope: { organizationId: ids.organization, workspaceId: ids.workspace, providerConfigId: ids.providerConfig },
      actors: fixtureActors, serviceQuery, actorQuery,
      fixtureQuery, loadProductionModule,
    });
    const controlsPostgres = await createAuthenticatedControlsPostgresAdapter({
      scope: { organizationId: ids.organization, workspaceId: ids.workspace },
      actorId: ids.author, serviceQuery, actorQuery, fixtureQuery, loadProductionModule,
    });
    controlsFixture.mountPostgresAdapter(controlsPostgres);
    const studioGeneration = createEnterpriseLifecycleStudioGeneration({
      serviceQuery, providerEffects: evidence.providerEffects, studioDbModule, studioGenerationModule,
      providerBudgetModule, studioProviderModule, templateModule,
      toProductionJson: loadProductionModule.clone,
    });
    const assessDependencies = {
      authenticate: async request => ({ id: actorFromRequest(request) }),
      loadFreshAuthority: async input => authorityFor(input.actorId, input.organizationId, input.workspaceId),
      loadFrozenV1AssessmentForClone: async () => null,
      loadLockedCaseForFinalize: async input => {
        const result = await serviceQuery('SELECT public.pr1d_load_assess_v2_case($1,$2,$3,$4) value', [input.caseId, input.organizationId, input.workspaceId, input.expectedVersion]);
        return result.rows[0]?.value ? loadProductionModule.clone(result.rows[0].value) : null;
      },
      executeAtomicCommand: async command => {
        const common = [command.actorId, command.organizationId, command.workspaceId];
        let result;
        if (command.commandType === 'assessment_v2.create') result = await serviceQuery('SELECT public.pr1d_create_assess_v2_case($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) value', [...common, command.payload.caseId, command.payload.processId, command.payload.name, command.payload.description, command.requestId, command.idempotencyKey, command.authorizationVersion]);
        else if (command.commandType === 'assessment_v2.draft.upsert') result = await serviceQuery('SELECT public.pr1d_upsert_assess_v2_draft($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9) value', [...common, command.payload.caseId, command.expectedVersion, JSON.stringify(command.payload), command.requestId, command.idempotencyKey, command.authorizationVersion]);
        else if (command.commandType === 'assessment_v2.finalize' && !command.serverDecision) result = await serviceQuery('SELECT public.pr1d_replay_assess_v2_finalize($1,$2,$3,$4,$5,$6,$7) value', [...common, command.payload.caseId, command.expectedVersion, command.idempotencyKey, command.authorizationVersion]);
        else if (command.commandType === 'assessment_v2.finalize') {
          const d = command.serverDecision;
          result = await serviceQuery(`SELECT public.pr1d_finalize_assess_v2_case($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) value`, [...common, command.payload.caseId, command.expectedVersion, JSON.stringify(d.inputSnapshot), d.inputCanonical, JSON.stringify(d.evidenceSnapshot), d.evidenceCanonical, JSON.stringify(d.outputSnapshot), d.outputCanonical, d.inputHash, d.evidenceHash, d.outputHash, d.ruleSetVersion, d.decisionVersion, d.createdAt, command.requestId, command.idempotencyKey, command.authorizationVersion]);
        } else throw new Error('COMMAND_UNAVAILABLE');
        return controlled(result.rows[0]?.value, commandModule.AssessV2Error, {
          NOT_FOUND: 'RESOURCE_NOT_AVAILABLE', AUTHORIZATION_STALE: 'AUTHORITY_STALE',
        });
      },
    };
    const assessV1Dependencies = {
      authenticate: assessDependencies.authenticate,
      loadFreshAuthority: async input => {
        const authority = await authorityFor(input.actorId,input.organizationId,input.workspaceId);
        return authority ? { ...authority,permissions: authority.capabilities } : null;
      },
      loadAssessmentForFinalize: async input => {
        const row = (await serviceQuery(`SELECT id,process_id,version,responses FROM public.assessments
          WHERE id=$1 AND org_id=$2 AND workspace_id=$3 AND deleted_at IS NULL`,
        [input.assessmentId,input.organizationId,input.workspaceId])).rows[0];
        if (!row) return null;
        if (Number(row.version) !== input.expectedVersion) throw new assessCommandModule.AssessCommandError('VERSION_CONFLICT');
        const aggregate = row.responses;
        if (!aggregate || typeof aggregate !== 'object' || Array.isArray(aggregate)
          || !aggregate.responses || typeof aggregate.responses !== 'object' || Array.isArray(aggregate.responses)
          || !aggregate.metadata || typeof aggregate.metadata !== 'object' || Array.isArray(aggregate.metadata)) return null;
        return {
          assessmentId: row.id, processId: row.process_id, version: Number(row.version),
          responses: aggregate.responses, metadata: aggregate.metadata,
          evidenceItems: Array.isArray(aggregate.evidenceItems) ? aggregate.evidenceItems : [],
          assumptions: Array.isArray(aggregate.assumptions) ? aggregate.assumptions : [],
        };
      },
      executeAtomicCommand: async command => {
        const common = [command.actorId,command.organizationId,command.workspaceId];
        let result;
        if (command.commandType === 'assessment.create') {
          result = await serviceQuery('SELECT public.pr1b_create_assessment($1,$2,$3,$4,$5,$6,$7,$8) value',
            [...common,command.payload.processId,command.resourceId,command.requestId,command.idempotencyKey,command.authorizationVersion]);
        } else if (command.commandType === 'assessment.response.upsert') {
          result = await serviceQuery('SELECT public.pr1b_upsert_assessment_responses($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9) value',
            [...common,command.resourceId,JSON.stringify(command.payload),command.expectedVersion,command.requestId,command.idempotencyKey,command.authorizationVersion]);
        } else if (command.commandType === 'assessment.finalize') {
          const scores = command.payload.scores;
          result = await serviceQuery('SELECT public.pr1b_finalize_assessment($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10) value',
            [...common,command.resourceId,JSON.stringify(scores),scores.scoreVersion,command.expectedVersion,command.requestId,command.idempotencyKey,command.authorizationVersion]);
        } else throw new assessCommandModule.AssessCommandError('COMMAND_NOT_SUPPORTED');
        const value = result.rows[0]?.value;
        const mapping = { VERSION_CONFLICT: 'VERSION_CONFLICT',IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
          AUTHORIZATION_STALE: 'AUTHORITY_STALE',NOT_FOUND: 'RESOURCE_NOT_AVAILABLE',
          INVALID_COMMAND: 'INVALID_COMMAND',INVALID_SCORE_VERSION: 'INVALID_COMMAND' };
        if (value?.errorCode) throw new assessCommandModule.AssessCommandError(mapping[value.errorCode] ?? 'COMMAND_UNAVAILABLE');
        if (!value || !['committed','replayed'].includes(value.outcome) || !value.resource) {
          throw new assessCommandModule.AssessCommandError('COMMAND_UNAVAILABLE');
        }
        return { outcome: value.outcome,resource: value.resource };
      },
    };
    const reviewRpc = {
      'assessment_v2.review.assign': 'pr1e_assign_assess_v2_review',
      'assessment_v2.evidence.attest': 'pr1e_attest_assess_v2_evidence',
      'assessment_v2.review.resolve': 'pr1e_resolve_assess_v2_review',
      'assessment_v2.revision.start': 'pr1e_start_assess_v2_revision',
      'assessment_v2.govern.resolve': 'pr1e_resolve_assess_v2_govern',
      'assessment_v2.studio.handoff': 'pr1e_handoff_assess_v2_studio',
    };
    const reviewDependencies = {
      authenticate: assessDependencies.authenticate,
      loadFreshAuthority: assessDependencies.loadFreshAuthority,
      executeAtomicReviewCommand: async command => {
        const fn = reviewRpc[command.commandType];
        const result = await serviceQuery(`SELECT public.${fn}($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) value`, [command.actorId, command.organizationId, command.workspaceId, command.payload.caseId, command.payload.decisionId, command.expectedVersion, command.requestId, command.idempotencyKey, command.authorizationVersion, JSON.stringify(command.payload)]);
        const claim = controlled(result.rows[0]?.value, reviewCommandModule.AssessV2ReviewError, {
          NOT_FOUND: 'RESOURCE_NOT_AVAILABLE', AUTHORIZATION_STALE: 'AUTHORITY_STALE',
        });
        const resource = await actorTransaction(command.actorId, async () => (await db.query(
          'SELECT public.assess_v2_review_workspace($1,$2,$3) value',
          [command.organizationId, command.workspaceId, command.payload.caseId],
        )).rows[0]?.value ?? null);
        if (!resource) throw new reviewCommandModule.AssessV2ReviewError('RESOURCE_NOT_AVAILABLE');
        return { ...claim, resource };
      },
    };
    const studioDependencies = {
      authenticate: assessDependencies.authenticate,
      loadFreshAuthority: assessDependencies.loadFreshAuthority,
      executeAtomicCommand: command => studioDbModule.executeStudioAtomicCommand(command, studioGeneration.invoke),
      executeClaimedGeneration: studioGeneration.executeClaimedGeneration,
    };
    const processDependencies = {
      creation: {
        authenticate: assessDependencies.authenticate,
        authority: (request, actorId, envelope) => authorityFor(actorId,envelope.organizationId,envelope.workspaceId),
        atomic: async () => { throw new Error('COMMAND_UNAVAILABLE'); },
      },
      update: {
        authenticate: assessDependencies.authenticate,
        authority: async (request, actorId, envelope) => {
          const authority = await authorityFor(actorId,envelope.organizationId,envelope.workspaceId);
          return authority ? { ...authority, userId: authority.actorId } : null;
        },
        atomic: async (actorId,envelope) => (await serviceQuery(
          'SELECT public.update_assess_process($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) value',
          [actorId,envelope.organizationId,envelope.workspaceId,envelope.authorizationVersion,envelope.requestId,
            envelope.idempotencyKey,envelope.expectedVersion,envelope.payload.processId,envelope.payload.name,
            envelope.payload.description,envelope.payload.department,envelope.payload.criticality],
        )).rows[0]?.value,
      },
    };
    const studioDeliveryDependencies = request => ({
      authenticate: async () => ({ id: actorFromRequest(request) }),
      authority: async (actorId, organizationId, workspaceId, expectedAuthorizationVersion) => {
        const authority = await authorityFor(actorId,organizationId,workspaceId);
        if (!authority || authority.authorizationVersion !== expectedAuthorizationVersion) throw new Error('AUTHORIZATION_STALE');
        return { ...authority, userId: authority.actorId, roleNames: ['Lifecycle authority'] };
      },
      apply: async (actorId, command) => (await serviceQuery(
        'SELECT public.studio_delivery_apply_command($1,$2,$3,$4,$5,$6,$7,$8::jsonb) value',
        [actorId,command.organizationId,command.workspaceId,command.expectedAuthorizationVersion,command.requestId,
          command.idempotencyKey,command.action,JSON.stringify(command.payload)],
      )).rows[0]?.value,
      query: async (actorId, query) => (await serviceQuery(
        'SELECT public.studio_delivery_outcome_query($1,$2,$3,$4,$5,$6,$7) value',
        [actorId,query.organizationId,query.workspaceId,query.expectedAuthorizationVersion,query.projectId,query.limit,query.cursor],
      )).rows[0]?.value,
      packQuery: async (actorId, query) => (await serviceQuery(
        'SELECT public.studio_delivery_pack_snapshot_query($1,$2,$3,$4,$5) value',
        [actorId,query.organizationId,query.workspaceId,query.expectedAuthorizationVersion,query.projectId],
      )).rows[0]?.value,
      assigneeQuery: async (actorId, query) => (await serviceQuery(
        'SELECT public.studio_delivery_assignee_query($1,$2,$3,$4,$5) value',
        [actorId,query.organizationId,query.workspaceId,query.expectedAuthorizationVersion,query.projectId],
      )).rows[0]?.value,
    });
    const legacyDeliveryDependencies = request => ({
      authenticate: async () => ({ id: actorFromRequest(request) }),
      authority: studioDeliveryDependencies(request).authority,
      apply: async (actorId, command) => (await serviceQuery(
        'SELECT public.legacy_delivery_apply_command($1,$2,$3,$4,$5,$6,$7,$8::jsonb) value',
        [actorId,command.organizationId,command.workspaceId,command.expectedAuthorizationVersion,command.requestId,
          command.idempotencyKey,command.action,JSON.stringify(command.payload)],
      )).rows[0]?.value,
      query: async (actorId, query) => (await serviceQuery(
        'SELECT public.legacy_delivery_query($1,$2,$3,$4,$5,$6,$7,$8,$9) value',
        [actorId,query.organizationId,query.workspaceId,query.expectedAuthorizationVersion,query.projectId,
          query.limit,query.cursor,query.sourceGenerationId,query.includeRetained],
      )).rows[0]?.value,
    });

    const executeAssess = async (body, token = 'enterprise-author-token') => {
      const request = new Request('http://fixture/functions/v1/assess-v2-command', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
      try {
        const raw = body.commandType.startsWith('assessment_v2.review.') || body.commandType === 'assessment_v2.evidence.attest' || body.commandType === 'assessment_v2.revision.start' || body.commandType === 'assessment_v2.govern.resolve' || body.commandType === 'assessment_v2.studio.handoff'
          ? await reviewHandlerModule.executeAssessV2ReviewCommand(request, reviewCommandModule.parseAssessV2ReviewEnvelope(body), reviewDependencies)
          : await handlerModule.executeAssessV2Command(request, commandModule.parseAssessV2Envelope(body), assessDependencies);
        return { status: 200, body: { ok: true, ...raw } };
      } catch (error) {
        const code = error?.code ?? error?.message ?? 'COMMAND_UNAVAILABLE';
        const statuses = { AUTHENTICATION_REQUIRED: 401, PERMISSION_DENIED: 403, RESOURCE_NOT_AVAILABLE: 404, AUTHORITY_STALE: 409, VERSION_CONFLICT: 409, IDEMPOTENCY_CONFLICT: 409, INVALID_COMMAND: 400, FEATURE_DISABLED: 503, READ_ONLY: 503 };
        return { status: statuses[code] ?? 503, body: { ok: false, error: { code, message: 'The command could not be completed.' } } };
      }
    };
    const executeStudio = request => studioHandlerModule.handleStudioArtifactCommand(request, studioDependencies);

    const defaultContext = async actor => ({
      organizationId: ids.organization, workspaceId: ids.workspace,
      authorizationVersion: (await authorityFor(actor, ids.organization, ids.workspace)).authorizationVersion,
      capabilities: (await authorityFor(actor, ids.organization, ids.workspace)).capabilities,
    });

    const selectRows = async (pathname, searchParams, actor) => {
      const relation = pathname.replace('/rest/v1/', '');
      if (![
        'projects', 'document_generations', 'delivery_work_items', 'assess_processes', 'assessments', 'assess_v2_cases', 'assess_v2_case_versions', 'assess_v2_decision_versions',
        'assess_v2_primitives', 'assess_v2_edges', 'assess_v2_decision_points', 'assess_v2_exception_paths',
        'assess_v2_application_assets', 'assess_v2_application_interactions', 'assess_v2_evidence_links',
      ].includes(relation)) throw new Error('PROJECTION_UNAVAILABLE');
      // Preserve the actual client's requested projection, filters and ordering.
      // Tenant filtering belongs to the real authenticated-role RLS policies.
      const columns = searchParams.get('select') ?? '*';
      if (columns !== '*' && !/^[a-z_][a-z0-9_]*(?:,[a-z_][a-z0-9_]*)*$/u.test(columns)) throw new Error('PROJECTION_UNAVAILABLE');
      const filters = []; const values = [];
      for (const [key, raw] of searchParams) {
        if (['select', 'order', 'limit'].includes(key)) continue;
        if (!/^[a-z_][a-z0-9_]*$/u.test(key)) throw new Error('PROJECTION_UNAVAILABLE');
        if (raw === 'is.null') { filters.push(`${key} IS NULL`); continue; }
        const inMatch = /^in\.\(([a-z0-9_]+(?:,[a-z0-9_]+)*)\)$/iu.exec(raw);
        if (inMatch) {
          values.push(inMatch[1].split(','));
          filters.push(`${key}::text=ANY($${values.length}::text[])`);
          continue;
        }
        const match = /^(eq|neq)\.(.+)$/u.exec(raw);
        if (!match) throw new Error('PROJECTION_UNAVAILABLE');
        values.push(match[2]); filters.push(`${key}${match[1] === 'eq' ? '=' : '<>'}$${values.length}`);
      }
      const limit = Number(searchParams.get('limit') ?? '1000');
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new Error('PROJECTION_UNAVAILABLE');
      const order = searchParams.get('order');
      const orderedColumns = order ? order.split(',').map(item => {
        const match = /^([a-z_][a-z0-9_]*)\.(asc|desc)$/u.exec(item);
        if (!match) throw new Error('PROJECTION_UNAVAILABLE');
        return `${match[1]} ${match[2].toUpperCase()}`;
      }) : [];
      const where = filters.length ? ` WHERE ${filters.join(' AND ')}` : '';
      const orderBy = orderedColumns.length ? ` ORDER BY ${orderedColumns.join(',')}` : '';
      values.push(limit);
      // PostgREST serializes PostgreSQL values through JSON. In particular, its
      // safe bigint case versions are JSON numbers; node-postgres otherwise
      // exposes int8 columns as strings and would make a valid reloaded draft
      // fail the production command envelope's integer check.
      return actorTransaction(actor, async () => (await db.query(
        `SELECT to_jsonb(projected) value FROM(SELECT ${columns} FROM public.${relation}${where}${orderBy} LIMIT $${values.length}) projected`, values,
      )).rows.map(row => row.value));
    };

    const rpcProjection = async (name, body, actor) => {
      if (name === 'assess_v2_review_queue') return actorTransaction(actor, async () => (await db.query('SELECT public.assess_v2_review_queue($1,$2) value', [body.p_org_id, body.p_workspace_id])).rows.map(row => row.value));
      if (name === 'assess_v2_review_workspace') return actorTransaction(actor, async () => (await db.query('SELECT public.assess_v2_review_workspace($1,$2,$3) value', [body.p_org_id, body.p_workspace_id, body.p_case_id])).rows[0]?.value ?? null);
      if (name === 'assess_v2_eligible_reviewers') return actorTransaction(actor, async () => (await db.query('SELECT public.assess_v2_eligible_reviewers($1,$2,$3,$4) value', [body.p_org_id, body.p_workspace_id, body.p_case_id, body.p_decision_id])).rows.map(row => row.value));
      if (name === 'studio_artifact_handoffs') return actorTransaction(actor, async () => (await db.query('SELECT public.studio_artifact_handoffs($1,$2) value', [body.p_org_id, body.p_workspace_id])).rows.map(row => row.value));
      if (name === 'studio_artifact_projection') return actorTransaction(actor, async () => (await db.query('SELECT public.studio_artifact_projection($1,$2,$3,$4) value', [body.p_org_id, body.p_workspace_id, body.p_handoff_id, body.p_artifact_type])).rows[0]?.value ?? null);
      if (name === 'studio_artifact_eligible_reviewers') return actorTransaction(actor, async () => (await db.query('SELECT public.studio_artifact_eligible_reviewers($1,$2,$3,$4) value', [body.p_org_id, body.p_workspace_id, body.p_artifact_id, body.p_artifact_version_id])).rows.map(row => row.value));
      if (name === 'studio_private_artifact_projection') return actorTransaction(actor, async () => (await db.query('SELECT public.studio_private_artifact_projection($1,$2,$3) value', [body.p_org, body.p_workspace, body.p_artifact_version])).rows[0]?.value ?? null);
      const studioProjection = {
        enterprise_transcript_module_projection: ['SELECT public.enterprise_transcript_module_projection($1,$2,$3) value', [body.p_org, body.p_workspace, body.p_owner_module]],
        studio_tenant_template_projection: ['SELECT public.studio_tenant_template_projection($1,$2) value', [body.p_org, body.p_workspace]],
        enterprise_assess_studio_handoff_projection: ['SELECT public.enterprise_assess_studio_handoff_projection($1,$2) value', [body.p_org, body.p_workspace]],
        studio_artifact_projection_v2: ['SELECT public.studio_artifact_projection_v2($1,$2,$3) value', [body.p_org, body.p_workspace, body.p_artifact]],
        studio_artifact_source_package_projection: ['SELECT public.studio_artifact_source_package_projection($1,$2,$3) value', [body.p_org, body.p_workspace, body.p_artifact]],
        studio_artifact_workspace_projection_v2: ['SELECT public.studio_artifact_workspace_projection_v2($1,$2,$3,$4,$5) value', [body.p_org, body.p_workspace, body.p_artifact, body.p_source_offset ?? 0, body.p_source_limit ?? 20]],
        studio_artifact_summary_projection_v2: ['SELECT public.studio_artifact_summary_projection_v2($1,$2,$3,$4) value', [body.p_org, body.p_workspace, body.p_offset ?? 0, body.p_limit ?? 20]],
      }[name];
      if (studioProjection) return actorTransaction(actor, async () => (await db.query(studioProjection[0], studioProjection[1])).rows[0]?.value ?? null);
      throw new Error('PROJECTION_UNAVAILABLE');
    };

    let setupSequence = 0;
    const projectSetups = new Map();
    const foreignOutcomeProbes = new Map();

    const downstreamFrame = async projectName => {
      const setup = projectSetups.get(projectName);
      if (!setup) return null;
      const publication = (await db.query(`SELECT
          publication.id publication_id,publication.document_generation_id,publication.project_id,
          publication.studio_artifact_id,publication.studio_artifact_version_id,
          publication.source_process_id,publication.source_assessment_id,
          publication.work_item_digest,publication.work_item_count
        FROM public.studio_delivery_publications publication
        WHERE publication.org_id=$1 AND publication.workspace_id=$2 AND publication.project_id=$3
        ORDER BY publication.published_at DESC,publication.id DESC LIMIT 1`,
      [ids.organization,ids.workspace,setup.projectId])).rows[0] ?? null;
      const tasks = (await db.query(`SELECT item.id,item.authority_version version,item.title,item.description,item.status,item.project_id,
          item.document_generation_id,item.legacy_import_id import_id,item.source_process_id,item.source_assessment_id,
          item.source_item_index,item.retention_state,
          COALESCE((SELECT jsonb_agg(binding.assignee_id ORDER BY binding.assignee_id)
            FROM public.legacy_delivery_work_item_assignees binding WHERE binding.work_item_id=item.id),'[]'::jsonb) assignee_ids
        FROM public.delivery_work_items item
        WHERE item.org_id=$1 AND item.workspace_id=$2 AND item.project_id=$3 AND item.authority_version IS NOT NULL
        ORDER BY item.source_item_index NULLS LAST,item.id`, [ids.organization,ids.workspace,setup.projectId])).rows;
      const outcomes = (await db.query(`SELECT aggregate.id outcome_id,version.version,version.task_id,version.task_version,
          version.status,version.label,version.detail,version.document_generation_id,version.legacy_import_id import_id,
          version.studio_artifact_version_id
        FROM public.legacy_delivery_outcome_aggregates aggregate
        JOIN public.legacy_delivery_outcome_versions version ON version.outcome_id=aggregate.id
        WHERE aggregate.org_id=$1 AND aggregate.workspace_id=$2 AND aggregate.project_id=$3
        ORDER BY aggregate.id,version.version`, [ids.organization,ids.workspace,setup.projectId])).rows;
      const latestPack = (await db.query(`SELECT id,version,project_id,task_count,bound_task_count,task_set_hash,receipt_id,audit_event_id
        FROM public.legacy_delivery_pack_snapshots
        WHERE org_id=$1 AND workspace_id=$2 AND project_id=$3
        ORDER BY version DESC,id DESC LIMIT 1`, [ids.organization,ids.workspace,setup.projectId])).rows[0] ?? null;
      const counts = (await db.query(`SELECT
          (SELECT count(*)::int FROM public.studio_delivery_publications WHERE org_id=$1 AND workspace_id=$2 AND project_id=$3) publications,
          (SELECT count(*)::int FROM public.document_generations WHERE org_id=$1 AND workspace_id=$2 AND project_id=$3 AND studio_delivery_publication_id IS NOT NULL) document_generations,
          (SELECT count(*)::int FROM public.legacy_delivery_imports WHERE org_id=$1 AND workspace_id=$2 AND project_id=$3) imports,
          (SELECT count(*)::int FROM public.delivery_work_items WHERE org_id=$1 AND workspace_id=$2 AND project_id=$3 AND authority_version IS NOT NULL AND retention_state='active') active_tasks,
          (SELECT count(*)::int FROM public.delivery_work_items WHERE org_id=$1 AND workspace_id=$2 AND project_id=$3 AND authority_version IS NOT NULL AND retention_state IN('soft_deleted','retained')) retained_tasks,
          (SELECT count(*)::int FROM public.legacy_delivery_outcome_aggregates WHERE org_id=$1 AND workspace_id=$2 AND project_id=$3) outcome_aggregates,
          (SELECT count(*)::int FROM public.legacy_delivery_outcome_versions WHERE org_id=$1 AND workspace_id=$2 AND project_id=$3) outcome_versions,
          (SELECT count(*)::int FROM public.legacy_delivery_pack_snapshots WHERE org_id=$1 AND workspace_id=$2 AND project_id=$3) pack_snapshots,
          (SELECT count(*)::int FROM public.studio_delivery_command_receipts receipt WHERE receipt.org_id=$1 AND receipt.workspace_id=$2 AND receipt.resource_id IN(
             SELECT id FROM public.studio_delivery_publications WHERE project_id=$3
             UNION SELECT id FROM public.legacy_delivery_outcome_versions WHERE project_id=$3
             UNION SELECT id FROM public.legacy_delivery_pack_snapshots WHERE project_id=$3
           ))+(SELECT count(*)::int FROM public.legacy_delivery_command_receipts receipt WHERE receipt.org_id=$1 AND receipt.workspace_id=$2 AND receipt.resource_id IN(
             SELECT id FROM public.legacy_delivery_imports WHERE project_id=$3
             UNION SELECT id FROM public.delivery_work_items WHERE project_id=$3
           )) command_receipts,
          (SELECT count(*)::int FROM public.privileged_audit_events audit WHERE audit.org_id=$1 AND audit.workspace_id=$2 AND audit.resource_id IN(
             SELECT id FROM public.studio_delivery_publications WHERE project_id=$3
             UNION SELECT id FROM public.legacy_delivery_outcome_versions WHERE project_id=$3
             UNION SELECT id FROM public.legacy_delivery_pack_snapshots WHERE project_id=$3
             UNION SELECT id FROM public.legacy_delivery_imports WHERE project_id=$3
             UNION SELECT id FROM public.delivery_work_items WHERE project_id=$3
           )) audits`, [ids.organization,ids.workspace,setup.projectId])).rows[0];
      const lineage = (await db.query(`SELECT
          count(task.id)::int chain_count,
          count(task.id) FILTER(WHERE publication.source_process_id=project.source_process_id
            AND publication.source_assessment_id=project.source_assessment_id
            AND generation.id=publication.document_generation_id
            AND imported.source_generation_id=generation.id
            AND imported.source_process_id=publication.source_process_id
            AND imported.source_assessment_id=publication.source_assessment_id
            AND task.document_generation_id=generation.id
            AND task.legacy_import_id=imported.id
            AND task.source_process_id=publication.source_process_id
            AND task.source_assessment_id=publication.source_assessment_id)::int complete_count
        FROM public.projects project
        LEFT JOIN public.studio_delivery_publications publication ON publication.project_id=project.id
        LEFT JOIN public.document_generations generation ON generation.id=publication.document_generation_id
        LEFT JOIN public.legacy_delivery_imports imported ON imported.source_generation_id=generation.id AND imported.project_id=project.id
        LEFT JOIN public.delivery_work_items task ON task.legacy_import_id=imported.id AND task.project_id=project.id
        WHERE project.id=$1 AND project.org_id=$2`, [setup.projectId,ids.organization])).rows[0];
      const protections = (await db.query(`SELECT
          EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.studio_delivery_publications'::regclass AND tgname='studio_delivery_publication_immutable' AND NOT tgisinternal) publication_immutable,
          EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.legacy_delivery_outcome_versions'::regclass AND tgname='legacy_delivery_outcome_version_immutable' AND NOT tgisinternal) outcome_version_immutable,
          EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.legacy_delivery_imports'::regclass AND contype='f') import_lineage_protected`, [])).rows[0];
      const state = { publication, tasks, outcomes, latestPack };
      return {
        projectName,
        counts: {
          publications: counts.publications, documentGenerations: counts.document_generations, imports: counts.imports,
          activeTasks: counts.active_tasks, retainedTasks: counts.retained_tasks,
          outcomeAggregates: counts.outcome_aggregates, outcomeVersions: counts.outcome_versions,
          commandReceipts: counts.command_receipts, audits: counts.audits, packSnapshots: counts.pack_snapshots,
        },
        publication: publication ? {
          publicationId: publication.publication_id, documentGenerationId: publication.document_generation_id,
          projectId: publication.project_id, artifactId: publication.studio_artifact_id,
          artifactVersionId: publication.studio_artifact_version_id, sourceProcessId: publication.source_process_id,
          sourceAssessmentId: publication.source_assessment_id, workItemDigest: publication.work_item_digest,
          workItemCount: publication.work_item_count,
        } : null,
        tasks: tasks.map(item => ({
          id: item.id, version: Number(item.version), title: item.title, description: item.description, status: item.status,
          assigneeIds: item.assignee_ids, projectId: item.project_id, documentGenerationId: item.document_generation_id,
          importId: item.import_id, sourceProcessId: item.source_process_id, sourceAssessmentId: item.source_assessment_id,
          sourceItemIndex: item.source_item_index, retentionState: item.retention_state,
        })),
        outcomes: outcomes.map(item => ({
          outcomeId: item.outcome_id, version: Number(item.version), taskId: item.task_id,
          taskVersion: Number(item.task_version), status: item.status, label: item.label, detail: item.detail,
          documentGenerationId: item.document_generation_id, importId: item.import_id,
          artifactVersionId: item.studio_artifact_version_id,
        })),
        latestPack: latestPack ? {
          id: latestPack.id, version: Number(latestPack.version), projectId: latestPack.project_id,
          taskCount: latestPack.task_count, boundTaskCount: latestPack.bound_task_count,
          taskSetHash: latestPack.task_set_hash, receiptId: latestPack.receipt_id,
          auditEventId: latestPack.audit_event_id,
        } : null,
        lineage: {
          chainCount: lineage.chain_count,
          completeCount: lineage.complete_count,
          complete: lineage.chain_count > 0 && lineage.chain_count === lineage.complete_count,
          digest: sha256(JSON.stringify(state)),
        },
        protections: {
          publicationImmutable: protections.publication_immutable === true,
          outcomeVersionImmutable: protections.outcome_version_immutable === true,
          importLineageProtected: protections.import_lineage_protected === true,
        },
        foreignProbe: foreignOutcomeProbes.get(setup.projectId) ?? null,
        writeFingerprint: sha256(JSON.stringify(state)),
      };
    };

    const assessV2Frame = async projectName => {
      const setup = projectSetups.get(projectName);
      if (!setup) return null;
      const cases = (await db.query(`SELECT id,status,version,head_version_id,rule_set_version,source_v1_assessment_id
        FROM public.assess_v2_cases
        WHERE org_id=$1 AND workspace_id=$2 AND process_id=$3 AND deleted_at IS NULL
        ORDER BY id`, [ids.organization,ids.workspace,setup.processId])).rows;
      const caseIds = cases.map(item => item.id);
      const versions = caseIds.length ? (await db.query(`SELECT id,case_id,version,name,description
        FROM public.assess_v2_case_versions WHERE case_id=ANY($1::uuid[]) ORDER BY case_id,version`, [caseIds])).rows : [];
      const decisions = caseIds.length ? (await db.query(`SELECT id,case_id,source_version_id,decision_version,input_hash,evidence_hash,output_hash
        FROM public.assess_v2_decision_versions WHERE case_id=ANY($1::uuid[]) ORDER BY case_id,created_at,id`, [caseIds])).rows : [];
      const counts = (await db.query(`SELECT
        (SELECT count(*)::int FROM public.assess_command_receipts WHERE org_id=$1 AND workspace_id=$2) receipts,
        (SELECT count(*)::int FROM public.privileged_audit_events WHERE org_id=$1 AND workspace_id=$2) audits`,
      [ids.organization,ids.workspace])).rows[0];
      return {
        caseCount: cases.length,
        decisionCount: decisions.length,
        receipts: counts.receipts,
        audits: counts.audits,
        targetHash: sha256(JSON.stringify({ cases,versions,decisions })),
      };
    };

    const lifecycleFrame = async projectName => {
      const setup = projectSetups.get(projectName);
      if (!setup) return null;
      const row = (await db.query(`WITH project_cases AS(
          SELECT id FROM public.assess_v2_cases WHERE org_id=$1 AND workspace_id=$2 AND process_id=$3 AND deleted_at IS NULL
        ), project_artifacts AS(
          SELECT artifact.id FROM public.studio_artifact_aggregates artifact JOIN project_cases assessed ON assessed.id=artifact.case_id
        ), state AS(
          SELECT jsonb_build_object(
            'v1Assessments',(SELECT COALESCE(jsonb_agg(to_jsonb(item) ORDER BY item.created_at,item.id),'[]'::jsonb) FROM public.assessments item WHERE item.org_id=$1 AND item.workspace_id=$2 AND item.process_id=$3 AND item.deleted_at IS NULL),
            'cases',(SELECT COALESCE(jsonb_agg(to_jsonb(item) ORDER BY item.id),'[]'::jsonb) FROM public.assess_v2_cases item JOIN project_cases scope ON scope.id=item.id),
            'versions',(SELECT COALESCE(jsonb_agg(to_jsonb(item) ORDER BY item.case_id,item.version),'[]'::jsonb) FROM public.assess_v2_case_versions item JOIN project_cases scope ON scope.id=item.case_id),
            'decisions',(SELECT COALESCE(jsonb_agg(to_jsonb(item) ORDER BY item.case_id,item.created_at,item.id),'[]'::jsonb) FROM public.assess_v2_decision_versions item JOIN project_cases scope ON scope.id=item.case_id),
            'assignments',(SELECT COALESCE(jsonb_agg(to_jsonb(item) ORDER BY item.case_id,item.assigned_at,item.id),'[]'::jsonb) FROM public.assess_v2_review_assignments item JOIN project_cases scope ON scope.id=item.case_id),
            'attestations',(SELECT COALESCE(jsonb_agg(to_jsonb(item) ORDER BY item.case_id,item.reviewed_at,item.id),'[]'::jsonb) FROM public.assess_v2_evidence_attestations item JOIN project_cases scope ON scope.id=item.case_id),
            'reviews',(SELECT COALESCE(jsonb_agg(to_jsonb(item) ORDER BY item.case_id,item.resolved_at,item.id),'[]'::jsonb) FROM public.assess_v2_review_resolutions item JOIN project_cases scope ON scope.id=item.case_id),
            'govern',(SELECT COALESCE(jsonb_agg(to_jsonb(item) ORDER BY item.case_id,item.resolved_at,item.id),'[]'::jsonb) FROM public.assess_v2_govern_resolutions item JOIN project_cases scope ON scope.id=item.case_id),
            'handoffs',(SELECT COALESCE(jsonb_agg(to_jsonb(item) ORDER BY item.case_id,item.handed_off_at,item.id),'[]'::jsonb) FROM public.assess_v2_studio_handoffs item JOIN project_cases scope ON scope.id=item.case_id),
            'packages',(SELECT COALESCE(jsonb_agg(to_jsonb(item) ORDER BY item.created_at,item.id),'[]'::jsonb) FROM public.studio_artifact_source_packages item JOIN project_artifacts artifact ON artifact.id=item.artifact_id),
            'artifacts',(SELECT COALESCE(jsonb_agg(to_jsonb(item) ORDER BY item.created_at,item.id),'[]'::jsonb) FROM public.studio_artifact_aggregates item JOIN project_artifacts artifact ON artifact.id=item.id),
            'artifactVersions',(SELECT COALESCE(jsonb_agg(to_jsonb(item) ORDER BY item.artifact_id,item.version),'[]'::jsonb) FROM public.studio_artifact_versions item JOIN project_artifacts artifact ON artifact.id=item.artifact_id)
          ) value
        ) SELECT
          (SELECT count(*)::int FROM public.assessments item WHERE item.org_id=$1 AND item.workspace_id=$2 AND item.process_id=$3 AND item.deleted_at IS NULL) v1_assessments,
          (SELECT COALESCE(sum(item.version),0)::int FROM public.assessments item WHERE item.org_id=$1 AND item.workspace_id=$2 AND item.process_id=$3 AND item.deleted_at IS NULL) v1_assessment_versions,
          (SELECT count(*)::int FROM public.assessments item WHERE item.org_id=$1 AND item.workspace_id=$2 AND item.process_id=$3 AND item.deleted_at IS NULL AND item.status='Ready for Review' AND item.scores IS NOT NULL) v1_ready_assessments,
          (SELECT count(*)::int FROM project_cases) cases,
          (SELECT count(*)::int FROM public.assess_v2_case_versions item JOIN project_cases scope ON scope.id=item.case_id) case_versions,
          (SELECT count(*)::int FROM public.assess_v2_decision_versions item JOIN project_cases scope ON scope.id=item.case_id) decisions,
          (SELECT count(*)::int FROM public.assess_v2_review_assignments item JOIN project_cases scope ON scope.id=item.case_id) assignments,
          (SELECT count(*)::int FROM public.assess_v2_evidence_attestations item JOIN project_cases scope ON scope.id=item.case_id) attestations,
          (SELECT count(*)::int FROM public.assess_v2_review_resolutions item JOIN project_cases scope ON scope.id=item.case_id WHERE item.resolution='changes_requested') changes_requested,
          (SELECT count(*)::int FROM public.assess_v2_review_resolutions item JOIN project_cases scope ON scope.id=item.case_id WHERE item.resolution='rejected') rejected_reviews,
          (SELECT count(*)::int FROM public.assess_v2_review_resolutions item JOIN project_cases scope ON scope.id=item.case_id WHERE item.resolution='approved') approved_reviews,
          (SELECT count(*)::int FROM public.assess_v2_govern_resolutions item JOIN project_cases scope ON scope.id=item.case_id) govern_resolutions,
          (SELECT count(*)::int FROM public.assess_v2_studio_handoffs item JOIN project_cases scope ON scope.id=item.case_id) handoffs,
          (SELECT count(*)::int FROM public.studio_artifact_source_packages item JOIN project_artifacts artifact ON artifact.id=item.artifact_id) source_packages,
          (SELECT count(*)::int FROM project_artifacts) artifacts,
          (SELECT count(*)::int FROM public.studio_artifact_generation_attempts item JOIN project_artifacts artifact ON artifact.id=item.artifact_id) generation_attempts,
          (SELECT count(*)::int FROM public.studio_artifact_versions item JOIN project_artifacts artifact ON artifact.id=item.artifact_id) artifact_versions,
          ((SELECT count(*) FROM public.assess_command_receipts WHERE org_id=$1 AND workspace_id=$2)
            +(SELECT count(*) FROM public.studio_artifact_command_receipts WHERE org_id=$1 AND workspace_id=$2))::int receipts,
          (SELECT count(*)::int FROM public.privileged_audit_events WHERE org_id=$1 AND workspace_id=$2) audits,
          (SELECT value FROM state) target
        `, [ids.organization,ids.workspace,setup.processId])).rows[0];
      return {
        v1Assessments: row.v1_assessments, v1AssessmentVersions: row.v1_assessment_versions,
        v1ReadyAssessments: row.v1_ready_assessments,
        cases: row.cases, caseVersions: row.case_versions, decisions: row.decisions,
        assignments: row.assignments, attestations: row.attestations,
        changesRequested: row.changes_requested, rejectedReviews: row.rejected_reviews,
        approvedReviews: row.approved_reviews, governResolutions: row.govern_resolutions,
        handoffs: row.handoffs, sourcePackages: row.source_packages,
        artifacts: row.artifacts, generationAttempts: row.generation_attempts, artifactVersions: row.artifact_versions,
        receipts: row.receipts, audits: row.audits,
        targetHash: sha256(JSON.stringify(row.target)),
      };
    };

    const route = async request => {
      const url = new URL(request.url);
      const cors = { 'access-control-allow-origin': request.headers.get('origin') ?? '*', 'access-control-allow-headers': 'authorization,apikey,content-type,x-client-info,x-enterprise-lifecycle-control', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
      if (url.pathname === '/health') return json({ ok: true, schemaVersion: evidence.schemaVersion, journeyBinding }, 200, cors);
      if (url.pathname.startsWith('/control/')) {
        if (request.headers.get('x-enterprise-lifecycle-control') !== controlToken) return json({ error: 'CONTROL_DENIED' }, 403, cors);
        if (url.pathname === '/control/setup') {
          const setup = await request.json().catch(() => ({}));
          setupSequence += 1;
          const projectName = typeof setup.projectName === 'string' && setup.projectName.trim() ? setup.projectName.trim() : `project-${setupSequence}`;
          const projectProcessId = randomUUID();
          const deliveryProjectId = randomUUID();
          const controlsReset = controlsPostgres.resetProjectState();
          if (!controlsReset.secretBackendCleared) throw new Error('AUTHENTICATED_CONTROLS_PROJECT_RESET_FAILED');
          await db.query('UPDATE public.organization_members SET role_id=$3 WHERE org_id=$1 AND user_id=$2',
            [ids.organization,ids.reviewer,ids.role]);
          await db.query("DELETE FROM public.role_capabilities WHERE role_id=$1 AND capability_key='operations.read'", [ids.role]);
          await db.query(`UPDATE public.ai_provider_key_refs SET
            resolver_type='server_reference',secret_ref='fixture/provider/reference',safe_label='Lifecycle synthetic adapter',status='active'
            WHERE id=$1 AND org_id=$2`, [ids.providerKeyRef,ids.organization]);
          await db.query(`UPDATE public.ai_provider_configs SET
            provider='openai',display_name='Lifecycle synthetic adapter',key_ref_id=$3,
            default_model='fixture-model',model_allowlist=ARRAY['fixture-model'],endpoint_url='https://invalid.example',
            allowed_modes=ARRAY['pilot'],allowed_operations=ARRAY['generate_document'],status='active',deleted_at=NULL
            WHERE id=$1 AND org_id=$2`, [ids.providerConfig,ids.organization,ids.providerKeyRef]);
          await db.query(`UPDATE public.enterprise_ai_capability_routes SET
            provider_config_id=$4,capability='studio.document.generate',model='fixture-model',enabled=true,
            allowed_roles=ARRAY[$5::text],version=1,deleted_at=NULL
            WHERE id=$1 AND org_id=$2 AND workspace_id=$3`,
          [ids.studioRoute,ids.organization,ids.workspace,ids.providerConfig,ids.role]);
          await db.query(`DELETE FROM public.pilot_operations_environments
            WHERE org_id=$1 AND workspace_id=$2 AND environment_type='pilot_candidate'`,
          [ids.organization,ids.workspace]);
          await db.query("INSERT INTO assess_processes(id,org_id,workspace_id,name,status,owner_id,created_by,updated_by) VALUES($1,$2,$3,$4,'Draft',$5,$5,$5)", [projectProcessId, ids.organization, ids.workspace, `${projectName} connected lifecycle`, ids.author]);
          await db.query("INSERT INTO projects(id,org_id,workspace_id,name,owner_id,created_by,updated_by,source_process_id) VALUES($1,$2,$3,$4,$5,$5,$5,$6)", [deliveryProjectId, ids.organization, ids.workspace, `${projectName} delivery project`, ids.author, projectProcessId]);
          projectSetups.set(projectName, { processId: projectProcessId, projectId: deliveryProjectId });
          const projectAliases = Object.fromEntries(Object.entries(aliases).map(([key, value]) => [key, `${value}-${setupSequence}`]));
          return json({ executionId, journeyBinding, projectName, projectSequence: setupSequence,
            deliveryProject: { id: deliveryProjectId, name: `${projectName} delivery project` },
            aliases: { ...projectAliases, process: `${projectName} connected lifecycle` }, actors: {
          author: { token: 'enterprise-author-token', user: { id: ids.author, email: 'author@fixture.invalid' } },
          reviewer: { token: 'enterprise-reviewer-token', user: { id: ids.reviewer, email: 'reviewer@fixture.invalid' } },
          approver: { token: 'enterprise-approver-token', user: { id: ids.approver, email: 'approver@fixture.invalid' } },
          outsider: { token: 'enterprise-outsider-token', user: { id: ids.outsider, email: 'outsider@fixture.invalid' } },
          } }, 200, cors);
        }
        if (url.pathname === '/control/process-update-capability') {
          const input = await request.json().catch(() => ({}));
          if (input.enabled === true) await db.query("INSERT INTO role_capabilities(role_id,capability_key) VALUES($1,'assess.process.update') ON CONFLICT DO NOTHING", [ids.role]);
          else if (input.enabled === false) await db.query("DELETE FROM role_capabilities WHERE role_id=$1 AND capability_key='assess.process.update'", [ids.role]);
          else return json({ error: 'CONTROL_INVALID' },400,cors);
          return json({ enabled: input.enabled },200,cors);
        }
        if (url.pathname === '/control/process-frame') {
          const input = await request.json().catch(() => ({}));
          const setup = projectSetups.get(input.projectName);
          if (!setup) return json({ error: 'PROJECT_NOT_FOUND' },404,cors);
          const value = (await db.query(`SELECT
              to_jsonb(process) target,
              (SELECT count(*)::int FROM public.assess_command_receipts WHERE command_type='process.update') receipts,
              (SELECT count(*)::int FROM public.privileged_audit_events WHERE action='process.update') audits
            FROM public.assess_processes process WHERE process.id=$1`, [setup.processId])).rows[0];
          return json({ receipts:value.receipts,audits:value.audits,targetHash:sha256(JSON.stringify(value.target)) },200,cors);
        }
        if (url.pathname === '/control/assess-v2-runtime') {
          const input = await request.json().catch(() => ({}));
          if (typeof input.enabled !== 'boolean') return json({ error: 'CONTROL_INVALID' },400,cors);
          await db.query('UPDATE public.assess_v2_runtime_control SET enabled=$1 WHERE singleton=true', [input.enabled]);
          return json({ enabled: input.enabled },200,cors);
        }
        if (url.pathname === '/control/assess-v2-frame') {
          const input = await request.json().catch(() => ({}));
          const frame = await assessV2Frame(input.projectName);
          return frame ? json(frame,200,cors) : json({ error: 'PROJECT_NOT_FOUND' },404,cors);
        }
        if (url.pathname === '/control/lifecycle-frame') {
          const input = await request.json().catch(() => ({}));
          const frame = await lifecycleFrame(input.projectName);
          return frame ? json(frame,200,cors) : json({ error: 'PROJECT_NOT_FOUND' },404,cors);
        }
        if (url.pathname === '/control/fail-next-studio-provider') {
          studioGeneration.failNextProviderCall();
          return json({ armed: true },200,cors);
        }
        if (url.pathname === '/control/studio-failure-frame') {
          const input = await request.json().catch(() => ({}));
          const setup = projectSetups.get(input.projectName);
          if (!setup) return json({ error: 'PROJECT_NOT_FOUND' },404,cors);
          const value = (await db.query(`WITH artifacts AS(
              SELECT artifact.* FROM public.studio_artifact_aggregates artifact
              JOIN public.assess_v2_cases assessed ON assessed.id=artifact.case_id
              WHERE assessed.process_id=$1 AND artifact.org_id=$2 AND artifact.workspace_id=$3
            ), target AS(
              SELECT (to_jsonb(artifact)-'aggregate_version'-'updated_at')||jsonb_build_object(
                'versions',(SELECT COALESCE(jsonb_agg(to_jsonb(version) ORDER BY version.version),'[]'::jsonb)
                  FROM public.studio_artifact_versions version WHERE version.artifact_id=artifact.id)) value
              FROM artifacts artifact ORDER BY artifact.id LIMIT 1
            ) SELECT
              (SELECT count(*)::int FROM artifacts) artifacts,
              COALESCE((SELECT aggregate_version FROM artifacts ORDER BY id LIMIT 1),0)::int aggregate_version,
              (SELECT count(*)::int FROM public.studio_artifact_versions version JOIN artifacts artifact ON artifact.id=version.artifact_id) versions,
              (SELECT count(*)::int FROM public.studio_artifact_generation_attempts attempt JOIN artifacts artifact ON artifact.id=attempt.artifact_id) attempts,
              (SELECT count(*)::int FROM public.studio_artifact_command_receipts receipt WHERE receipt.resource_id IN(
                SELECT id FROM artifacts UNION SELECT attempt.id FROM public.studio_artifact_generation_attempts attempt JOIN artifacts artifact ON artifact.id=attempt.artifact_id
              )) receipts,
              (SELECT count(*)::int FROM public.privileged_audit_events audit WHERE audit.resource_id IN(
                SELECT id FROM artifacts UNION SELECT attempt.id FROM public.studio_artifact_generation_attempts attempt JOIN artifacts artifact ON artifact.id=attempt.artifact_id
              )) audits,
              COALESCE((SELECT value FROM target),'{}'::jsonb) target`,
          [setup.processId,ids.organization,ids.workspace])).rows[0];
          return json({ artifacts:value.artifacts,aggregateVersion:value.aggregate_version,versions:value.versions,generationAttempts:value.attempts,
            receipts:value.receipts,audits:value.audits,targetHash:sha256(JSON.stringify(value.target)) },200,cors);
        }
        if (url.pathname === '/control/bind-delivery-project-source') {
          const input = await request.json().catch(() => ({}));
          const setup = projectSetups.get(input.projectName);
          if (!setup) return json({ error: 'PROJECT_NOT_FOUND' },404,cors);
          const sources = (await db.query(`SELECT id assessment_id FROM public.assessments
            WHERE process_id=$1 AND org_id=$2 AND workspace_id=$3 AND deleted_at IS NULL
              AND status='Ready for Review' AND scores IS NOT NULL AND score_version='assess-core-2026-05'
            ORDER BY id`, [setup.processId,ids.organization,ids.workspace])).rows;
          if (sources.length !== 1) return json({ error: sources.length ? 'ASSESSMENT_SOURCE_AMBIGUOUS' : 'ASSESSMENT_NOT_FOUND' },409,cors);
          const source = sources[0];
          const project = (await db.query(`UPDATE public.projects SET source_assessment_id=$2,updated_by=$3,updated_at=statement_timestamp()
            WHERE id=$1 AND org_id=$4 AND workspace_id=$5 AND source_process_id=$6 RETURNING id`,
          [setup.projectId,source.assessment_id,ids.author,ids.organization,ids.workspace,setup.processId])).rows[0];
          if (!project) return json({ error: 'PROJECT_SOURCE_MISMATCH' },409,cors);
          return json({ bound: true,project:{id:project.id},source:{processId:setup.processId,assessmentId:source.assessment_id} },200,cors);
        }
        if (url.pathname === '/control/restricted-delete') {
          const input = await request.json().catch(() => ({}));
          const setup = projectSetups.get(input.projectName);
          if (!setup || typeof input.enabled !== 'boolean') return json({ error: 'CONTROL_INVALID' },400,cors);
          if (input.enabled) {
            const restrictedCapabilities = new Set((await db.query(
              'SELECT capability_key FROM public.role_capabilities WHERE role_id=$1', [ids.deliveryRestrictedRole],
            )).rows.map(row => row.capability_key));
            const required = ['assess.read','task.read','task.update.own','project.read','backlog.read','delivery.outcomes.read'];
            const forbidden = ['task.update','task.assign','task.delete'];
            if (required.some(capability => !restrictedCapabilities.has(capability))
              || forbidden.some(capability => restrictedCapabilities.has(capability))) {
              return json({ error: 'CONTROL_RESTRICTED_ROLE_INVALID' },500,cors);
            }
          }
          await db.query('UPDATE public.organization_members SET role_id=$3 WHERE org_id=$1 AND user_id=$2',
            [ids.organization,ids.reviewer,input.enabled ? ids.deliveryRestrictedRole : ids.role]);
          return json({
            enabled: input.enabled, actor: 'reviewer', authorizationVersion: await authorizationVersion(ids.reviewer),
            organizationId: ids.organization, workspaceId: ids.workspace,
          },200,cors);
        }
        if (url.pathname === '/control/downstream-frame') {
          const input = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
          const projectName = typeof input.projectName === 'string' ? input.projectName : [...projectSetups.keys()].at(-1);
          const frame = projectName ? await downstreamFrame(projectName) : null;
          return frame ? json(frame,200,cors) : json({ error: 'PROJECT_NOT_FOUND' },404,cors);
        }
        if (url.pathname === '/control/scenario-decision') {
          const input = await request.json().catch(() => ({}));
          const setup = projectSetups.get(input.projectName);
          if (!setup) return json({ error: 'PROJECT_NOT_FOUND' },404,cors);
          const decision = (await db.query(`SELECT decision.id,decision.decision_version,decision.rule_set_version,
              decision.validation_status,decision.output_hash,decision.input_snapshot,decision.output_snapshot
            FROM public.assess_v2_decision_versions decision
            JOIN public.assess_v2_cases assessed ON assessed.id=decision.case_id
             AND assessed.org_id=decision.org_id AND assessed.workspace_id=decision.workspace_id
             AND assessed.head_version_id=decision.source_version_id
            WHERE assessed.org_id=$1 AND assessed.workspace_id=$2 AND assessed.process_id=$3 AND assessed.deleted_at IS NULL
            ORDER BY decision.created_at DESC,decision.id DESC LIMIT 1`,
          [ids.organization,ids.workspace,setup.processId])).rows[0];
          if (!decision) return json({ error: 'DECISION_NOT_FOUND' },409,cors);
          const output = decision.output_snapshot;
          const sourceInteractions = Array.isArray(decision.input_snapshot?.interactions)
            ? decision.input_snapshot.interactions.map(item => ({
              interactionId: item.id, mode: item.mode,
              highImpact: item.facts?.highImpact ?? null,
              financialAction: item.facts?.financialAction ?? null,
            })) : [];
          const persisted = {
            decisionId: decision.id, decisionVersion: decision.decision_version,
            ruleSetVersion: decision.rule_set_version, validationStatus: decision.validation_status,
            outputHash: decision.output_hash, confidence: output.confidence,
            processReadiness: output.processReadiness, candidateEvaluations: output.candidateEvaluations,
            gateResults: output.gateResults, interactionDecisions: output.interactionDecisions,
            controlRequirements: output.controlRequirements, sourceInteractions,
          };
          return json({ ...persisted, targetHash: sha256(JSON.stringify(persisted)) },200,cors);
        }
        if (url.pathname === '/control/authenticated-controls/prepare') {
          const input = await request.json().catch(() => ({}));
          if (typeof input.testId !== 'string') return json({ error: 'CONTROL_INVALID' },400,cors);
          return json(await controlsFixture.prepareCase(input.testId),200,cors);
        }
        if (url.pathname === '/control/authenticated-controls/frame') {
          const input = await request.json().catch(() => ({}));
          if (typeof input.testId !== 'string') return json({ error: 'CONTROL_INVALID' },400,cors);
          return json(await controlsFixture.readFrame(input.testId),200,cors);
        }
        if (url.pathname === '/control/snapshot') {
          const snapshot = (await db.query(`SELECT
            (SELECT count(*) FROM assess_v2_review_assignments)::int review_assignments,
            (SELECT count(*) FROM assess_v2_govern_resolutions)::int govern_resolutions,
            ((SELECT count(*) FROM assess_command_receipts)+(SELECT count(*) FROM studio_artifact_command_receipts))::int command_receipts,
            (SELECT count(*) FROM privileged_audit_events)::int privileged_audits`)).rows[0];
          return json({ reviewAssignments: snapshot.review_assignments, governResolutions: snapshot.govern_resolutions,
            commandReceipts: snapshot.command_receipts, privilegedAudits: snapshot.privileged_audits }, 200, cors);
        }
        if (url.pathname === '/control/evidence') return json(evidence, 200, cors);
        if (url.pathname === '/control/finalize-project') {
          const input = await request.json().catch(() => ({}));
          const setup = projectSetups.get(input.projectName);
          if (!setup) return json({ journeyBinding, status: 'failed', error: 'PROJECT_NOT_FOUND' }, 404, cors);
          const verified = (await db.query(`WITH project_cases AS(
            SELECT * FROM public.assess_v2_cases WHERE process_id=$1
          ), exact_lineage AS(
            SELECT c.id case_id,decision.id decision_id,review.id review_id,govern.id govern_id,
              handoff.id handoff_id,package.id source_package_id,artifact.id artifact_id,
              attempt.id attempt_id,version.id generated_version_id
            FROM project_cases c
            JOIN public.assess_v2_decision_versions decision
              ON decision.case_id=c.id AND decision.org_id=c.org_id AND decision.workspace_id=c.workspace_id
             AND decision.source_version_id=c.head_version_id
            JOIN public.assess_v2_review_resolutions review
              ON review.case_id=c.id AND review.decision_id=decision.id AND review.source_version_id=decision.source_version_id
             AND review.org_id=c.org_id AND review.workspace_id=c.workspace_id AND review.resolution='approved'
            JOIN public.assess_v2_govern_resolutions govern
              ON govern.case_id=c.id AND govern.decision_id=decision.id AND govern.review_resolution_id=review.id
             AND govern.source_version_id=decision.source_version_id AND govern.org_id=c.org_id AND govern.workspace_id=c.workspace_id
             AND jsonb_array_length(govern.actions)>0
             AND govern.actions=public.pr1e_normalize_govern_actions(decision.input_snapshot,decision.output_snapshot)
            JOIN public.assess_v2_studio_handoffs handoff
              ON handoff.case_id=c.id AND handoff.decision_id=decision.id AND handoff.review_resolution_id=review.id
             AND handoff.govern_resolution_id=govern.id AND handoff.source_version_id=decision.source_version_id
             AND handoff.org_id=c.org_id AND handoff.workspace_id=c.workspace_id
            JOIN public.assess_v2_studio_sources studio_source
              ON studio_source.handoff_id=handoff.id AND studio_source.case_id=c.id AND studio_source.decision_id=decision.id
             AND studio_source.org_id=c.org_id AND studio_source.workspace_id=c.workspace_id
            JOIN public.enterprise_module_handoffs module_handoff
              ON module_handoff.upstream_handoff_id=handoff.id AND module_handoff.org_id=c.org_id
             AND module_handoff.workspace_id=c.workspace_id AND module_handoff.status='consumed'
            JOIN public.enterprise_module_handoff_consumptions consumption
              ON consumption.handoff_id=module_handoff.id AND consumption.org_id=c.org_id AND consumption.workspace_id=c.workspace_id
            JOIN public.studio_artifact_source_packages package
              ON package.id=consumption.source_package_id AND package.artifact_id=consumption.artifact_id
             AND package.assess_handoff_id=handoff.id AND package.assess_package_hash=handoff.package_hash
             AND package.org_id=c.org_id AND package.workspace_id=c.workspace_id
            JOIN public.studio_artifact_aggregates artifact
              ON artifact.id=consumption.artifact_id AND artifact.source_package_id=package.id
             AND artifact.case_id=c.id AND artifact.decision_id=decision.id AND artifact.review_resolution_id=review.id
             AND artifact.govern_resolution_id=govern.id AND artifact.handoff_id=handoff.id
             AND artifact.org_id=c.org_id AND artifact.workspace_id=c.workspace_id
            JOIN public.studio_artifact_generation_attempts attempt
              ON attempt.artifact_id=artifact.id AND attempt.source_package_id=package.id
             AND attempt.org_id=c.org_id AND attempt.workspace_id=c.workspace_id AND attempt.state='completed'
            JOIN public.studio_artifact_versions version
              ON version.id=artifact.current_version_id AND version.artifact_id=artifact.id
             AND version.source_package_id=package.id AND version.generation_attempt_id=attempt.id
             AND version.org_id=c.org_id AND version.workspace_id=c.workspace_id
          )
          SELECT
            (SELECT count(*)::int FROM project_cases) case_count,
            (SELECT count(*)=1 FROM project_cases WHERE process_id=$1) source_process_matched,
            EXISTS(SELECT 1 FROM exact_lineage) review_approved,
            EXISTS(SELECT 1 FROM exact_lineage) govern_resolved,
            (SELECT count(DISTINCT handoff_id)::int FROM exact_lineage) handoff_count,
            (SELECT count(DISTINCT generated_version_id)::int FROM exact_lineage) generation_completed_count`, [setup.processId])).rows[0];
          const verification = {
            caseCount: verified.case_count,
            sourceProcessMatched: verified.source_process_matched === true,
            reviewResolution: verified.review_approved === true ? 'approved' : null,
            governResolved: verified.govern_resolved === true,
            studioHandoffCount: verified.handoff_count,
            generationCompletedCount: verified.generation_completed_count,
          };
          const passed = verification.caseCount === 1 && verification.sourceProcessMatched
            && verification.reviewResolution === 'approved' && verification.governResolved
            && verification.studioHandoffCount === 1 && verification.generationCompletedCount === 1;
          return json({ journeyBinding, status: passed ? 'passed' : 'failed', verification }, passed ? 200 : 409, cors);
        }
        return json({ error: 'NOT_FOUND' }, 404, cors);
      }
      const controlsResponse = await controlsFixture.handle(request);
      if (controlsResponse) return new Response(controlsResponse.body, {
        status: controlsResponse.status, statusText: controlsResponse.statusText,
        headers: { ...Object.fromEntries(controlsResponse.headers.entries()), ...cors },
      });
      let actor;
      try { actor = actorFromRequest(request); } catch { return json({ message: 'Invalid token' }, 401, cors); }
      if (url.pathname === '/functions/v1/process-command') return processCommandRouterModule.handleProcessCommandRequest(request,processDependencies);
      if (url.pathname === '/functions/v1/assess-command') {
        const response = await assessRouterModule.handleAssessRequest(request,assessV1Dependencies);
        for (const [key,value] of Object.entries(cors)) response.headers.set(key,value);
        return response;
      }
      if (url.pathname === '/functions/v1/studio-delivery-authority-command') {
        const response = await studioDeliveryCommandModule.handleStudioDeliveryCommand(request,studioDeliveryDependencies(request));
        for (const [key,value] of Object.entries(cors)) response.headers.set(key,value);
        return response;
      }
      if (url.pathname === '/functions/v1/studio-delivery-outcome-query') {
        const queryInput = await request.clone().json().catch(() => ({}));
        const response = await studioDeliveryQueryModule.handleStudioDeliveryOutcomeQuery(request,studioDeliveryDependencies(request));
        if (actor === ids.outsider && typeof queryInput?.projectId === 'string') {
          const body = await response.clone().json().catch(() => ({}));
          foreignOutcomeProbes.set(queryInput.projectId, {
            status: response.status,
            disclosedIdentifiers: JSON.stringify(body).includes(queryInput.projectId),
            disclosedBlocker: /blocker/iu.test(JSON.stringify(body)),
          });
        }
        for (const [key,value] of Object.entries(cors)) response.headers.set(key,value);
        return response;
      }
      if (url.pathname === '/functions/v1/legacy-delivery-command') {
        const response = await legacyDeliveryCommandModule.handleLegacyDeliveryCommand(request,legacyDeliveryDependencies(request));
        for (const [key,value] of Object.entries(cors)) response.headers.set(key,value);
        return response;
      }
      if (url.pathname === '/functions/v1/legacy-delivery-query') {
        const response = await legacyDeliveryQueryModule.handleLegacyDeliveryQuery(request,legacyDeliveryDependencies(request));
        for (const [key,value] of Object.entries(cors)) response.headers.set(key,value);
        return response;
      }
      if (url.pathname === '/auth/v1/user') {
        const profile = (await db.query('SELECT email,full_name FROM profiles WHERE id=$1', [actor])).rows[0];
        return json({ id: actor, aud: 'authenticated', role: 'authenticated', email: profile.email, user_metadata: {}, app_metadata: { provider: 'fixture' } }, 200, cors);
      }
      if (url.pathname === '/functions/v1/tenant-session') {
        const context = await defaultContext(actor);
        return json({ contexts: [{ userId: actor, organizationId: ids.organization, organizationName: 'Enterprise lifecycle', workspaceId: ids.workspace, workspaceName: 'Lifecycle workspace', roleNames: ['Lifecycle authority'], capabilities: context.capabilities, authorizationVersion: context.authorizationVersion }] }, 200, cors);
      }
      if (url.pathname === '/functions/v1/assess-v2-command') {
        const body = await request.json();
        const token = request.headers.get('authorization').replace(/^Bearer\s+/iu, '');
        const result = await executeAssess(body, token);
        return json(result.body, result.status, cors);
      }
      if (url.pathname === '/functions/v1/studio-artifact-command') {
        const response = await executeStudio(request);
        for (const [key, value] of Object.entries(cors)) response.headers.set(key, value);
        return response;
      }
      if (url.pathname.startsWith('/rest/v1/rpc/')) {
        try { return json(await rpcProjection(url.pathname.split('/').at(-1), await request.json(), actor), 200, cors); }
        catch { return json({ code: 'PROJECTION_UNAVAILABLE' }, 404, cors); }
      }
      if (url.pathname.startsWith('/rest/v1/')) {
        try {
          const rows = await selectRows(url.pathname, url.searchParams, actor);
          const single = /application\/vnd\.pgrst\.object\+json/iu.test(request.headers.get('accept') ?? '');
          return json(single ? rows[0] ?? null : rows, 200, cors);
        }
        catch { return json({ code: 'PROJECTION_UNAVAILABLE' }, 404, cors); }
      }
      return json({ error: 'NOT_FOUND' }, 404, cors);
    };

    let requestTail = Promise.resolve();
    server = createServer((incoming, outgoing) => {
      const bodyResult = ['GET', 'HEAD'].includes(incoming.method ?? 'GET')
        ? Promise.resolve({ body: undefined, error: null })
        : readEnterpriseLifecycleRequestBody(incoming).then(
          body => ({ body, error: null }),
          error => ({ body: undefined, error }),
        );
      const run = requestTail.then(async () => {
        try {
          const address = server.address();
          const bodyState = await bodyResult;
          if (bodyState.error) throw bodyState.error;
          const body = bodyState.body;
          const request = new Request(`http://127.0.0.1:${address.port}${incoming.url ?? '/'}`, { method: incoming.method, headers: requestHeaders(incoming), body: body?.length ? body : undefined });
          await responseToNode(await route(request), outgoing);
        } catch {
          await responseToNode(json({ error: 'FIXTURE_FAILURE' }, 500), outgoing);
        }
      });
      requestTail = run.catch(() => {});
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen({ host: '127.0.0.1', port, exclusive: true }, resolve); });
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const cleanup = async () => {
      if (cleanupAttempted) return cleanupSucceeded;
      cleanupAttempted = true;
      evidence.cleanup.attempted = true;
      const errors = [];
      await controlsFixture.cleanup().catch(error => errors.push(error));
      await controlsPostgres.cleanup().catch(error => errors.push(error));
      if (server) await new Promise(resolve => server.close(error => { if (error) errors.push(error); resolve(); }));
      await requestTail;
      await actorTransactionTail;
      if (db) await db.end().catch(error => errors.push(error));
      if (databaseCreated) await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`).catch(error => errors.push(error));
      const residual = Number((await admin.query('SELECT count(*) n FROM pg_database WHERE datname=$1', [database])).rows[0].n);
      evidence.cleanup.residualRows = residual;
      for (const role of createdRoles.reverse()) await admin.query(`DROP ROLE IF EXISTS ${role}`).catch(error => errors.push(error));
      await admin.end().catch(error => errors.push(error));
      cleanupSucceeded = errors.length === 0 && residual === 0;
      evidence.cleanup.succeeded = cleanupSucceeded;
      evidence.assertions['cleanup.database-removed'] = cleanupSucceeded;
      if (!cleanupSucceeded) throw new AggregateError(errors, 'ENTERPRISE_LIFECYCLE_CLEANUP_FAILED');
      return true;
    };

    return {
      baseUrl, publicAnonKey: 'sb_publishable_enterprise_lifecycle_browser_test', authStorageKey: 'sb-127-auth-token',
      controlToken, journeyBinding, aliases,
      actors: {
        author: { token: 'enterprise-author-token', user: { id: ids.author, email: 'author@fixture.invalid' } },
        reviewer: { token: 'enterprise-reviewer-token', user: { id: ids.reviewer, email: 'reviewer@fixture.invalid' } },
        approver: { token: 'enterprise-approver-token', user: { id: ids.approver, email: 'approver@fixture.invalid' } },
        outsider: { token: 'enterprise-outsider-token', user: { id: ids.outsider, email: 'outsider@fixture.invalid' } },
      },
      ids, db, evidence, executeAssess, executeStudio, authorizationVersion,
      actorQuery,
      serviceQuery,
      readDownstreamFrame: downstreamFrame,
      expectedBrowserCaseProcesses: () => [...projectSetups.entries()].map(([projectName, item]) => ({
        projectName, processId: item.processId,
      })).sort((left, right) => left.projectName.localeCompare(right.projectName)),
      controls: controlsFixture,
      controlsPostgres,
      failNextProviderCall: studioGeneration.failNextProviderCall,
      getLastStudioRpcError: studioGeneration.getLastRpcError,
      production: { fixtureModule, commandModule, handlerModule, reviewCommandModule, reviewHandlerModule, studioHandlerModule,
        studioDeliveryCommandModule,studioDeliveryQueryModule,legacyDeliveryCommandModule,legacyDeliveryQueryModule },
      close: cleanup,
    };
  } catch (error) {
    if (server) await new Promise(resolve => server.close(() => resolve()));
    if (db) await db.end().catch(() => {});
    if (databaseCreated) await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`).catch(() => {});
    for (const role of createdRoles.reverse()) await admin.query(`DROP ROLE IF EXISTS ${role}`).catch(() => {});
    await admin.end().catch(() => {});
    throw error;
  }
}

export const enterpriseLifecycleSourcePaths = Object.freeze([...new Set([
  'scripts/enterpriseLifecyclePostgresFixture.mjs',
  'scripts/enterpriseLifecyclePersistenceAssertions.mjs',
  'scripts/enterpriseLifecycleStudioGeneration.mjs',
  'scripts/authenticatedControlsFixture.mjs',
  'scripts/authenticatedControlsPostgresAdapter.mjs',
  'scripts/syntheticAiTerminalJournalMigrationTestGuard.mjs',
  'scripts/testEnterpriseLifecycleAcceptancePostgres.mjs',
  'supabase/functions/_shared/assessV2Command.ts',
  'supabase/functions/_shared/assessV2Handlers.ts',
  'supabase/functions/_shared/assessV2ReviewCommand.ts',
  'supabase/functions/_shared/assessV2ReviewHandlers.ts',
  'supabase/functions/_shared/studioArtifactCommand.ts',
  'supabase/functions/_shared/studioArtifactHandler.ts',
  'supabase/functions/_shared/studioArtifactDb.ts',
  'supabase/functions/_shared/studioArtifactGeneration.ts',
  'supabase/functions/_shared/studioArtifactProvider.ts',
  'supabase/functions/_shared/studioArtifactTemplateContract.ts',
  'supabase/functions/_shared/providerBudget.ts',
  'supabase/functions/_shared/tenantAuthority.ts',
  'services/processUpdateContract.ts',
  'services/processUpdateClient.ts',
  'supabase/functions/_shared/processCommandRouter.ts',
  'supabase/functions/_shared/processUpdateCommand.ts',
  'supabase/functions/_shared/processUpdateDb.ts',
  'services/productAcceptanceBridge/contracts.ts',
  'services/productAcceptanceBridge/client.ts',
  'supabase/functions/_shared/studioDeliveryCommand.ts',
  'supabase/functions/_shared/studioDeliveryOutcomeQuery.ts',
  'supabase/functions/_shared/legacyDeliveryCommand.ts',
  'supabase/functions/_shared/legacyDeliveryQuery.ts',
  'services/assessV2/decisionVersion.ts',
  'services/assessV2/fixture.ts',
  'supabase/migrations/20260714120000_pr1d_assess_v2_decision_intelligence.sql',
  'supabase/migrations/20260720160000_pr1e_assess_v2_governed_review_handoff.sql',
  'supabase/migrations/20260727120000_studio_governed_artifact_authority.sql',
  'supabase/migrations/20260828120000_governed_multisource_studio_pr_b.sql',
  'supabase/migrations/20260918082307_synthetic_ai_mapping_studio_budget_authority.sql',
  ...migrationsForChain().map(name => `supabase/migrations/${name}`),
])]);

export const enterpriseLifecycleSha256 = sha256;
