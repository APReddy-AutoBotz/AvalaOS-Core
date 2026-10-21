import assert from 'node:assert/strict';
import { createServer, connect } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';
import { chromium } from '@playwright/test';
import { AuthenticatedHostedController } from './authenticatedHostedController.mjs';
import { AuthenticatedHostedBrowserActionTracker } from './authenticatedHostedBrowserRequestClassifier.mjs';
import { createAuthenticatedHostedObservationReader, AUTHENTICATED_HOSTED_CAPTURE_QUERY,
  AUTHENTICATED_HOSTED_SOURCE_QUERY } from './authenticatedHostedObservationAdapter.mjs';
import { createAuthenticatedHostedIdentityAdapter } from './authenticatedHostedControllerAdapters.mjs';
import { observationProofNetwork as network, observationProofQueueFactory as queueFactory }
  from './authenticatedObservationBrowserProof.mjs';

// Real PostgreSQL protocol through a loopback-only latency proxy, not a mocked
// clock or a delayed observe() return. Both directions retain TCP byte order.
async function latencyProxy(connectionString, roundTripMs) {
  const target = new URL(connectionString);
  assert.equal(target.hostname, '127.0.0.1');
  const upstreamPort = Number(target.port);
  const sockets = new Set(), timers = new Set();
  const server = createServer(client => {
    const upstream = connect({ host: target.hostname, port: upstreamPort });
    for (const socket of [client, upstream]) {
      sockets.add(socket);
      socket.setNoDelay(true);
      socket.on('error', () => { client.destroy(); upstream.destroy(); });
      socket.on('close', () => sockets.delete(socket));
    }
    for (const [source, destination] of [[client, upstream], [upstream, client]]) {
      source.on('data', chunk => {
        const timer = setTimeout(() => { timers.delete(timer); destination.write(chunk); }, roundTripMs / 2);
        timers.add(timer);
      });
      source.on('end', () => destination.end());
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  target.port = String(server.address().port);
  return { url: target.href, async close() {
    for (const timer of timers) clearTimeout(timer);
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
  } };
}

export async function runObservationRoundTripProof({ connectionString, config, adapter, project, ids, expectedStatements,
  captureQuery = AUTHENTICATED_HOSTED_CAPTURE_QUERY, scenarios = [[33, 0], [1, 100], [33, 100]],
  expectedTimeout = (requests, roundTripMs) => expectedStatements === 5 && requests === 33 && roundTripMs === 100,
  createQueryClient,
}) {
  assert.ok([3, 5].includes(expectedStatements));
  const results = [], phase = new AsyncLocalStorage();
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    // 33 is an explicit fanout stress case, not a claim about the failed hosted
    // request count. 100 ms is a controlled RTT, not a measured hosted latency.
    for (const [requests, roundTripMs] of scenarios) {
      const proxy = await latencyProxy(connectionString, roundTripMs);
      const client = createQueryClient ? await createQueryClient({ connectionString: proxy.url, phase })
        : new pg.Client({ connectionString: proxy.url });
      let clientFailure;
      client.on?.('error', error => { clientFailure = error; });
      const metrics = {};
      const measure = async (name, operation) => {
        const start = performance.now();
        try { return await operation(); }
        finally {
          const entry = metrics[name] ??= { count: 0, totalMs: 0, maxMs: 0 };
          const ms = Math.round(performance.now() - start);
          entry.count++; entry.totalMs += ms; entry.maxMs = Math.max(entry.maxMs, ms);
        }
      };
      let pending = 0, maximumPending = 0, queries = 0, verifiedSessions = 0, authRequests = 0;
      const active = new Set();
      const execute = async (sql, values) => {
        queries++;
        const kind = sql.includes('auth.sessions') ? 'session-sql'
          : sql === AUTHENTICATED_HOSTED_CAPTURE_QUERY ? 'capture-sql'
            : sql.includes('UNION ALL') ? 'source-sql' : 'authority-sql';
        return measure(`${phase.getStore() ?? 'identity'}:${kind}`, () => client.query(sql, values));
      };
      const db = { query: async (sql, values) => {
        // Frozen PR319 two-statement transport, for the local comparison only.
        // Current capture normalization/filters stay identical in both arms.
        if (expectedStatements === 5 && sql === AUTHENTICATED_HOSTED_CAPTURE_QUERY) {
          const authority = await execute('SELECT public.authenticated_synthetic_observe($1,$2,statement_timestamp()) value',
            values.slice(5));
          const sources = await execute(AUTHENTICATED_HOSTED_SOURCE_QUERY, values.slice(0, 5));
          return { rows: [{ source: '__authority__', value: authority.rows[0].value }, ...sources.rows] };
        }
        return execute(sql === AUTHENTICATED_HOSTED_CAPTURE_QUERY ? captureQuery : sql, values);
      } };
      const server = createHttpServer(async (req, res) => {
        res.setHeader('access-control-allow-origin', '*');
        res.setHeader('access-control-allow-headers', 'authorization,content-type');
        res.setHeader('content-type', req.url === '/' ? 'text/html' : 'application/json');
        if (req.url === '/auth/v1/user') {
          authRequests++;
          await new Promise(resolve => setTimeout(resolve, roundTripMs));
          res.end(JSON.stringify({ id: ids.actors.author }));
        } else res.end(req.url === '/' ? '<title>Local round-trip proof</title>' : '{"ok":true}');
      });
      let context, controller;
      try {
        await client.connect();
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const origin = `http://127.0.0.1:${server.address().port}`;
        const identity = createAuthenticatedHostedIdentityAdapter({
          config: { ...config, supabaseUrl: origin, serviceRoleKey: 'local-proof-only' }, db,
        });
        const reader = createAuthenticatedHostedObservationReader({ db, config });
        controller = new AuthenticatedHostedController({ config,
          adapter: { ...adapter, observe: input => measure(`${phase.getStore()}:capture`, () => reader.capture(input)) },
          identity: { verifySession: input => {
            verifiedSessions++;
            return measure('identity:verify', () => identity.verifySession(input));
          } },
        });
        controller.active = true; controller.exerciseId = ids.exercise;
        controller.projects.set('desktop-chromium', { ...project, lastBoundaryAt: new Date().toISOString() });
        const tracker = new AuthenticatedHostedBrowserActionTracker({ appOrigin: 'http://127.0.0.1:1', backendOrigin: origin,
          startAction: async input => {
            pending++; maximumPending = Math.max(maximumPending, pending);
            try {
              const action = await phase.run('before', () => controller.beginBrowserAction({ projectName: 'desktop-chromium', ...input }));
              active.add(action.actionId); return action;
            } finally { pending--; }
          },
          finishAction: async input => {
            await phase.run('after', () => controller.finishBrowserAction({ projectName: 'desktop-chromium', ...input }));
            active.delete(input.actionId);
          },
        });
        context = await browser.newContext();
        const page = await context.newPage(), queue = queueFactory();
        const lifecycle = await network.installAuthenticatedHostedNetwork({ context, hosted: true,
          allowedOrigins: new Set([origin]), tracker, queueNetworkAction: queue.enqueue,
          onExternalRequest: () => assert.fail('non-loopback request'), onHttpRequest: () => {},
          onTrackerError: error => queue.enqueue(async () => { throw error; }),
        });
        await page.goto(origin);
        const token = 'header.' + Buffer.from(JSON.stringify({ sub: ids.actors.author, session_id: ids.sessions.author }))
          .toString('base64url') + '.signature-padding-that-keeps-the-token-bounded';
        await controller.bindBrowserSession({ projectName: 'desktop-chromium', persona: 'author', accessToken: token });
        // Binding is setup. Every subsequent request still re-verifies both
        // GoTrue and the live database session; those checks are counted below.
        queries = 0; verifiedSessions = 0; authRequests = 0;
        for (const key of Object.keys(metrics)) delete metrics[key];
        client.resetMetrics?.();
        const fetches = page.evaluate(async ({ token, requests }) => Promise.all(Array.from({ length: requests },
          () => fetch('/functions/v1/tenant-session', { headers: { authorization: 'Bearer ' + token } })
            .then(async r => ({ status: r.status, body: await r.json() })))), { token, requests });
        void fetches.catch(() => {});
        const admissionDeadline = performance.now() + 10_000;
        while (pending === 0) {
          assert.ok(performance.now() < admissionDeadline, 'local admissions start');
          await new Promise(resolve => setTimeout(resolve, 2));
        }
        let failure = null;
        const start = performance.now();
        try {
          await network.authenticatedLifecycleSettleActorNavigationBoundary({
            settleActionAdmissions: () => measure('boundary:admissions', lifecycle.settleActionAdmissions),
            settleResponseBodies: () => measure('boundary:bodies', lifecycle.settleResponseBodies),
            drainNetworkActions: () => measure('boundary:drain', queue.drain),
            activeActionCount: () => active.size + pending,
          });
        } catch (error) { failure = error.message; }
        const elapsedMs = Math.round(performance.now() - start);
        assert.deepEqual(await fetches, Array.from({ length: requests }, () => ({ status: 200, body: { ok: true } })));
        await lifecycle.settleActionAdmissions(); await lifecycle.settleResponseBodies(); await queue.drain();
        const actions = controller.browserActions.get('desktop-chromium');
        assert.equal(actions.length, requests);
        assert.equal(actions.filter(action => action.complete).length, requests);
        assert.equal(verifiedSessions, requests); assert.equal(authRequests, requests);
        assert.equal(pending + active.size, 0);
        assert.equal(queries, expectedStatements * requests);
        const recordHashes = frame => frame.records.map(row => row.rowHash).sort();
        for (const action of actions) {
          assert.ok(Date.parse(action.after.capturedAt) > Date.parse(action.before.capturedAt));
          assert.deepEqual(recordHashes(action.before), recordHashes(action.after));
        }
        const shouldTimeout = expectedTimeout(requests, roundTripMs);
        assert.equal(failure, shouldTimeout ? 'AUTHENTICATED_BROWSER_ACTOR_TRANSITION_EMPTY_AFTER_DEADLINE' : null);
        results.push({ requests, roundTripMs, maximumPending, elapsedMs, queries, verifiedSessions, authRequests,
          completeActions: actions.length, frames: actions.length * 2, outstanding: pending + active.size,
          recordsPerFrame: actions[0].before.records.length, failure, metrics: structuredClone(metrics),
          ...(client.snapshot ? { queryTiming: client.snapshot() } : {}) });
        if (requests === 1 || scenarios.length === 1) {
          await client.query("UPDATE auth.sessions SET not_after=statement_timestamp()-interval '1 second' WHERE id=$1",
            [ids.sessions.author]);
          const priorQueries = queries, priorAuthRequests = authRequests;
          await assert.rejects(controller.beginBrowserAction({ projectName: 'desktop-chromium',
            accessToken: token, route: '/functions/v1/tenant-session', requestBody: {} }), /SESSION_VERIFY_REJECTED/u);
          assert.equal(queries - priorQueries, 1, 'revoked session fails before any observation');
          assert.equal(authRequests - priorAuthRequests, 1, 'revocation still performs fresh GoTrue verification');
          assert.equal(actions.length, requests, 'no partial action is published');
          await client.query('UPDATE auth.sessions SET not_after=NULL WHERE id=$1', [ids.sessions.author]);
          results.at(-1).revokedSessionRejectedBeforeObservation = true;
        }
      } catch (error) {
        console.error('ROUNDTRIP_PROOF_FAILURE', { requests, roundTripMs, pending, maximumPending,
          queries, verifiedSessions, authRequests, message: error.message, metrics });
        throw error;
      } finally {
        await context?.close().catch(() => {});
        await controller?.stopControlIntakeAndJoin().catch(() => {});
        await client.end().catch(() => {});
        await proxy.close();
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
      }
      assert.equal(clientFailure, undefined);
    }
  } finally { await browser?.close(); }
  return { kind: 'local-postgres-wire-latency-chromium-controller-proof', deadlineMs: 15000,
    historicalHostedCauseProven: false, results };
}
