import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { createLegacyDeliveryPostgresFixture } from './legacyDeliveryPostgresFixture.mjs';

const root = process.cwd();
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
});

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
      throw new Error(`LEGACY_DELIVERY_BROWSER_IMPORT_REJECTED:${relative}`);
    }
    const compiled = ts.transpileModule(readFileSync(resolved, 'utf8'), {
      fileName: resolved,
      reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    });
    const errors = (compiled.diagnostics ?? []).filter(item => item.category === ts.DiagnosticCategory.Error);
    if (errors.length) throw new Error(`LEGACY_DELIVERY_BROWSER_TRANSPILE_FAILED:${relative}`);
    const module = { exports: {} };
    cache.set(resolved, module);
    const localRequire = specifier => {
      if (!specifier.startsWith('.')) throw new Error(`LEGACY_DELIVERY_BROWSER_IMPORT_REJECTED:${specifier}`);
      const target = path.resolve(path.dirname(resolved), specifier);
      return load(path.extname(target) ? target : `${target}.ts`);
    };
    new vm.Script(`(function(exports,require,module){${compiled.outputText}\n})`, { filename: resolved })
      .runInContext(context)(module.exports, localRequire, module);
    return module.exports;
  };
  return load;
})();

const readBody = incoming => new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;
  incoming.on('data', chunk => {
    size += chunk.length;
    if (size > 1_048_576) {
      reject(new Error('LEGACY_DELIVERY_BROWSER_BODY_TOO_LARGE'));
      incoming.destroy();
      return;
    }
    chunks.push(chunk);
  });
  incoming.on('end', () => resolve(Buffer.concat(chunks)));
  incoming.on('error', reject);
});
const responseToNode = async (response, outgoing) => {
  outgoing.statusCode = response.status;
  for (const [key, value] of response.headers) outgoing.setHeader(key, value);
  outgoing.end(Buffer.from(await response.arrayBuffer()));
};

const persistedArtifacts = workItems => ({
  brd: { title: 'Legacy Delivery authority BRD', sections: [{ key: 'scope', title: 'Scope', content: 'Governed Delivery import scope.' }] },
  frd: { title: 'Functional requirements', sections: [{ key: 'delivery', title: 'Delivery', content: 'Server-authoritative tasks.' }] },
  pdd: { title: 'Process design', sections: [{ key: 'process', title: 'Process', content: 'Import and manage work.' }] },
  qualityGate: { title: 'Quality gate', ambiguityPoints: [], gapPoints: [] },
  diagrams: {
    asIs: { title: 'As-is', mermaidCode: 'flowchart LR; A[Request] --> B[Review]' },
    toBe: { title: 'To-be', mermaidCode: 'flowchart LR; A[Document] --> B[Delivery]' },
  },
  workItems,
  approvals: [],
});

