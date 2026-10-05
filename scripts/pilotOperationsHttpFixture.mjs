import { createServer } from 'node:http';
import path from 'node:path';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const root = process.cwd();
const functionsRoot = path.join(root, 'supabase', 'functions');
const id = value => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;

export const syntheticPilotOperationsHttp = Object.freeze({
  actorId: id(9),
  organizationId: id(1),
  workspaceId: id(2),
  requestId: id(3),
  candidateId: id(4),
  authorizationVersion: 7,
  bearerToken: 'synthetic-pilot-operations-token',
});

export const syntheticPilotOperationsQueryBody = () => ({
  organizationId: syntheticPilotOperationsHttp.organizationId,
  workspaceId: syntheticPilotOperationsHttp.workspaceId,
  expectedAuthorizationVersion: syntheticPilotOperationsHttp.authorizationVersion,
});

export const syntheticPilotOperationsCommandBody = () => ({
  operation: 'simulate_promotion',
  organizationId: syntheticPilotOperationsHttp.organizationId,
  workspaceId: syntheticPilotOperationsHttp.workspaceId,
  requestId: syntheticPilotOperationsHttp.requestId,
  idempotencyKey: 'synthetic:pilot-operation:request',
  expectedAuthorizationVersion: syntheticPilotOperationsHttp.authorizationVersion,
  expectedVersion: 2,
  payload: { candidateId: syntheticPilotOperationsHttp.candidateId, target: 'non_live' },
});

const defaultProjection = () => ({
  truthClassification: 'configured_not_live_verified',
  liveActivationAuthorized: false,
  environment: {
    id: id(5), type: 'pilot_candidate', lifecycle: 'active', version: 3,
    maintenance: false, readOnly: true, disabledFeatures: [],
  },
  release: null,
  promotedRelease: null,
  provider: null,
  health: { schemaCompatible: true, queueState: 'idle', reconciliationState: 'current' },
  recovery: { backupState: 'not_run', restoreState: 'not_run' },
  blockers: [],
  liveStopGates: ['LIVE_ACTIVATION_NOT_AUTHORIZED'],
  rollback: { eligible: false, reason: 'NO_PRIOR_RELEASE', targetCandidateId: null, targetVersion: null, targetLabel: null },
});

const defaultAuthority = kind => ({
  userId: syntheticPilotOperationsHttp.actorId,
  organizationId: syntheticPilotOperationsHttp.organizationId,
  workspaceId: syntheticPilotOperationsHttp.workspaceId,
  authorizationVersion: syntheticPilotOperationsHttp.authorizationVersion,
  capabilities: kind === 'query' ? ['operations.read'] : ['release.promote'],
});

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});

const resolvePersistenceResponse = async (configured, call, kind) => {
  if (typeof configured === 'function') return configured(call);
  if (configured instanceof Response) return configured.clone();
  if (configured) return jsonResponse(configured.body, configured.status ?? 200);
  return jsonResponse(kind === 'query'
    ? defaultProjection()
    : { receiptId: id(6), aggregateVersion: 3, replayed: false });
};

/**
 * Execute one real Pilot Operations Edge entrypoint with only its external auth,
 * tenant-authority and persistence boundaries replaced by synthetic test doubles.
 */
