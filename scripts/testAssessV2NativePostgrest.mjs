import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { inspectV2ReadCatalog, runV2RowFreeProbes } from './assessV2ReadDiagnostic.mjs';
import { createServer } from 'node:net';
import { test } from 'node:test';
import pg from 'pg';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';
import {
  createEnterpriseLifecycleFixture,
  resolveEnterpriseLifecycleNativePostgrestTarget,
} from './enterpriseLifecyclePostgresFixture.mjs';
import {
  PROJECTION_POSTGRES_IMAGE,
  PROJECTION_POSTGREST_IMAGE,
  selectProjectionRpcSubnet,
} from './projectionRpcPostgrestContract.mjs';
import {
  closeAndSummarizeV2FullPrefixLocalController,
  createV2FullPrefixLocalController,
  createV2FullPrefixAdapterQuery,
} from './v2FullPrefixLocalController.mjs';
import {
  buildV2FullPrefixResult,
  classifyV2FullPrefixFailure,
  runIndependentV2FullPrefixVariants,
} from './v2FullPrefixReproduction.mjs';

const { Client } = pg;
const resolvePrimaryReproductionDirectory = () => {
  const fallback = path.resolve(
    'output/local-private/authenticated-product-acceptance/authenticated-native-primary-reproduction',
  );
  const requested = process.env.AUTHENTICATED_PRIMARY_LOCAL_PROOF_DIRECTORY;
  if (!requested) return fallback;
  const ownedRoot = path.resolve('output/local-private/primary-lifecycle-timeout-local');
  const resolved = path.resolve(requested);
  if (resolved !== ownedRoot && !resolved.startsWith(`${ownedRoot}${path.sep}`)) {
    throw new Error('AUTHENTICATED_PRIMARY_LOCAL_PROOF_DIRECTORY_REJECTED');
  }
  return resolved;
};
const docker = (...args) => execFileSync('docker', args, {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000, windowsHide: true,
}).trim();
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const availablePort = () => new Promise((resolve, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : null;
    server.close(error => error ? reject(error) : resolve(port));
  });
});
const waitForHttp = async (url, timeoutMs = 120_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      await response.arrayBuffer();
      if (response.ok) return;
    } catch {}
    await pause(250);
  }
  throw new Error('ASSESS_V2_NATIVE_APP_NOT_READY');
};
const run = (args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, args, { cwd: process.cwd(), stdio: 'inherit', ...options });
  child.once('error', reject);
  child.once('exit', (code, signal) => code === 0
    ? resolve()
    : reject(new Error(`ASSESS_V2_NATIVE_COMMAND_FAILED:${code ?? signal}`)));
});
const stop = async child => {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), pause(5_000)]);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
};
const token = (secret, claims) => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${header}.${payload}.${createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')}`;
};
const owned = (id, label, runId) => {
  const info = JSON.parse(docker('inspect', id))[0];
  assert.equal(info.Config.Labels[label], runId);
  return info;
};
const loadProductionTransport = async () => {
  const source = await readFile(new URL('../services/assessV2Client.ts', import.meta.url), 'utf8');
  const projectionSource = source.match(/export const projectImmutableCloneEvidence = \([\s\S]*?^};/m)?.[0];
  const headSource = source.match(/export const shouldReadAssessV2DraftHead = \([\s\S]*?;\r?$/m)?.[0];
  const transportSource = source.match(/export const createAssessV2DefaultTransport = \([\s\S]*?^\}\);/m)?.[0];
  assert.ok(projectionSource && headSource && transportSource, 'Assess V2 production transport source is unavailable');
  const compiled = ts.transpileModule([projectionSource, headSource, transportSource].join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  new Function('exports', 'module', 'isEnterpriseObject', 'EnterpriseBoundaryError', 'readEnterpriseErrorCode', compiled)(
    module.exports, module,
    value => value !== null && typeof value === 'object' && !Array.isArray(value),
    class EnterpriseBoundaryError extends Error {},
    () => 'COMMAND_UNAVAILABLE',
  );
  return module.exports.createAssessV2DefaultTransport;
};

test('native PostgREST target rejects scheme-relative escape before dispatch', () => {
  const origin = 'http://127.0.0.1:3000';
  assert.equal(
    resolveEnterpriseLifecycleNativePostgrestTarget(origin, 'http://127.0.0.1:4000/rest/v1/assess_v2_cases?limit=0').href,
    `${origin}/assess_v2_cases?limit=0`,
  );
  assert.throws(
    () => resolveEnterpriseLifecycleNativePostgrestTarget(origin, 'http://127.0.0.1:4000/rest/v1//foreign.example/path'),
    /ENTERPRISE_LIFECYCLE_POSTGREST_TARGET_REJECTED/u,
  );
});

const eligibleReviewerReproduction = process.env.ASSESS_V2_ELIGIBLE_REVIEWER_REPRODUCTION === '1';
if (eligibleReviewerReproduction && (process.env.ASSESS_V2_FULL_PREFIX_REPRODUCTION === '1'
  || process.env.ASSESS_V2_NATIVE_DIAGNOSTIC_ONLY === '1')) {
  throw new Error('ASSESS_V2_ELIGIBLE_REVIEWER_REPRODUCTION_SCOPE_REJECTED');
}
const nativeTestTimeoutMs = process.env.ASSESS_V2_FULL_PREFIX_REPRODUCTION === '1' ? 780_000 : 300_000;
test('native PostgREST resumes a freshly created Assess V2 version 1 under real RLS', { timeout: nativeTestTimeoutMs }, async () => {
  const createTransport = await loadProductionTransport();
  const runId = randomUUID();
  const label = 'avalaos.assess-v2-native-run';
  const network = `avalaos-assess-v2-native-${runId}`;
  const postgresName = `avalaos-assess-v2-pg-${runId}`;
  const jwtSecret = randomBytes(48).toString('hex');
  const containers = [];
  let networkId = null;
  let fixture = null;
  let admin = null;
  let preview = null;
  try {
    docker('image', 'inspect', PROJECTION_POSTGRES_IMAGE);
    docker('image', 'inspect', PROJECTION_POSTGREST_IMAGE);
    const networkIds = docker('network', 'ls', '-q').split(/\s+/u).filter(Boolean);
    const occupied = networkIds.length
      ? JSON.parse(docker('network', 'inspect', ...networkIds)).flatMap(item => item.IPAM.Config ?? [])
        .map(item => item.Subnet).filter(item => item && !item.includes(':'))
      : [];
    const subnet = selectProjectionRpcSubnet(occupied);
    networkId = docker('network', 'create', '--subnet', subnet,
      '--opt', 'com.docker.network.bridge.enable_ip_masquerade=false',
      '--opt', 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1',
      '--label', `${label}=${runId}`, network);
    assert.match(networkId, /^[0-9a-f]{64}$/u);
    const limits = ['--pull=never', '--label', `${label}=${runId}`, '--network', network,
      '--cpus=1', '--pids-limit=128', '--log-opt', 'max-size=1m', '--log-opt', 'max-file=1'];
    const postgresId = docker('run', '-d', '--name', postgresName, ...limits,
      '--memory=1g', '--memory-swap=1g', '--tmpfs', '/var/lib/postgresql/data:rw,size=512m',
      '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-p', '127.0.0.1::5432', PROJECTION_POSTGRES_IMAGE);
    containers.push(postgresId);
    const postgresInfo = owned(postgresId, label, runId);
    const postgresPort = postgresInfo.NetworkSettings.Ports['5432/tcp'][0];
    assert.equal(postgresPort.HostIp, '127.0.0.1');
    const databaseUrl = `postgresql://postgres@127.0.0.1:${postgresPort.HostPort}/postgres`;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try { admin = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 1_000 }); await admin.connect(); break; }
      catch { await admin?.end().catch(() => undefined); admin = null; await pause(300); }
    }
    assert.ok(admin, 'Owned PostgreSQL did not start');
    await admin.end(); admin = null;

    fixture = await createEnterpriseLifecycleFixture({ databaseUrl, postgrestJwtSecret: jwtSecret,
      runId: `native-${runId}`, runAttempt: '1', headSha: 'local-native-postgrest',
      hostedPersonaRoleParity: eligibleReviewerReproduction,
      providersEnabled: !eligibleReviewerReproduction });
    const postgrestId = docker('run', '-d', ...limits, '--memory=256m', '--memory-swap=256m',
      '-e', `PGRST_DB_URI=postgresql://authenticator@${postgresName}:5432/${fixture.databaseName}`,
      '-e', 'PGRST_DB_SCHEMAS=public', '-e', 'PGRST_DB_ANON_ROLE=anon',
      '-e', `PGRST_JWT_SECRET=${jwtSecret}`, '-e', 'PGRST_LOG_LEVEL=crit',
      '-p', '127.0.0.1::3000', PROJECTION_POSTGREST_IMAGE);
    containers.push(postgrestId);
    const postgrestInfo = owned(postgrestId, label, runId);
    const postgrestPort = postgrestInfo.NetworkSettings.Ports['3000/tcp'][0];
    assert.equal(postgrestPort.HostIp, '127.0.0.1');
    const postgrestOrigin = `http://127.0.0.1:${postgrestPort.HostPort}`;
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      try { const response = await fetch(postgrestOrigin, { signal: AbortSignal.timeout(1_000) }); await response.arrayBuffer(); if (response.status === 200) { ready = true; break; } }
      catch {}
      await pause(250);
    }
    assert.equal(ready, true, 'Owned PostgREST did not start');
    fixture.useNativePostgrest(postgrestOrigin, {
      resourceDelays: { assess_v2_primitives: 80, assess_v2_edges: 5 },
    });

    const setupResponse = await fetch(`${fixture.baseUrl}/control/setup`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-enterprise-lifecycle-control': fixture.controlToken },
      body: JSON.stringify({ projectName: 'native-v2' }),
    });
    assert.equal(setupResponse.status, 200);
    await setupResponse.arrayBuffer();
    const processId = fixture.expectedBrowserCaseProcesses().find(item => item.projectName === 'native-v2')?.processId;
    assert.ok(processId);
    const caseId = randomUUID();
    const authorizationVersion = await fixture.authorizationVersion(fixture.ids.author);
    const create = await fixture.executeAssess({
      requestId: randomUUID(), idempotencyKey: `assessment_v2.create:${caseId}`,
      commandType: 'assessment_v2.create', organizationId: fixture.ids.organization,
      workspaceId: fixture.ids.workspace, authorizationVersion,
      payload: { caseId, processId, name: 'Native V2', description: 'Native PostgREST reload' },
    }, fixture.actors.author.token);
    assert.equal(create.status, 200);
    assert.equal(create.body.resource.version, 1);

    const client = createClient(fixture.baseUrl, fixture.publicAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${fixture.actors.author.token}` } },
    });
    const transport = createTransport(client);
    const discovered = await transport.findCaseForProcess({
      organizationId: fixture.ids.organization, workspaceId: fixture.ids.workspace, processId,
    });
    assert.equal(discovered?.id, caseId);
    assert.equal(await transport.findCaseForProcess({
      organizationId: fixture.ids.foreignOrganization,
      workspaceId: fixture.ids.foreignWorkspace,
      processId,
    }), null);
    const projection = await transport.readCase(caseId);
    assert.equal(projection.case_snapshot.version, 1);
    assert.equal(projection.case_snapshot.status, 'draft');
    assert.equal(projection.name, 'Native V2');
    assert.equal(projection.decision_snapshot, null);
    assert.deepEqual([
      projection.case_snapshot.primitives.length, projection.case_snapshot.edges.length,
      projection.case_snapshot.decisionPoints.length, projection.case_snapshot.exceptionPaths.length,
      projection.case_snapshot.assets.length, projection.case_snapshot.interactions.length,
      projection.case_snapshot.evidence.length,
    ], [0, 0, 0, 0, 0, 0, 0]);

    const foreignClient = createClient(fixture.baseUrl, fixture.publicAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${fixture.actors.outsider.token}` } },
    });
    const foreignTransport = createTransport(foreignClient);
    assert.equal(await foreignTransport.readCase(caseId), null);
    assert.equal(await foreignTransport.findCaseForProcess({
      organizationId: fixture.ids.organization, workspaceId: fixture.ids.workspace, processId,
    }), null);
    assert.equal(Number((await fixture.db.query(
      'SELECT count(*)::int total FROM public.assess_v2_cases WHERE process_id=$1', [processId],
    )).rows[0].total), 1);
    const stats = fixture.nativePostgrestStats();
    assert.equal(stats.active, 0);
    assert.ok(stats.maxConcurrent >= 2, 'Assess V2 child reads were not concurrent');
    assert.deepEqual(Object.keys(stats.statuses), ['200']);
    assert.ok(stats.requests >= 12);
    assert.ok(
      stats.completionOrder.indexOf('assess_v2_edges:200')
        < stats.completionOrder.indexOf('assess_v2_primitives:200'),
      'ASSESS_V2_NATIVE_OUT_OF_ORDER_COMPLETION_NOT_OBSERVED',
    );

    if (process.env.ASSESS_V2_NATIVE_DIAGNOSTIC_ONLY === '1') {
      const catalog = await inspectV2ReadCatalog(fixture.db);
      assert.equal(catalog.length, 10);
      assert.ok(catalog.every(row => row.exists && row.rls && row.authenticatedSelect
        && row.schemaUsage && row.requiredColumnsPresent && row.policyCount > 0));
      const api = await runV2RowFreeProbes({ origin: fixture.baseUrl,
        headers: { apikey: fixture.publicAnonKey, Authorization: `Bearer ${fixture.actors.author.token}` } });
      assert.equal(api.length, 11);
      assert.ok(api.every(row => row.category === 'EMPTY_SUCCESS'));
      await writeFile('output/local-private/authenticated-product-acceptance/v2-read-diagnostic-local-baseline.json',
        `${JSON.stringify({ localOnly: true, catalog, api }, null, 2)}\n`);
      process.stdout.write('# V2_READ_DIAGNOSTIC_LOCAL_PASS catalog=10 rowFreeRequests=11 browserNotRun=true\n');
      return;
    }
    const browserRequestBaseline = stats.requests;
    const browserResourceBaseline = stats.resourceStatuses;
    const appEnvironment = {
      ...process.env,
      VITE_AVALA_RUNTIME_MODE: 'pilot',
      VITE_SUPABASE_URL: fixture.baseUrl,
      VITE_SUPABASE_ANON_KEY: fixture.publicAnonKey,
      VITE_AI_EDGE_FUNCTIONS_ENABLED: 'false',
    };
    await run(['node_modules/vite/bin/vite.js', 'build', '--config', 'vite.enterprise-lifecycle-acceptance.config.ts'], {
      env: appEnvironment,
    });
    const appPort = await availablePort();
    const appBaseUrl = `http://127.0.0.1:${appPort}`;
    preview = spawn(process.execPath, [
      'node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(appPort),
    ], { cwd: process.cwd(), stdio: 'inherit', env: appEnvironment });
    await waitForHttp(appBaseUrl);
    if (eligibleReviewerReproduction) {
      // Exercise the auxiliary-page disposal race before the two role-parity profiles.
      await run(['--test', 'scripts/authenticatedHostedPageClose.test.mjs']);
      const readProviderState = async () => (await fixture.db.query(`SELECT
        (SELECT provider_enabled FROM public.studio_artifact_runtime_control WHERE singleton) runtime_enabled,
        (SELECT provider_enabled FROM public.enterprise_intelligence_runtime_control WHERE singleton) ei_runtime_enabled,
        (SELECT count(*)::int FROM public.ai_provider_configs WHERE org_id=$1 AND status='active' AND deleted_at IS NULL) active_configs,
        (SELECT count(*)::int FROM public.enterprise_ai_capability_routes
          WHERE org_id=$1 AND workspace_id=$2 AND enabled AND deleted_at IS NULL) enabled_routes`,
      [fixture.ids.organization, fixture.ids.workspace])).rows[0];
      const providerState = await readProviderState();
      assert.equal(providerState.runtime_enabled, false);
      assert.equal(providerState.ei_runtime_enabled, false);
      assert.equal(providerState.active_configs, 0);
      assert.equal(providerState.enabled_routes, 0);
      const proofRoot = path.resolve('output/local-private/authenticated-product-acceptance/eligible-reviewer-authority');
      const proofDirectory = path.resolve(proofRoot, `run-${runId}`);
      assert.equal(proofDirectory.startsWith(`${proofRoot}${path.sep}`), true);
      await mkdir(proofRoot, { recursive: true });
      await mkdir(proofDirectory, { recursive: false });
      await run([
        'node_modules/@playwright/test/cli.js', 'test',
        '--config=playwright.assess-v2-native-postgrest.config.ts',
        '--grep=@eligible-reviewer-authority',
        '--max-failures=1',
        `--output=.agent/eligible-reviewer-authority-playwright/run-${runId}`,
      ], {
        env: {
          ...process.env,
          ENTERPRISE_LIFECYCLE_APP_BASE_URL: appBaseUrl,
          ENTERPRISE_LIFECYCLE_API_BASE_URL: fixture.baseUrl,
          ENTERPRISE_LIFECYCLE_CONTROL_TOKEN: fixture.controlToken,
          ENTERPRISE_LIFECYCLE_AUTH_STORAGE_KEY: fixture.authStorageKey,
          ASSESS_V2_ELIGIBLE_REVIEWER_REPRODUCTION: '1',
          ELIGIBLE_REVIEWER_AUTHORITY_OUTPUT_DIR: proofDirectory,
        },
      }).catch(async error => {
        await writeFile(`${proofDirectory}/failure.json`, `${JSON.stringify({
          schemaVersion: 'eligible-reviewer-authority-local-failure-v1',
          status: 'failed',
          localOnly: true,
          ownedRunId: runId,
          stage: 'focused-browser-proof',
          failureClass: 'focused-test-failed',
        }, null, 2)}\n`, 'utf8');
        throw error;
      });
      const projects = ['chromium-desktop', 'chromium-mobile'];
      const proofs = await Promise.all(projects.map(async project =>
        JSON.parse(await readFile(`${proofDirectory}/${project}.json`, 'utf8'))));
      for (const [index, proof] of proofs.entries()) {
        assert.equal(proof.schemaVersion, 'eligible-reviewer-authority-local-proof-v1');
        assert.equal(proof.localOnly, true);
        assert.equal(proof.project, projects[index]);
        assert.equal(proof.actorLimitMs, 15_000);
        assert.equal(proof.roleParity, 'hosted-reviewer-and-approver');
        assert.equal(proof.sharedHostedRoleContractVerified, true);
        assert.equal(proof.historicalHostedCauseProven, false);
        assert.deepEqual(proof.before, {
          eligibleReviewerCount: 1,
          oldApproverSelectionRejected: true,
          oldApproverSelectionTimeoutMs: 15_000,
          oldApproverSelectionElapsedMs: proof.before.oldApproverSelectionElapsedMs,
          directIneligibleAssignmentDenied: true,
          excluded: { owner: true, approver: true, outsider: true },
          mutationDelta: 0,
        });
        assert.ok(proof.before.oldApproverSelectionElapsedMs >= 14_500);
        assert.deepEqual(proof.after, {
          assignmentStatus: 200,
          replayStatus: 200,
          staleStatus: 409,
          staleErrorCode: 'VERSION_CONFLICT',
          replayOutcome: 'replayed',
          assignmentDelta: 1,
          receiptDelta: 1,
          auditDelta: 1,
          resolutionDelta: 0,
          staleFalseSuccessAbsent: true,
        });
      }
      const result = {
        schemaVersion: 'eligible-reviewer-authority-local-result-v1',
        status: 'passed',
        localOnly: true,
        ownedRunId: runId,
        projects,
        actorLimitMs: 15_000,
        providersEnabled: false,
        historicalHostedCauseProven: false,
        reproduced: { ineligibleApproverSelectionRejected: true, mutationDelta: 0 },
        corrected: { assignment: 200, exactReplay: 200, staleDifferentCommand: 409, logicalMutations: 1 },
      };
      assert.deepEqual(await readProviderState(), providerState);
      assert.equal(fixture.evidence.providerEffects.calls, 0);
      assert.equal(fixture.evidence.providerEffects.paidCalls, 0);
      assert.equal(fixture.evidence.providerEffects.egressAttempts, 0);
      assert.equal(fixture.evidence.providerEffects.egress, 0);
      assert.equal(fixture.evidence.providerEffects.syntheticProviderCalls, 0);
      await stop(preview);
      assert.ok(
        preview.exitCode !== null || preview.signalCode !== null,
        'ASSESS_V2_ELIGIBLE_REVIEWER_PREVIEW_DID_NOT_EXIT',
      );
      preview = null;
      await writeFile(`${proofDirectory}/result.json`, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
      await writeFile(`${proofRoot}/latest.json`, `${JSON.stringify({
        schemaVersion: 'eligible-reviewer-authority-local-latest-v1',
        ownedRunId: runId,
        result: path.relative(proofRoot, `${proofDirectory}/result.json`).split(path.sep).join('/'),
      }, null, 2)}\n`, 'utf8');
      assert.equal(fixture.nativePostgrestStats().active, 0);
      process.stdout.write(`# ELIGIBLE_REVIEWER_AUTHORITY_LOCAL_RESULT ${JSON.stringify(result)}\n`);
      return;
    }
    if (process.env.ASSESS_V2_FULL_PREFIX_REPRODUCTION === '1') {
      const reproductionDirectory = resolvePrimaryReproductionDirectory();
      await mkdir(reproductionDirectory, { recursive: true });
      const variants = await runIndependentV2FullPrefixVariants(async variant => {
        const projectName = `desktop-chromium-${variant}`;
        const fragmentPath = `${reproductionDirectory}/browser-${projectName}.json`;
        let localController = null;
        let adapterClient = null;
        let execution = 'failed';
        let cleanup = 'not_started';
        let browser = null;
        let controller = null;
        let failureStage = 'artifact-reset';
        let setupFailure = null;
        try {
          await rm(fragmentPath, { force: true });
          failureStage = 'controller-create';
          const adapterDatabaseUrl = new URL(databaseUrl);
          adapterDatabaseUrl.pathname = `/${fixture.databaseName}`;
          adapterClient = new Client({ connectionString: adapterDatabaseUrl.toString() });
          await adapterClient.connect();
          localController = await createV2FullPrefixLocalController({
            fixture,
            origin: appBaseUrl,
            variant,
            adapterQuery: createV2FullPrefixAdapterQuery(adapterClient),
          });
          failureStage = 'controller-first-action';
          await localController.verifyFirstBrowserAction(projectName);
          failureStage = 'browser-execution';
          await run([
            'node_modules/@playwright/test/cli.js', 'test',
            '--config=playwright.v2-full-prefix-reproduction.config.ts',
          ], {
            env: {
              ...process.env,
              ENTERPRISE_LIFECYCLE_APP_BASE_URL: appBaseUrl,
              ENTERPRISE_LIFECYCLE_API_BASE_URL: fixture.baseUrl,
              ENTERPRISE_LIFECYCLE_CONTROL_URL: localController.baseUrl,
              ENTERPRISE_LIFECYCLE_CONTROL_TOKEN: localController.controlToken,
              ENTERPRISE_LIFECYCLE_AUTH_STORAGE_KEY: fixture.authStorageKey,
              ENTERPRISE_LIFECYCLE_OUTPUT_DIR: reproductionDirectory,
              ENTERPRISE_LIFECYCLE_AUTHENTICATED: 'true',
              ENTERPRISE_LIFECYCLE_HOSTED_REAL_AUTH: 'false',
              AUTHENTICATED_ACCEPTANCE_MODE: 'full_acceptance',
              ENTERPRISE_LIFECYCLE_V2_FULL_PREFIX_REPRODUCTION: variant,
            },
          });
          execution = 'passed';
        } catch (error) {
          execution = 'failed';
          setupFailure = classifyV2FullPrefixFailure(error, failureStage);
        } finally {
          if (localController) {
            const terminal = await closeAndSummarizeV2FullPrefixLocalController(localController, projectName);
            cleanup = terminal.cleanup;
            controller = terminal.controller;
            if (terminal.cleanupError) {
              setupFailure ??= classifyV2FullPrefixFailure(terminal.cleanupError, 'controller-quiesce');
            }
            const controlFailureCode = localController.controlFailureCode();
            if (controlFailureCode && setupFailure?.code === 'BROWSER_PROCESS_EXIT_NONZERO') {
              setupFailure = classifyV2FullPrefixFailure(
                new Error(controlFailureCode), 'browser-execution',
              );
            }
          }
          if (adapterClient) {
            try { await adapterClient.end(); }
            catch (error) {
              cleanup = 'failed';
              setupFailure ??= classifyV2FullPrefixFailure(error, 'controller-quiesce');
            }
          }
        }
        try { browser = JSON.parse(await readFile(fragmentPath, 'utf8')); }
        catch {
          browser = null;
          setupFailure ??= classifyV2FullPrefixFailure(
            new Error('ARTIFACT_UNAVAILABLE'), 'artifact-read',
          );
        }
        return {
          variant,
          execution,
          cleanup,
          setupFailure,
          artifactObserved: browser !== null,
          browser: browser?.v2FullPrefixReproduction ?? null,
          controller,
          network: browser?.network ?? null,
        };
      });
      const nativeStats = fixture.nativePostgrestStats();
      const nativeStatusDelta = Object.fromEntries(Object.entries(nativeStats.statuses)
        .map(([status, count]) => [status, count - (stats.statuses[status] ?? 0)])
        .filter(([, count]) => count > 0));
      const result = buildV2FullPrefixResult({
        variants,
        native: {
          active: nativeStats.active,
          requests: nativeStats.requests - browserRequestBaseline,
          responses: nativeStats.responses - stats.responses,
          completed: nativeStats.completed - stats.completed,
          cancelled: nativeStats.cancelled - stats.cancelled,
          failed: nativeStats.failed - stats.failed,
          statusClasses: nativeStatusDelta,
        },
        baseline: process.env.RELEASE_SHA ?? process.env.GITHUB_SHA ?? 'unknown',
      });
      await writeFile(`${reproductionDirectory}/result.json`, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
      process.stdout.write(`# AUTHENTICATED_NATIVE_PRIMARY_LOCAL_REPRODUCTION_RESULT ${JSON.stringify({
        variants: variants.map(item => item.variant),
        controllerCases: variants.map(item => item.controller?.browserCaseCount ?? 0),
        nativeRequests: result.native.requests,
        conclusion: result.conclusion,
      })}\n`);
      assert.equal(result.status, 'passed', 'V2_FULL_PREFIX_LOCAL_REPRODUCTION_FAILED');
      return;
    }
    await run([
      'node_modules/@playwright/test/cli.js', 'test',
      '--config=playwright.assess-v2-native-postgrest.config.ts',
    ], {
      env: {
        ...process.env,
        ENTERPRISE_LIFECYCLE_APP_BASE_URL: appBaseUrl,
        ENTERPRISE_LIFECYCLE_API_BASE_URL: fixture.baseUrl,
        ENTERPRISE_LIFECYCLE_CONTROL_TOKEN: fixture.controlToken,
        ENTERPRISE_LIFECYCLE_AUTH_STORAGE_KEY: fixture.authStorageKey,
      },
    });
    const browserStats = fixture.nativePostgrestStats();
    const browserResourceDelta = Object.fromEntries(Object.entries(browserStats.resourceStatuses)
      .map(([key, count]) => [key, count - (browserResourceBaseline[key] ?? 0)])
      .filter(([, count]) => count > 0));
    const requiredBrowserResources = [
      'assess_v2_cases', 'assess_v2_decision_versions', 'assess_v2_case_versions',
      'assess_v2_primitives', 'assess_v2_edges', 'assess_v2_decision_points',
      'assess_v2_exception_paths', 'assess_v2_application_assets',
      'assess_v2_application_interactions', 'assess_v2_evidence_links',
      'assess_processes',
    ];
    assert.equal(browserStats.active, 0);
    assert.ok(browserStats.requests > browserRequestBaseline);
    assert.ok(browserStats.maxConcurrent >= 2);
    for (const resource of requiredBrowserResources) {
      assert.ok(browserResourceDelta[`${resource}:200`] > 0, `ASSESS_V2_NATIVE_RESOURCE_NOT_OBSERVED:${resource}`);
    }
    assert.deepEqual(
      Object.keys(browserResourceDelta).filter(key => key.startsWith('assess_v2_') && !key.endsWith(':200')),
      ['assess_v2_primitives:403'],
      `ASSESS_V2_NATIVE_RESOURCE_STATUS_FAILED:${JSON.stringify(browserResourceDelta)}`,
    );
    assert.equal(browserResourceDelta['assess_v2_primitives:403'], 2);
    assert.deepEqual(
      Object.keys(browserResourceDelta).filter(key => !key.endsWith(':200')).sort(),
      ['assess_processes:403', 'assess_v2_primitives:403', 'handoff_ledger_entries:404', 'timesheet_entries:404'],
      `ASSESS_V2_NATIVE_UNEXPECTED_NON_SUCCESS:${JSON.stringify(browserResourceDelta)}`,
    );
    assert.equal(browserResourceDelta['assess_processes:403'], 2);
    process.stdout.write(`# ASSESS_V2_NATIVE_RESOURCE_STATUS_CLASSES ${JSON.stringify(browserResourceDelta)}\n`);
  } finally {
    await stop(preview).catch(() => undefined);
    await fixture?.close().catch(() => undefined);
    await admin?.end().catch(() => undefined);
    for (const id of containers.reverse()) {
      try { owned(id, label, runId); docker('rm', '-f', id); } catch {}
    }
    if (networkId) {
      try {
        const info = JSON.parse(docker('network', 'inspect', networkId))[0];
        assert.equal(info.Labels[label], runId);
        docker('network', 'rm', networkId);
      } catch {}
    }
  }
});