export async function createLegacyDeliveryBrowserFixture(options = {}) {
  let postgres;
  let server;
  try {
  postgres = await createLegacyDeliveryPostgresFixture({ databaseUrl: options.databaseUrl });
  const { ids } = postgres;
  const actorToken = 'legacy-delivery-actor-token';
  const controlToken = `legacy-delivery-control-${crypto.randomUUID()}`;
  const commandModule = loadProductionModule(path.join(root, 'supabase', 'functions', '_shared', 'legacyDeliveryCommand.ts'));
  const queryModule = loadProductionModule(path.join(root, 'supabase', 'functions', '_shared', 'legacyDeliveryQuery.ts'));
  for (const capability of ['studio.artifacts.read']) {
    await postgres.db.query(
      'INSERT INTO public.role_capabilities(role_id,capability_key) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [ids.role, capability],
    );
  }
  await postgres.db.query(`INSERT INTO public.legacy_delivery_workspace_controls(org_id,workspace_id,writes_enabled)
    VALUES($1,$2,true) ON CONFLICT(org_id,workspace_id) DO UPDATE SET writes_enabled=true,updated_at=statement_timestamp()`,
  [ids.organization, ids.workspace]);
  await postgres.db.query('UPDATE public.document_generations SET artifacts=$2::jsonb WHERE id=$1', [ids.generation, JSON.stringify(persistedArtifacts(postgres.artifacts.workItems))]);

  let uncertainImportResponses = 0;
  const actorFromRequest = request => {
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/iu, '');
    if (token !== actorToken) throw new Error('AUTHENTICATION_REQUIRED');
    return ids.actor;
  };
  const authority = async (actorId, organizationId, workspaceId, expectedAuthorizationVersion) => {
    const version = await postgres.authorizationVersion(actorId);
    if (actorId !== ids.actor || organizationId !== ids.organization || workspaceId !== ids.workspace || version !== expectedAuthorizationVersion) {
      throw new Error(version !== expectedAuthorizationVersion ? 'AUTHORIZATION_STALE' : 'RESOURCE_UNAVAILABLE');
    }
    const result = await postgres.db.query(`SELECT array_agg(capability_key ORDER BY capability_key) capabilities
      FROM public.organization_members member
      JOIN public.role_capabilities capability ON capability.role_id=member.role_id
      WHERE member.org_id=$1 AND member.user_id=$2 AND member.status='active'
        AND EXISTS(SELECT 1 FROM public.workspace_memberships workspace
          WHERE workspace.org_id=member.org_id AND workspace.workspace_id=$3 AND workspace.user_id=member.user_id AND workspace.status='active')`,
    [organizationId, actorId, workspaceId]);
    return {
      userId: actorId,
      organizationId,
      workspaceId,
      authorizationVersion: version,
      roleNames: ['Delivery authority'],
      capabilities: result.rows[0]?.capabilities ?? [],
    };
  };
  const dependencies = request => ({
    authenticate: async () => ({ id: actorFromRequest(request) }),
    authority,
    apply: (actorId, command) => postgres.callCommand({
      actor: actorId,
      org: command.organizationId,
      workspace: command.workspaceId,
      version: command.expectedAuthorizationVersion,
      requestId: command.requestId,
      key: command.idempotencyKey,
      action: command.action,
      payload: command.payload,
    }),
    query: (actorId, query) => postgres.callQuery({
      actor: actorId,
      org: query.organizationId,
      workspace: query.workspaceId,
      version: query.expectedAuthorizationVersion,
      projectId: query.projectId,
      limit: query.limit,
      cursor: query.cursor,
      sourceGenerationId: query.sourceGenerationId,
      includeRetained: query.includeRetained,
    }),
  });

  const corsFor = request => ({
    'access-control-allow-origin': request.headers.get('origin') ?? '*',
    'access-control-allow-headers': 'authorization,apikey,content-type,x-client-info,x-legacy-delivery-control',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  });
  const resetAuthorityEffects = async () => {
    // Reset only this disposable browser database between Playwright projects.
    // Runtime DELETE remains protected by the migration's immutable triggers.
    await postgres.db.query(`TRUNCATE TABLE
      public.legacy_delivery_work_item_assignees,
      public.legacy_delivery_work_item_dependencies,
      public.legacy_delivery_command_receipts,
      public.delivery_work_items,
      public.legacy_delivery_imports,
      public.privileged_audit_events CASCADE`);
    uncertainImportResponses = 0;
  };
  const detailedSnapshot = async () => {
    const base = await postgres.snapshot();
    const detail = (await postgres.db.query(`SELECT
      count(*) FILTER (WHERE retention_state='active')::int active,
      count(*) FILTER (WHERE retention_state<>'active')::int retained,
      coalesce(max(authority_version),0)::int max_version
      FROM public.delivery_work_items WHERE authority_version IS NOT NULL`)).rows[0];
    return { ...base, ...detail };
  };
  const route = async request => {
    const url = new URL(request.url);
    const cors = corsFor(request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (url.pathname === '/health') return json({ ok: true }, 200, cors);
    if (url.pathname.startsWith('/control/')) {
      if (request.headers.get('x-legacy-delivery-control') !== controlToken) return json({ error: 'CONTROL_DENIED' }, 403, cors);
      if (url.pathname === '/control/setup') {
        if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405, cors);
        await resetAuthorityEffects();
        return json({
          actor: { token: actorToken, user: { id: ids.actor, email: 'delivery-actor@example.invalid' } },
          organizationId: ids.organization,
          workspaceId: ids.workspace,
          projectId: ids.project,
          generationId: ids.generation,
          authorizationVersion: await postgres.authorizationVersion(ids.actor),
        }, 200, cors);
      }
      if (url.pathname === '/control/fail-next-import-response') {
        uncertainImportResponses = 2;
        return json({ armed: true }, 200, cors);
      }
      if (url.pathname === '/control/snapshot') return json(await detailedSnapshot(), 200, cors);
      return json({ error: 'NOT_FOUND' }, 404, cors);
    }
    let actorId;
    try { actorId = actorFromRequest(request); }
    catch { return json({ message: 'Invalid token' }, 401, cors); }
    if (url.pathname === '/auth/v1/user') return json({
      id: actorId,
      email: 'delivery-actor@example.invalid',
      aud: 'authenticated',
      role: 'authenticated',
      user_metadata: { full_name: 'Delivery actor' },
      app_metadata: { provider: 'fixture' },
    }, 200, cors);
    if (url.pathname === '/functions/v1/tenant-session') {
      const context = await authority(actorId, ids.organization, ids.workspace, await postgres.authorizationVersion(actorId));
      return json({ contexts: [{
        ...context,
        organizationName: 'Legacy Delivery fixture',
        workspaceName: 'Delivery workspace',
      }] }, 200, cors);
    }
    if (url.pathname === '/functions/v1/legacy-delivery-command') {
      const clone = request.clone();
      const body = await clone.json().catch(() => null);
      const response = await commandModule.handleLegacyDeliveryCommand(request, dependencies(request));
      if (body?.action === 'import' && response.ok && uncertainImportResponses > 0) {
        uncertainImportResponses -= 1;
        return json({ message: 'Response unavailable after commit.' }, 503, cors);
      }
      for (const [key, value] of Object.entries(cors)) response.headers.set(key, value);
      return response;
    }
    if (url.pathname === '/functions/v1/legacy-delivery-query') {
      const response = await queryModule.handleLegacyDeliveryQuery(request, dependencies(request));
      for (const [key, value] of Object.entries(cors)) response.headers.set(key, value);
      return response;
    }
    if (url.pathname === '/rest/v1/projects') {
      const rows = (await postgres.db.query(`SELECT id,org_id,workspace_id,app_id,name,description,owner_id,lifecycle_stage,health_status,status,
        archived_at,deleted_at,created_at,updated_at FROM public.projects
        WHERE org_id=$1 AND workspace_id=$2 AND status='active' AND archived_at IS NULL AND deleted_at IS NULL ORDER BY created_at`, [ids.organization, ids.workspace])).rows;
      return json(rows, 200, cors);
    }
    if (url.pathname === '/rest/v1/document_generations') {
      const rows = (await postgres.db.query(`SELECT id,org_id,workspace_id,project_id,template_id,generated_at,artifacts,status,created_at,updated_at,archived_at,deleted_at
        FROM public.document_generations WHERE org_id=$1 AND workspace_id=$2 AND status IN('generated','draft')
          AND archived_at IS NULL AND deleted_at IS NULL ORDER BY generated_at DESC`, [ids.organization, ids.workspace])).rows;
      return json(rows, 200, cors);
    }
    if (url.pathname.startsWith('/rest/v1/')) return json([], 200, cors);
    return json({ error: 'NOT_FOUND' }, 404, cors);
  };

  let requestTail = Promise.resolve();
  server = createServer((incoming, outgoing) => {
    const run = requestTail.then(async () => {
      try {
        const address = server.address();
        const body = ['GET', 'HEAD'].includes(incoming.method ?? 'GET') ? undefined : await readBody(incoming);
        const request = new Request(`http://127.0.0.1:${address.port}${incoming.url ?? '/'}`, {
          method: incoming.method,
          headers: incoming.headers,
          body: body?.length ? body : undefined,
        });
        await responseToNode(await route(request), outgoing);
      } catch (error) {
        await responseToNode(json({ error: 'FIXTURE_FAILURE' }, 500), outgoing);
        console.error(error);
      }
    });
    requestTail = run.catch(() => undefined);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, resolve);
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const close = async () => {
    await new Promise(resolve => server.close(resolve));
    const databaseClosed = await postgres.close();
    if (databaseClosed !== true) throw new Error('LEGACY_DELIVERY_BROWSER_CLEANUP_FAILED');
    return true;
  };
  return {
    baseUrl,
    publicAnonKey: 'sb_publishable_legacy_delivery_browser_test',
    authStorageKey: 'sb-127-auth-token',
    controlToken,
    ids,
    snapshot: postgres.snapshot,
    close,
  };
  } catch {
    if (server?.listening) await new Promise(resolve => server.close(resolve)).catch(() => undefined);
    if (postgres) await postgres.close().catch(() => undefined);
    throw new Error('LEGACY_DELIVERY_BROWSER_FIXTURE_SETUP_FAILED');
  }
}

export const legacyDeliveryBrowserFixtureSources = [
  'scripts/legacyDeliveryBrowserFixture.mjs',
  'scripts/legacyDeliveryPostgresFixture.mjs',
  'supabase/functions/_shared/legacyDeliveryCommand.ts',
  'supabase/functions/_shared/legacyDeliveryQuery.ts',
  'services/legacyDelivery/contracts.ts',
  'services/legacyDelivery/client.ts',
  'supabase/migrations/20261010025331_legacy_delivery_authority.sql',
];
