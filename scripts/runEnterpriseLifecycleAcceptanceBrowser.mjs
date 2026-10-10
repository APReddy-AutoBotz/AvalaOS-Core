import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const ENTERPRISE_LIFECYCLE_BROWSER_PROJECTS = Object.freeze(['chromium-desktop', 'chromium-mobile']);
export const ENTERPRISE_LIFECYCLE_BROWSER_STAGES = Object.freeze([
  'assess-create', 'assess-finalize', 'govern-assign', 'govern-attest', 'govern-request-changes',
  'assess-revise', 'assess-resubmit', 'govern-approve', 'govern-separation-denial', 'govern-resolve',
  'studio-consume', 'studio-synthetic-generation', 'command-replay', 'command-stale-denial', 'reload-committed-state',
]);
export const ENTERPRISE_LIFECYCLE_BROWSER_ASSERTIONS = Object.freeze([
  'ui.assess-created', 'ui.assess-finalized', 'ui.review-assigned', 'ui.evidence-attested',
  'ui.changes-requested', 'ui.revision-committed', 'ui.resubmitted', 'ui.independent-approved',
  'ui.separation-denied', 'ui.final-reviewer-govern-denied', 'ui.govern-resolved',
  'ui.studio-lineage-consumed', 'ui.synthetic-provider-boundary',
  'ui.replay-no-new-effect', 'ui.stale-no-false-success', 'ui.reload-committed-truth',
]);
export const ENTERPRISE_LIFECYCLE_BROWSER_SOURCES = Object.freeze([
  'scripts/enterpriseLifecyclePostgresFixture.mjs',
  'scripts/enterpriseLifecycleAcceptanceEvidence.mjs',
  'scripts/runEnterpriseLifecycleAcceptanceBrowser.mjs',
  'vite.enterprise-lifecycle-acceptance.config.ts',
  'playwright.enterprise-lifecycle-acceptance.config.ts',
  'tests/browser/enterpriseLifecycleAcceptance/enterpriseLifecycleAcceptance.spec.ts',
  'services/assessV2Client.ts',
  'services/assessV2Client.revisionProjection.test.mjs',
  'services/supabaseClient.ts',
  'services/supabaseClient.enterpriseLifecycleBoundary.test.mjs',
]);
const outputDirectory = path.join('output', 'acceptance', 'enterprise-lifecycle');
const sha256 = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;

export const resolveEnterpriseLifecycleExecutionIdentity = (environment = process.env) => ({
  headSha: environment.PILOT_ACCEPTANCE_HEAD ?? environment.GITHUB_SHA ?? 'local-working-tree',
  runId: environment.GITHUB_RUN_ID ?? `local-${process.pid}`,
  runAttempt: environment.GITHUB_RUN_ATTEMPT ?? '1',
});

export const assertEnterpriseLifecycleLoopbackUrl = value => {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error('ENTERPRISE_LIFECYCLE_NON_LOOPBACK_URL_REJECTED');
  }
  return url.toString().replace(/\/$/u, '');
};

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
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
      lastError = new Error(`HTTP_${response.status}`);
    } catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`ENTERPRISE_LIFECYCLE_HTTP_NOT_READY:${String(lastError)}`);
};

const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd: process.cwd(), stdio: 'inherit', ...options });
  child.once('error', reject);
  child.once('exit', (code, signal) => code === 0
    ? resolve()
    : reject(new Error(`ENTERPRISE_LIFECYCLE_COMMAND_FAILED:${command}:${code ?? signal}`)));
});

const stop = async child => {
  if (!child || child.exitCode !== null || child.signalCode !== null) return true;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await Promise.race([
      new Promise(resolve => child.once('exit', resolve)),
      new Promise(resolve => setTimeout(resolve, 5_000)),
    ]);
  }
  return child.exitCode !== null || child.signalCode !== null;
};

const readProjectFragment = async project => JSON.parse(await readFile(
  path.join(outputDirectory, `browser-${project}.json`), 'utf8',
));

