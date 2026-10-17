import { createServer } from 'node:http';

import {
  AuthenticatedHostedController,
  authenticatedHostedDigest,
} from './authenticatedHostedController.mjs';
import { createAuthenticatedHostedPostgresAdapter } from './authenticatedHostedControllerAdapters.mjs';

const EXPECTED_PREFIX_CASES = Object.freeze([
  'ASSESS-002',
  'ASSESS-003',
  'ASSESS-018',
  'ASSESS-020',
  'SAFETY-001',
  'SAFETY-002',
  'SAFETY-003',
]);
const DIRECT_FIXTURE_CONTROLS = new Set([
  '/control/setup',
  '/control/arm-browser-fault',
  '/control/assess-v2-runtime',
]);
const digest = character => `sha256:${character.repeat(64)}`;
const decodeClaims = token => {
  const parts = typeof token === 'string' ? token.split('.') : [];
  if (parts.length !== 3) throw new Error('V2_FULL_PREFIX_LOCAL_SESSION_REJECTED');
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  if (typeof claims?.sub !== 'string' || typeof claims?.session_id !== 'string') {
    throw new Error('V2_FULL_PREFIX_LOCAL_SESSION_REJECTED');
  }
  return Object.freeze({ actorId: claims.sub, sessionId: claims.session_id });
};
const safeJson = async request => {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 1_000_000) throw new Error('V2_FULL_PREFIX_LOCAL_REQUEST_REJECTED');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks, bytes).toString('utf8');
  return raw ? JSON.parse(raw) : {};
};

