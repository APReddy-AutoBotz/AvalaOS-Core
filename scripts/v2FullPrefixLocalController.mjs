import { createServer } from 'node:http';

import {
  AuthenticatedHostedController,
  authenticatedHostedDigest,
} from './authenticatedHostedController.mjs';
import { createAuthenticatedHostedPostgresAdapter } from './authenticatedHostedControllerAdapters.mjs';
import { classifyV2FullPrefixFailure } from './v2FullPrefixReproduction.mjs';

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
const PREFIX_PREREQUISITE_FIELDS = Object.freeze([
  'reviewerRestricted',
  'reviewerCanRead',
  'reviewerCannotUpdateProcess',
  'authorRoleRetained',
  'authorPrefixCapabilitiesReady',
  'processWritesReady',
  'v2RuntimeReady',
  'projectReady',
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

export function validateV2FullPrefixFixturePrerequisites(value) {
  if (!value || PREFIX_PREREQUISITE_FIELDS.some(field => value[field] !== true)) {
    throw new Error('V2_FULL_PREFIX_LOCAL_PREFIX_PREREQUISITES_REJECTED');
  }
  return true;
}

export function createV2FullPrefixAdapterQuery(client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('V2_FULL_PREFIX_LOCAL_AUTHORITY_CLIENT_REJECTED');
  }
  let tail = Promise.resolve();
  return (sql, values = []) => {
    const run = tail.then(async () => {
      if (!/^SELECT public[.]authenticated_synthetic_/u.test(sql.trim())) {
        return client.query(sql, values);
      }
      await client.query('BEGIN');
      try {
        await client.query('SET LOCAL ROLE service_role');
        const result = await client.query(sql, values);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
    tail = run.catch(() => undefined);
    return run;
  };
}

export async function createV2FullPrefixLocalController({ fixture, origin, variant, adapterQuery }) {
  if (!fixture?.db?.query || typeof adapterQuery !== 'function'
    || typeof fixture.expectedBrowserCaseProcesses !== 'function') {
    throw new Error('V2_FULL_PREFIX_LOCAL_FIXTURE_REJECTED');
  }
  if (!['immediate', 'barrier'].includes(variant)) {
    throw new Error('V2_FULL_PREFIX_LOCAL_VARIANT_REJECTED');
  }
  const targetOrigin = new URL(origin);
  if (targetOrigin.protocol !== 'http:' || targetOrigin.hostname !== '127.0.0.1') {
    throw new Error('V2_FULL_PREFIX_LOCAL_ORIGIN_REJECTED');
  }

  // Supabase owns this table in hosted environments. The repository-local
  // PostgreSQL fixture creates only auth.users, so reproduce the tested local
  // controller prerequisite without changing the product migration chain.
  await fixture.db.query(`CREATE TABLE IF NOT EXISTS auth.sessions(
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    not_after timestamptz,
    refreshed_at timestamptz NOT NULL DEFAULT statement_timestamp()
  )`);
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
    // The immutable activation authority requires this exact metadata value.
    // The executable app and every HTTP server remain loopback-only.
    origin: 'https://avalaos-pilot.netlify.app',
    backendDigest: digest('c'),
    migrationVersion,
    migrationDigest: digest('d'),
    exerciseDigest: authenticatedHostedDigest(`local-v2-full-prefix:${variant}`),
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
    db: { query: adapterQuery },
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
  const observationStartedAt = (await adapterQuery(
    'SELECT statement_timestamp() value',
  )).rows[0].value.toISOString();
  controller.active = true;
  controller.startedAt = observationStartedAt;
  controller.observationStartedAt = observationStartedAt;

  const projectSetups = new Map();
  let fixturePrerequisites = 'not_run';
  let reviewerRestrictedProject = null;
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
    fixturePrerequisites = 'failed';
    let restricted;
    try {
      restricted = await requestFixtureControl(fixture, '/control/restricted-delete', {
        projectName,
        enabled: true,
      });
    } catch {
      throw new Error('V2_FULL_PREFIX_LOCAL_PREFIX_PREREQUISITES_REJECTED');
    }
    if (restricted?.enabled !== true || restricted?.actor !== 'reviewer') {
      throw new Error('V2_FULL_PREFIX_LOCAL_PREFIX_PREREQUISITES_REJECTED');
    }
    reviewerRestrictedProject = projectName;
    const prerequisites = (await fixture.db.query(`SELECT
        EXISTS(SELECT 1 FROM public.organization_members
          WHERE org_id=$1 AND user_id=$3 AND role_id=$6 AND status='active' AND deleted_at IS NULL) "reviewerRestricted",
        EXISTS(SELECT 1 FROM public.role_capabilities
          WHERE role_id=$6 AND capability_key='assess.read') "reviewerCanRead",
        NOT EXISTS(SELECT 1 FROM public.role_capabilities
          WHERE role_id=$6 AND capability_key='assess.process.update') "reviewerCannotUpdateProcess",
        EXISTS(SELECT 1 FROM public.organization_members
          WHERE org_id=$1 AND user_id=$4 AND role_id=$5 AND status='active' AND deleted_at IS NULL) "authorRoleRetained",
        (SELECT count(*)=6 FROM public.role_capabilities WHERE role_id=$5
          AND capability_key IN('assess.process.update','assess.create','assess.response.write','assess.finalize',
            'assess.v2.read','assess.v2.create')) "authorPrefixCapabilitiesReady",
        EXISTS(SELECT 1 FROM public.process_update_workspace_controls
          WHERE org_id=$1 AND workspace_id=$2 AND enabled=true AND read_only=false) "processWritesReady",
        EXISTS(SELECT 1 FROM public.assess_v2_runtime_control
          WHERE singleton=true AND enabled=true AND read_only=false) "v2RuntimeReady",
        EXISTS(SELECT 1 FROM public.assess_processes process
          JOIN public.projects project ON project.source_process_id=process.id
          WHERE process.id=$7 AND project.id=$8 AND process.org_id=$1 AND process.workspace_id=$2) "projectReady"`, [
        fixture.ids.organization,
        fixture.ids.workspace,
        fixture.ids.reviewer,
        fixture.ids.author,
        fixture.ids.role,
        fixture.ids.deliveryRestrictedRole,
        processId,
        browserSetup.deliveryProject.id,
    ])).rows[0];
    validateV2FullPrefixFixturePrerequisites(prerequisites);
    fixturePrerequisites = 'passed';
    controller.projects.set(projectName, {
      projectName,
      processId,
      projectId: browserSetup.deliveryProject.id,
      identities,
      browserSetup,
      lastBoundaryAt: observationStartedAt,
    });
    projectSetups.set(projectName, browserSetup);
  };

  const controlToken = authenticatedHostedDigest(controller.controlToken).slice('sha256:'.length);
  let firstControlFailureCode = null;
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
        if (url.pathname === '/control/setup' && projectSetups.has(input.projectName)) {
          return send(200, projectSetups.get(input.projectName));
        }
        const result = await requestFixtureControl(fixture, url.pathname, input);
        if (url.pathname === '/control/setup') await registerProject(input.projectName, result);
        return send(200, result);
      }
      return send(200, await controller.control(url.pathname, input));
    } catch (error) {
      const classified = classifyV2FullPrefixFailure(error, 'browser-execution');
      const code = classified.code === 'UNCLASSIFIED'
        ? 'V2_FULL_PREFIX_LOCAL_CONTROL_FAILED' : classified.code;
      firstControlFailureCode ??= code;
      return send(409, {
        error: code,
      });
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('V2_FULL_PREFIX_LOCAL_SERVER_REJECTED');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const requestControl = async (pathname, body) => {
    const response = await fetch(new URL(pathname, baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-enterprise-lifecycle-control': controlToken,
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = typeof payload?.error === 'string' && /^[A-Z][A-Z0-9_:.-]{1,159}$/u.test(payload.error)
        ? payload.error : 'V2_FULL_PREFIX_LOCAL_FIRST_ACTION_REJECTED';
      throw new Error(code);
    }
    return payload;
  };

  let closed = false;
  let setupProbe = 'not_run';
  let setupProbeActionId = null;
  return Object.freeze({
    baseUrl,
    controlToken,
    controlFailureCode: () => firstControlFailureCode,
    async verifyFirstBrowserAction(projectName) {
      setupProbe = 'failed';
      const setup = await requestControl('/control/setup', { projectName });
      const actor = setup?.actors?.reviewer;
      const claims = decodeClaims(actor?.token);
      if (claims.actorId !== actor?.user?.id) {
        throw new Error('V2_FULL_PREFIX_LOCAL_FIRST_ACTION_IDENTITY_REJECTED');
      }
      const started = await requestControl('/control/browser-action-start', {
        projectName,
        accessToken: actor.token,
        route: '/functions/v1/tenant-session',
        requestBody: { method: 'POST', route: '/functions/v1/tenant-session' },
      });
      if (typeof started?.actionId !== 'string') {
        throw new Error('V2_FULL_PREFIX_LOCAL_FIRST_ACTION_START_REJECTED');
      }
      setupProbeActionId = started.actionId;
      const finished = await requestControl('/control/browser-action', {
        projectName,
        actionId: started.actionId,
        status: 200,
        responseBody: { ok: true, contexts: [] },
      });
      if (finished?.recorded !== true) {
        throw new Error('V2_FULL_PREFIX_LOCAL_FIRST_ACTION_FINISH_REJECTED');
      }
      const rows = (await adapterQuery(
        `SELECT persona,state FROM public.authenticated_synthetic_actor_sessions
         WHERE exercise_id=$1 AND actor_id=$2 AND session_id=$3`,
        [controller.exerciseId, claims.actorId, claims.sessionId],
      )).rows;
      if (rows.length !== 1 || rows[0].persona !== 'reviewer_desktop-chromium' || rows[0].state !== 'active') {
        throw new Error('V2_FULL_PREFIX_LOCAL_FIRST_ACTION_BINDING_REJECTED');
      }
      setupProbe = 'passed';
      return Object.freeze({ setup: true, actionStarted: true, actionFinished: true, bindingVerified: true });
    },
    projectSummary(projectName) {
      const browserProject = projectName.startsWith('desktop-chromium')
        ? 'desktop-chromium' : 'pixel-7-chromium';
      const browserCases = controller.browserCases.filter(item => item.project === browserProject);
      const projectActions = controller.browserActions.get(projectName) ?? [];
      const setupActionCount = projectActions.filter(item => item.actionId === setupProbeActionId).length;
      const browserActions = projectActions.filter(item => item.actionId !== setupProbeActionId);
      const caseIds = browserCases.map(item => item.testId).sort();
      const serverCaseCount = controller.serverCases.filter(item => item.project === browserProject).length;
      return Object.freeze({
        project: projectName.endsWith('-barrier') ? 'barrier' : 'immediate',
        fixturePrerequisites,
        setupProbe,
        setupActionCount,
        browserCaseCount: browserCases.length,
        serverCaseCount,
        actionCount: browserActions.length,
        completedActionCount: browserActions.filter(item => item.complete === true).length,
        caseIds,
        contractSatisfied: fixturePrerequisites === 'passed'
          && setupProbe === 'passed' && setupActionCount === 1
          && caseIds.length === EXPECTED_PREFIX_CASES.length
          && JSON.stringify(caseIds) === JSON.stringify([...EXPECTED_PREFIX_CASES].sort())
          && serverCaseCount === EXPECTED_PREFIX_CASES.length
          && browserActions.every(item => item.complete === true),
      });
    },
    async close() {
      if (closed) return;
      closed = true;
      let cleanupError = null;
      try { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
      catch (error) { cleanupError = error; }
      if (reviewerRestrictedProject !== null) {
        try {
          await requestFixtureControl(fixture, '/control/restricted-delete', {
            projectName: reviewerRestrictedProject,
            enabled: false,
          });
          reviewerRestrictedProject = null;
        } catch (error) { cleanupError ??= error; }
      }
      try { await postgresAdapter.quiesce({ exerciseId: controller.exerciseId }); }
      catch (error) { cleanupError ??= error; }
      if (cleanupError) throw cleanupError;
    },
  });
}

export const V2_FULL_PREFIX_EXPECTED_CASES = EXPECTED_PREFIX_CASES;