export const aggregateEnterpriseLifecycleBrowserEvidence = ({ fragments, journeyBinding, executionId, scope, execution, providerEffects, cleanup, startedAt, completedAt }) => {
  if (!/^sha256:[a-f0-9]{64}$/u.test(journeyBinding)) throw new Error('ENTERPRISE_LIFECYCLE_JOURNEY_BINDING_INVALID');
  if (!/^sha256:[a-f0-9]{64}$/u.test(executionId) || !/^sha256:[a-f0-9]{64}$/u.test(scope?.executionHash ?? '')) {
    throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_EXECUTION_SCOPE_INVALID');
  }
  const byProject = new Map(fragments.map(fragment => [fragment.project, fragment]));
  const projects = ENTERPRISE_LIFECYCLE_BROWSER_PROJECTS.map(name => {
    const fragment = byProject.get(name);
    if (!fragment || fragment.status !== 'passed' || fragment.journeyBinding !== journeyBinding) {
      throw new Error(`ENTERPRISE_LIFECYCLE_BROWSER_PROJECT_INVALID:${name}`);
    }
    if (!Number.isInteger(fragment.network?.observedHttpRequests) || fragment.network.observedHttpRequests <= 0
      || fragment.network?.nonLoopbackRequests !== 0) {
      throw new Error(`ENTERPRISE_LIFECYCLE_BROWSER_NETWORK_INVALID:${name}`);
    }
    const stageIds = new Set(fragment.stages?.map(stage => stage.id));
    for (const stage of ENTERPRISE_LIFECYCLE_BROWSER_STAGES) {
      if (!stageIds.has(stage)) throw new Error(`ENTERPRISE_LIFECYCLE_BROWSER_STAGE_MISSING:${name}:${stage}`);
    }
    const assertions = new Map((fragment.assertions ?? []).map(assertion => [assertion.id, assertion]));
    for (const assertionId of ENTERPRISE_LIFECYCLE_BROWSER_ASSERTIONS) {
      if (assertions.get(assertionId)?.observed !== true) throw new Error(`ENTERPRISE_LIFECYCLE_BROWSER_ASSERTION_INVALID:${name}:${assertionId}`);
    }
    return fragment;
  });
  const start = Date.parse(startedAt); const end = Date.parse(completedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_WINDOW_INVALID');
  if (providerEffects?.paidCalls !== 0 || providerEffects?.realProviderAllowed !== false || providerEffects?.calls !== 0
    || providerEffects?.egress !== 0 || providerEffects?.egressAttempts !== 0
    || providerEffects?.browserSecrets !== false || providerEffects?.providerMode !== 'synthetic-production-pipeline'
    || providerEffects?.syntheticAdapterEnabled !== true || providerEffects?.forbiddenNetworkGuardTriggered !== true
    || !Number.isInteger(providerEffects?.syntheticProviderCalls) || providerEffects.syntheticProviderCalls < 1) {
    throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_PROVIDER_EFFECT_INVALID');
  }
  if (cleanup?.backendAttempted !== true || cleanup?.backendSucceeded !== true || cleanup?.browserContextsClosed !== true) {
    throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_CLEANUP_INVALID');
  }
  return {
    schemaVersion: 'enterprise-lifecycle-browser-evidence-v1',
    journeyBinding,
    scope,
    execution: {
      ...execution,
      executionId,
      startedAt,
      completedAt,
    },
    status: 'passed',
    projects,
    network: {
      observedHttpRequests: projects.reduce((total, project) => total + project.network.observedHttpRequests, 0),
      nonLoopbackRequests: 0,
    },
    providerEffects: {
      paidCalls: providerEffects.paidCalls,
      realProviderAllowed: providerEffects.realProviderAllowed,
      calls: providerEffects.calls,
      egress: providerEffects.egress,
      egressAttempts: providerEffects.egressAttempts,
      syntheticProviderCalls: providerEffects.syntheticProviderCalls,
      browserSecrets: providerEffects.browserSecrets,
      providerMode: providerEffects.providerMode,
      syntheticAdapterEnabled: providerEffects.syntheticAdapterEnabled,
      forbiddenNetworkGuardTriggered: providerEffects.forbiddenNetworkGuardTriggered,
    },
    cleanup,
    sourceDigests: [],
  };
};

const digestSources = async (fixtureSourcePaths = []) => Promise.all([...new Set([
  ...ENTERPRISE_LIFECYCLE_BROWSER_SOURCES,
  ...fixtureSourcePaths,
])].map(async sourcePath => ({
  path: sourcePath,
  sha256: sha256(await readFile(path.resolve(sourcePath))),
})));

const main = async () => {
  const startedAt = new Date().toISOString();
  const execution = resolveEnterpriseLifecycleExecutionIdentity();
  const databaseUrl = process.env.ENTERPRISE_LIFECYCLE_DATABASE_URL;
  if (!databaseUrl) throw new Error('ENTERPRISE_LIFECYCLE_DATABASE_URL_REQUIRED');
  await mkdir(outputDirectory, { recursive: true });
  for (const project of ENTERPRISE_LIFECYCLE_BROWSER_PROJECTS) {
    await unlink(path.join(outputDirectory, `browser-${project}.json`)).catch(error => {
      if (error?.code !== 'ENOENT') throw error;
    });
  }
  const { createEnterpriseLifecycleFixture, enterpriseLifecycleSourcePaths } = await import('./enterpriseLifecyclePostgresFixture.mjs');
  const fixture = await createEnterpriseLifecycleFixture({ databaseUrl, ...execution });
  const apiBaseUrl = assertEnterpriseLifecycleLoopbackUrl(fixture.baseUrl);
  const appPort = await availablePort();
  const appBaseUrl = `http://127.0.0.1:${appPort}`;
  let preview;
  let playwrightPassed = false;
  let cleanupSucceeded = false;
  let previewStopped = false;
  let browserScope;
  try {
    const buildEnvironment = {
      ...process.env,
      VITE_AVALA_RUNTIME_MODE: 'pilot',
      VITE_SUPABASE_URL: apiBaseUrl,
      VITE_SUPABASE_ANON_KEY: fixture.publicAnonKey,
      VITE_AI_EDGE_FUNCTIONS_ENABLED: 'false',
    };
    await run(process.execPath, [path.resolve('node_modules/vite/bin/vite.js'), 'build', '--config', 'vite.enterprise-lifecycle-acceptance.config.ts'], { env: buildEnvironment });
    preview = spawn(process.execPath, [path.resolve('node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(appPort)], {
      cwd: process.cwd(), env: buildEnvironment, stdio: 'inherit',
    });
    await waitForHttp(`${appBaseUrl}/`);
    await run(process.execPath, [path.resolve('node_modules/@playwright/test/cli.js'), 'test', '--config=playwright.enterprise-lifecycle-acceptance.config.ts'], {
      env: {
        ...process.env,
        ENTERPRISE_LIFECYCLE_APP_BASE_URL: appBaseUrl,
        ENTERPRISE_LIFECYCLE_API_BASE_URL: apiBaseUrl,
        ENTERPRISE_LIFECYCLE_CONTROL_TOKEN: fixture.controlToken,
        ENTERPRISE_LIFECYCLE_AUTH_STORAGE_KEY: fixture.authStorageKey,
        ENTERPRISE_LIFECYCLE_OUTPUT_DIR: outputDirectory,
      },
    });
    const browserCases = (await fixture.db.query('SELECT id::text FROM assess_v2_cases ORDER BY id')).rows.map(row => row.id);
    if (browserCases.length !== ENTERPRISE_LIFECYCLE_BROWSER_PROJECTS.length) {
      throw new Error(`ENTERPRISE_LIFECYCLE_BROWSER_CASE_INVENTORY_INVALID:${browserCases.length}`);
    }
    browserScope = {
      executionHash: fixture.evidence.scope.executionHash,
      organizationHash: fixture.evidence.scope.organizationHash,
      workspaceHash: fixture.evidence.scope.workspaceHash,
      caseHash: sha256(JSON.stringify(browserCases)),
      caseCount: browserCases.length,
    };
    playwrightPassed = true;
  } finally {
    previewStopped = await stop(preview);
    cleanupSucceeded = await fixture.close();
  }
  if (!playwrightPassed || !cleanupSucceeded) throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_OR_CLEANUP_FAILED');
  const fragments = await Promise.all(ENTERPRISE_LIFECYCLE_BROWSER_PROJECTS.map(readProjectFragment));
  const completedAt = new Date().toISOString();
  const evidence = aggregateEnterpriseLifecycleBrowserEvidence({
    fragments,
    journeyBinding: fixture.journeyBinding,
    executionId: fixture.evidence.execution.executionId,
    scope: browserScope,
    execution,
    providerEffects: fixture.evidence.providerEffects,
    cleanup: {
      backendAttempted: fixture.evidence.cleanup.attempted,
      backendSucceeded: fixture.evidence.cleanup.succeeded && cleanupSucceeded,
      browserContextsClosed: playwrightPassed && previewStopped,
    },
    startedAt,
    completedAt,
  });
  evidence.sourceDigests = await digestSources(enterpriseLifecycleSourcePaths);
  await writeFile(path.join(outputDirectory, 'browser-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log('ENTERPRISE_LIFECYCLE_BROWSER_ACCEPTANCE_PASS');
};

const invoked = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