export const createPilotOperationsHttpFixture = ({
  kind,
  authority = defaultAuthority(kind),
  authorityError = null,
  featureEnabled = kind === 'command',
  persistenceResponse,
} = {}) => {
  if (kind !== 'query' && kind !== 'command') throw new Error('PILOT_OPERATIONS_FIXTURE_KIND_REQUIRED');
  const rpcCalls = [];
  const authorityCalls = [];
  let handler;

  const mocks = new Map([
    [path.join(functionsRoot, '_shared', 'supabase.ts'), {
      getAuthUser: async request => {
        if (request.headers.get('authorization') !== `Bearer ${syntheticPilotOperationsHttp.bearerToken}`) {
          throw new Error('ACCESS_DENIED');
        }
        return { id: syntheticPilotOperationsHttp.actorId };
      },
      supabaseEnv: () => ({ url: 'https://synthetic.invalid', serviceRoleKey: 'synthetic-test-only-service-role' }),
    }],
    [path.join(functionsRoot, '_shared', 'tenantAuthorityDb.ts'), {
      createTenantAuthorityDatabase: request => ({ request }),
    }],
    [path.join(functionsRoot, '_shared', 'tenantAuthority.ts'), {
      resolveTenantAuthority: async (actor, target) => {
        authorityCalls.push({ actor, target: { ...target } });
        if (authorityError) throw new Error(authorityError);
        if (target.organizationId !== syntheticPilotOperationsHttp.organizationId
          || target.workspaceId !== syntheticPilotOperationsHttp.workspaceId) throw new Error('ACCESS_DENIED');
        return authority;
      },
    }],
  ]);

  const context = vm.createContext({
    Request, Response, Headers, URL, Error, console,
    fetch: async (input, init = {}) => {
      const url = new URL(String(input));
      const call = {
        pathname: url.pathname,
        method: init.method ?? 'GET',
        body: typeof init.body === 'string' ? JSON.parse(init.body) : null,
      };
      rpcCalls.push(call);
      return resolvePersistenceResponse(persistenceResponse, call, kind);
    },
    Deno: {
      env: { get: key => key === 'PILOT_OPERATIONS_ENABLED' && featureEnabled ? 'true' : undefined },
      serve: candidate => { handler = candidate; },
    },
  });
  const cache = new Map();
  const load = filename => {
    const resolved = path.resolve(filename);
    if (mocks.has(resolved)) return mocks.get(resolved);
    if (cache.has(resolved)) return cache.get(resolved).exports;
    if (!resolved.startsWith(functionsRoot) || path.extname(resolved) !== '.ts') {
      throw new Error(`PILOT_OPERATIONS_FIXTURE_IMPORT_REJECTED:${path.basename(resolved)}`);
    }
    const source = readFileSync(resolved, 'utf8');
    const compiled = ts.transpileModule(source, {
      fileName: resolved,
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
      },
    });
    const errors = (compiled.diagnostics ?? []).filter(item => item.category === ts.DiagnosticCategory.Error);
    if (errors.length > 0) throw new Error(`PILOT_OPERATIONS_FIXTURE_TRANSPILE_FAILED:${path.basename(resolved)}`);
    const module = { exports: {} };
    cache.set(resolved, module);
    const localRequire = specifier => {
      if (!specifier.startsWith('.')) throw new Error(`PILOT_OPERATIONS_FIXTURE_IMPORT_REJECTED:${specifier}`);
      return load(path.resolve(path.dirname(resolved), specifier));
    };
    const wrapper = new vm.Script(`(function(exports, require, module, __filename, __dirname) {${compiled.outputText}\n})`, { filename: resolved });
    wrapper.runInContext(context)(module.exports, localRequire, module, resolved, path.dirname(resolved));
    return module.exports;
  };

  load(path.join(functionsRoot, `pilot-operations-${kind}`, 'index.ts'));
  if (typeof handler !== 'function') throw new Error('PILOT_OPERATIONS_FIXTURE_HANDLER_NOT_CAPTURED');
  return { handler, rpcCalls, authorityCalls };
};

const incomingHeaders = request => {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) value.forEach(item => headers.append(name, item));
    else if (value !== undefined) headers.set(name, value);
  }
  return headers;
};

const requestBody = request => new Promise((resolve, reject) => {
  const chunks = [];
  request.on('data', chunk => chunks.push(chunk));
  request.once('end', () => resolve(Buffer.concat(chunks)));
  request.once('error', reject);
});

export const startPilotOperationsHttpServer = async () => {
  const query = createPilotOperationsHttpFixture({ kind: 'query' });
  const command = createPilotOperationsHttpFixture({ kind: 'command', featureEnabled: false });
  const requests = [];
  const server = createServer(async (incoming, outgoing) => {
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('PILOT_OPERATIONS_FIXTURE_NOT_LISTENING');
      const url = new URL(incoming.url ?? '/', `http://127.0.0.1:${address.port}`);
      const body = ['GET', 'HEAD'].includes(incoming.method ?? 'GET') ? undefined : await requestBody(incoming);
      const request = new Request(url, {
        method: incoming.method,
        headers: incomingHeaders(incoming),
        body: body?.length ? body : undefined,
      });
      requests.push({
        method: request.method,
        pathname: url.pathname,
        origin: request.headers.get('origin'),
        requestedHeaders: request.headers.get('access-control-request-headers'),
      });
      const fixture = url.pathname === '/query' ? query : url.pathname === '/command' ? command : null;
      const response = fixture ? await fixture.handler(request) : new Response('not found', { status: 404 });
      outgoing.writeHead(response.status, Object.fromEntries(response.headers.entries()));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      outgoing.writeHead(500, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      outgoing.end(JSON.stringify({ code: 'FIXTURE_FAILURE' }));
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('PILOT_OPERATIONS_FIXTURE_NOT_LISTENING');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    requests,
    query,
    command,
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  };
};