const requestFixtureControl = async (fixture, pathname, body) => {
  const response = await fetch(new URL(pathname, fixture.baseUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-enterprise-lifecycle-control': fixture.controlToken,
    },
    body: JSON.stringify(body ?? {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`V2_FULL_PREFIX_LOCAL_FIXTURE_CONTROL_REJECTED:${pathname}`);
  return payload;
};

export async function createV2FullPrefixLocalController({ fixture, origin }) {
  if (!fixture?.db?.query || typeof fixture.serviceQuery !== 'function'
    || typeof fixture.expectedBrowserCaseProcesses !== 'function') {
    throw new Error('V2_FULL_PREFIX_LOCAL_FIXTURE_REJECTED');
  }
  const targetOrigin = new URL(origin);
  if (targetOrigin.protocol !== 'http:' || targetOrigin.hostname !== '127.0.0.1') {
    throw new Error('V2_FULL_PREFIX_LOCAL_ORIGIN_REJECTED');
  }

  await fixture.db.query(
    'UPDATE public.studio_artifact_runtime_control SET enabled=true,read_only=false,provider_enabled=false WHERE singleton',
  );
  await fixture.db.query(
    'UPDATE public.enterprise_intelligence_runtime_control SET enabled=true,read_only=false,provider_enabled=false WHERE singleton',
  );
  const migrationVersion = (await fixture.db.query(
    'SELECT migration_tip FROM public.hosted_pilot_environment_identity WHERE singleton',
  )).rows[0]?.migration_tip;
  if (migrationVersion !== '20261011053000') {
    throw new Error('V2_FULL_PREFIX_LOCAL_MIGRATION_REJECTED');
  }

  const config = Object.freeze({
    acceptanceMode: 'full_acceptance',
    releaseSha: 'a'.repeat(40),
    deploymentId: 'b'.repeat(24),
    origin: targetOrigin.origin,
    backendDigest: digest('c'),
    migrationVersion,
    migrationDigest: digest('d'),
    exerciseDigest: digest('e'),
    profileVersion: 'hosted-authenticated-synthetic-profile-v3',
    catalogDigest: digest('f'),
    sourceDigest: digest('1'),
    secretBackendKind: 'hashicorp_vault',
    targetPublicDigest: digest('2'),
    workflow: { runId: 'local-v2-full-prefix', attempt: '1' },
    scope: {
      organizationId: fixture.ids.organization,
      workspaceId: fixture.ids.workspace,
      roleIds: {
        author: fixture.ids.role,
        reviewer: fixture.ids.role,
        approver: fixture.ids.role,
        outsider: fixture.ids.role,
      },
    },
  });
  const postgresAdapter = createAuthenticatedHostedPostgresAdapter({
    config,
    db: { query: fixture.serviceQuery },
    verifyDeployment: async () => { throw new Error('V2_FULL_PREFIX_LOCAL_PREFLIGHT_FORBIDDEN'); },
    verifySecretBackend: async () => { throw new Error('V2_FULL_PREFIX_LOCAL_PREFLIGHT_FORBIDDEN'); },
  });
  const knownTokens = new Map(Object.values(fixture.actors).map(actor => [
    actor.token,
    decodeClaims(actor.token),
  ]));
  const identity = Object.freeze({
    async verifySession({ accessToken, actorId, sessionId }) {
      const known = knownTokens.get(accessToken);
      if (!known || known.actorId !== actorId || known.sessionId !== sessionId) {
        throw new Error('V2_FULL_PREFIX_LOCAL_SESSION_REJECTED');
      }
      return known;
    },
    async revokeAll() {},
    created: new Map(),
  });
  const adapter = Object.freeze({
    bindSession: input => postgresAdapter.bindSession(input),
    observe: input => postgresAdapter.observe(input),
    frame: (pathname, input) => postgresAdapter.frame(pathname, input),
    verifyAssessmentFinalizeCase: input => postgresAdapter.verifyAssessmentFinalizeCase(input),
    // The selected prefix never exercises the outcome/secret cases that need the
    // hosted adapter's supplemental browser-action recorder.
    recordBrowserAction: async () => {},
  });
  const controller = new AuthenticatedHostedController({ config, adapter, identity });
  await postgresAdapter.activate({
    exerciseId: controller.exerciseId,
    releaseSha: config.releaseSha,
    deploymentId: config.deploymentId,
    origin: config.origin,
    backendDigest: config.backendDigest,
    migrationVersion: config.migrationVersion,
    migrationDigest: config.migrationDigest,
    exerciseDigest: config.exerciseDigest,
    profileVersion: config.profileVersion,
    catalogDigest: config.catalogDigest,
    sourceDigest: config.sourceDigest,
    organizationId: config.scope.organizationId,
    workspaceId: config.scope.workspaceId,
    expiresAt: new Date(Date.now() + 60 * 60_000),
  });
  const observationStartedAt = (await fixture.serviceQuery(
    'SELECT statement_timestamp() value',
  )).rows[0].value.toISOString();
  controller.active = true;
  controller.startedAt = observationStartedAt;
  controller.observationStartedAt = observationStartedAt;

  const registerProject = async (projectName, browserSetup) => {
    const processId = fixture.expectedBrowserCaseProcesses()
      .find(item => item.projectName === projectName)?.processId;
    if (!processId || !browserSetup?.deliveryProject?.id) {
      throw new Error('V2_FULL_PREFIX_LOCAL_PROJECT_REJECTED');
    }
    const identities = Object.fromEntries(Object.entries(browserSetup.actors).map(([persona, actor]) => [
      persona,
      { id: actor.user.id, email: actor.user.email },
    ]));
    const sessions = Object.values(browserSetup.actors).map(actor => decodeClaims(actor.token));
    await fixture.db.query(
      `INSERT INTO auth.sessions(id,user_id)
       SELECT * FROM unnest($1::uuid[],$2::uuid[]) ON CONFLICT(id) DO NOTHING`,
      [sessions.map(item => item.sessionId), sessions.map(item => item.actorId)],
    );
    controller.projects.set(projectName, {
      projectName,
      processId,
      projectId: browserSetup.deliveryProject.id,
      identities,
      browserSetup,
      lastBoundaryAt: observationStartedAt,
    });
  };

  const controlToken = authenticatedHostedDigest(controller.controlToken).slice('sha256:'.length);
  const server = createServer(async (request, response) => {
    const send = (status, body) => {
      response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify(body));
    };
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (request.method === 'GET' && url.pathname === '/health') return send(200, { ok: true });
      if (request.method !== 'POST' || !url.pathname.startsWith('/control/')) {
        return send(404, { error: 'NOT_FOUND' });
      }
      if (request.headers['x-enterprise-lifecycle-control'] !== controlToken) {
        return send(403, { error: 'CONTROL_DENIED' });
      }
      const input = await safeJson(request);
      if (DIRECT_FIXTURE_CONTROLS.has(url.pathname)) {
        const result = await requestFixtureControl(fixture, url.pathname, input);
        if (url.pathname === '/control/setup') await registerProject(input.projectName, result);
        return send(200, result);
      }
      return send(200, await controller.control(url.pathname, input));
    } catch (error) {
      return send(409, {
        error: String(error?.message ?? error).match(/^[A-Z0-9_:.-]+/u)?.[0]
          ?? 'V2_FULL_PREFIX_LOCAL_CONTROL_FAILED',
      });
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('V2_FULL_PREFIX_LOCAL_SERVER_REJECTED');

  let closed = false;
  return Object.freeze({
    baseUrl: `http://127.0.0.1:${address.port}`,
    controlToken,
    projectSummary(projectName) {
      const browserProject = projectName.startsWith('desktop-chromium')
        ? 'desktop-chromium' : 'pixel-7-chromium';
      const browserCases = controller.browserCases.filter(item => item.project === browserProject);
      const projectActions = controller.browserActions.get(projectName) ?? [];
      const caseIds = browserCases.map(item => item.testId).sort();
      const serverCaseCount = controller.serverCases.filter(item => item.project === browserProject).length;
      return Object.freeze({
        project: projectName.endsWith('-barrier') ? 'barrier' : 'immediate',
        browserCaseCount: browserCases.length,
        serverCaseCount,
        actionCount: projectActions.length,
        completedActionCount: projectActions.filter(item => item.complete === true).length,
        caseIds,
        contractSatisfied: caseIds.length === EXPECTED_PREFIX_CASES.length
          && JSON.stringify(caseIds) === JSON.stringify([...EXPECTED_PREFIX_CASES].sort())
          && serverCaseCount === EXPECTED_PREFIX_CASES.length
          && projectActions.every(item => item.complete === true),
      });
    },
    async close() {
      if (closed) return;
      closed = true;
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      await postgresAdapter.quiesce({ exerciseId: controller.exerciseId });
    },
  });
}

export const V2_FULL_PREFIX_EXPECTED_CASES = EXPECTED_PREFIX_CASES;
