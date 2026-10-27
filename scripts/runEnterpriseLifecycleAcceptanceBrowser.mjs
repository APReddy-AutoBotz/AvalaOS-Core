import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { lstat, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  CONNECTED_BROWSER_OPERATION_PHASES,
  connectedBrowserParentFailureCode,
  createConnectedBrowserDiagnosticSession,
} from './connectedBrowserDiagnostics.mjs';

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
  'scripts/connectedBrowserDiagnostics.mjs',
  'scripts/connectedBrowserPlaywrightReporter.mjs',
  'scripts/verifyConnectedBrowserDiagnostics.mjs',
  'vite.enterprise-lifecycle-acceptance.config.ts',
  'playwright.enterprise-lifecycle-acceptance.config.ts',
  'tests/browser/enterpriseLifecycleAcceptance/enterpriseLifecycleAcceptance.spec.ts',
  'services/assessV2Client.ts',
  'services/assessV2Client.revisionProjection.test.mjs',
  'services/supabaseClient.ts',
  'services/supabaseClient.enterpriseLifecycleBoundary.test.mjs',
]);
const authenticatedProductAcceptance = process.argv.includes('--authenticated');
const outputDirectory = authenticatedProductAcceptance
  ? path.join('output', 'acceptance', 'authenticated-product', 'browser')
  : path.join('output', 'acceptance', 'enterprise-lifecycle');
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

const runLegacyEnterpriseLifecycleAcceptanceBrowser = async () => {
  const startedAt = new Date().toISOString();
  const execution = resolveEnterpriseLifecycleExecutionIdentity();
  const localEvidence = authenticatedProductAcceptance
    ? await import('./verifyAuthenticatedLocalEvidence.mjs')
    : null;
  const authenticatedSourceDigests = localEvidence?.authenticatedLocalSourceDigests();
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
        ENTERPRISE_LIFECYCLE_AUTHENTICATED: authenticatedProductAcceptance ? 'true' : 'false',
      },
    });
    const browserCaseRows = (await fixture.db.query('SELECT id::text,process_id::text FROM assess_v2_cases ORDER BY id')).rows;
    const expectedCaseProcesses = fixture.expectedBrowserCaseProcesses();
    const actualProcessIds = browserCaseRows.map(row => row.process_id).sort();
    const expectedProcessIds = expectedCaseProcesses.map(item => item.processId).sort();
    if (browserCaseRows.length !== expectedCaseProcesses.length
      || JSON.stringify(actualProcessIds) !== JSON.stringify(expectedProcessIds)) {
      throw new Error(`ENTERPRISE_LIFECYCLE_BROWSER_CASE_INVENTORY_INVALID:${browserCaseRows.length}:${expectedCaseProcesses.length}`);
    }
    const browserCases = browserCaseRows.map(row => row.id);
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
  if (authenticatedProductAcceptance) {
    const localExecution = {
      headSha: execution.headSha,
      runId: String(execution.runId),
      runAttempt: String(execution.runAttempt),
      executionId: fixture.evidence.execution.executionId.replace(/^sha256:/u, ''),
      startedAt,
      completedAt,
    };
    const sourceDigestSetHash = localEvidence.authenticatedLocalDigest(authenticatedSourceDigests);
    const projects = { 'chromium-desktop': 'desktop-chromium', 'chromium-mobile': 'pixel-7-chromium' };
    const cases = fragments.flatMap(fragment => (fragment.authenticatedCases ?? []).map(row => ({
      ...row,
      project: projects[fragment.project],
      sourceBinding: { executionId: localExecution.executionId, sourceDigestSetHash },
    })));
    const manifest = localEvidence.createAuthenticatedLocalManifest({
      execution: localExecution,
      sourceDigests: authenticatedSourceDigests,
      cases,
      cleanup: { database: cleanupSucceeded, server: cleanupSucceeded, preview: previewStopped,
        browserState: playwrightPassed, secretBackend: cleanupSucceeded },
    });
    const manifestDirectory = path.join('output', 'acceptance', 'authenticated-product');
    await mkdir(manifestDirectory, { recursive: true });
    const manifestPath = path.join(manifestDirectory, 'local-evidence.json');
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    const completedSourceDigests = localEvidence.authenticatedLocalSourceDigests();
    const validationErrors = localEvidence.validateAuthenticatedLocalEvidence(manifest, {
      execution: localExecution,
      sourceDigests: completedSourceDigests,
    });
    if (validationErrors.length) {
      throw new Error(`AUTHENTICATED_LOCAL_EVIDENCE_INCOMPLETE:${validationErrors.join(',')}`);
    }
  }
  console.log('ENTERPRISE_LIFECYCLE_BROWSER_ACCEPTANCE_PASS');
};

export const runConnectedBrowserDiagnosticOrchestration = async ({ session, operations }) => {
  let primaryFailure = null;
  let diagnosticFailure = null;
  const diagnosticCall = async operation => {
    try { await operation(); return true; } catch (error) {
      diagnosticFailure ??= error;
      return false;
    }
  };
  const runPhase = async phase => {
    if (!await diagnosticCall(() => session.start(phase))) {
      primaryFailure ??= diagnosticFailure;
      return false;
    }
    try {
      await operations[phase]();
      if (!await diagnosticCall(() => session.pass(phase))) {
        primaryFailure ??= diagnosticFailure;
        return false;
      }
      return true;
    } catch (error) {
      primaryFailure ??= error;
      const code = typeof error?.diagnosticCode === 'string'
        ? error.diagnosticCode : connectedBrowserParentFailureCode(phase);
      await diagnosticCall(() => session.fail(phase, code));
      return false;
    }
  };

  const cleanup = { preview: 'unknown', fixture: 'unknown' };
  const cleanupFailures = [];
  try {
    for (const phase of ['fixture', 'build', 'preview', 'browser', 'inventory']) {
      if (!await runPhase(phase)) break;
    }
  } finally {
    await diagnosticCall(() => session.start('cleanup'));
    for (const [key, operation] of [['preview', operations.cleanupPreview], ['fixture', operations.cleanupFixture]]) {
      try {
        const state = await operation();
        cleanup[key] = ['unknown', 'not-attempted', 'passed', 'failed'].includes(state) ? state : 'unknown';
        if (['failed', 'unknown'].includes(cleanup[key])) {
          cleanupFailures.push(new Error('CONNECTED_BROWSER_CLEANUP_FAILED'));
        }
      } catch (error) {
        cleanup[key] = 'failed';
        cleanupFailures.push(error);
      }
    }
    await diagnosticCall(() => session.setCleanup(cleanup));
    if (cleanupFailures.length) {
      primaryFailure ??= cleanupFailures[0];
      await diagnosticCall(() => session.fail('cleanup', 'CLEANUP_FAILED'));
    } else await diagnosticCall(() => session.pass('cleanup'));
  }
  primaryFailure ??= diagnosticFailure;

  if (!primaryFailure) {
    for (const phase of ['aggregation', 'manifest']) if (!await runPhase(phase)) break;
  }

  const safeCleanup = [cleanup.preview, cleanup.fixture]
    .every(state => ['passed', 'not-attempted'].includes(state));
  const requestedStatus = primaryFailure ? (safeCleanup ? 'failed' : 'incomplete') : 'passed';
  let terminal = null;
  await diagnosticCall(async () => { terminal = await session.finalize(requestedStatus); });
  if (primaryFailure) throw primaryFailure;
  if (diagnosticFailure) throw diagnosticFailure;
  return terminal;
};

const runAuthenticatedEnterpriseLifecycleAcceptanceBrowser = async () => {
  const startedAt = new Date().toISOString();
  const execution = resolveEnterpriseLifecycleExecutionIdentity();
  const session = await createConnectedBrowserDiagnosticSession();
  let fixture;
  let fixtureCreationStarted = false;
  let preview;
  let previewCreationStarted = false;
  let cleanupSucceeded = false;
  let previewStopped = false;
  let playwrightPassed = false;
  let browserScope;
  let fragments;
  let evidence;
  let enterpriseLifecycleSourcePaths;
  let localEvidence;
  let authenticatedSourceDigests;
  let buildEnvironment;
  let appBaseUrl;
  let apiBaseUrl;

  const operations = {
    fixture: async () => {
      await mkdir(outputDirectory, { recursive: true });
      for (const candidate of [
        ...ENTERPRISE_LIFECYCLE_BROWSER_PROJECTS.map(project => path.join(outputDirectory, `browser-${project}.json`)),
        path.join(outputDirectory, 'browser-evidence.json'),
        path.join('output', 'acceptance', 'authenticated-product', 'local-evidence.json'),
      ]) {
        const exists = await lstat(candidate).then(() => true)
          .catch(error => error?.code === 'ENOENT' ? false : Promise.reject(error));
        if (exists) throw new Error('CONNECTED_BROWSER_STALE_ACCEPTANCE_OUTPUT_REJECTED');
      }
      const databaseUrl = process.env.ENTERPRISE_LIFECYCLE_DATABASE_URL;
      if (!databaseUrl) {
        const error = new Error('ENTERPRISE_LIFECYCLE_DATABASE_URL_REQUIRED');
        error.diagnosticCode = 'DATABASE_URL_REQUIRED';
        throw error;
      }
      localEvidence = await import('./verifyAuthenticatedLocalEvidence.mjs');
      authenticatedSourceDigests = localEvidence.authenticatedLocalSourceDigests();
      const fixtureModule = await import('./enterpriseLifecyclePostgresFixture.mjs');
      enterpriseLifecycleSourcePaths = fixtureModule.enterpriseLifecycleSourcePaths;
      fixtureCreationStarted = true;
      fixture = await fixtureModule.createEnterpriseLifecycleFixture({ databaseUrl, ...execution });
      apiBaseUrl = assertEnterpriseLifecycleLoopbackUrl(fixture.baseUrl);
    },
    build: async () => {
      const appPort = await availablePort();
      appBaseUrl = `http://127.0.0.1:${appPort}`;
      buildEnvironment = { ...process.env, VITE_AVALA_RUNTIME_MODE: 'pilot', VITE_SUPABASE_URL: apiBaseUrl,
        VITE_SUPABASE_ANON_KEY: fixture.publicAnonKey, VITE_AI_EDGE_FUNCTIONS_ENABLED: 'false' };
      await run(process.execPath, [path.resolve('node_modules/vite/bin/vite.js'), 'build',
        '--config', 'vite.enterprise-lifecycle-acceptance.config.ts'], { env: buildEnvironment });
    },
    preview: async () => {
      previewCreationStarted = true;
      preview = spawn(process.execPath, [path.resolve('node_modules/vite/bin/vite.js'), 'preview',
        '--host', '127.0.0.1', '--port', new URL(appBaseUrl).port], {
        cwd: process.cwd(), env: buildEnvironment, stdio: 'inherit',
      });
      const previewError = new Promise((_, reject) => preview.once('error', reject));
      await Promise.race([waitForHttp(`${appBaseUrl}/`), previewError]);
    },
    browser: async () => {
      await run(process.execPath, [path.resolve('node_modules/@playwright/test/cli.js'), 'test',
        '--config=playwright.enterprise-lifecycle-acceptance.config.ts'], {
        stdio: 'ignore',
        env: { ...process.env, ENTERPRISE_LIFECYCLE_APP_BASE_URL: appBaseUrl,
          ENTERPRISE_LIFECYCLE_API_BASE_URL: apiBaseUrl,
          ENTERPRISE_LIFECYCLE_CONTROL_TOKEN: fixture.controlToken,
          ENTERPRISE_LIFECYCLE_AUTH_STORAGE_KEY: fixture.authStorageKey,
          ENTERPRISE_LIFECYCLE_OUTPUT_DIR: outputDirectory,
          ENTERPRISE_LIFECYCLE_AUTHENTICATED: 'true',
          CONNECTED_BROWSER_DIAGNOSTIC_IDENTITY_JSON: JSON.stringify(session.identity) },
      });
      playwrightPassed = true;
    },
    inventory: async () => {
      const browserCaseRows = (await fixture.db.query(
        'SELECT id::text,process_id::text FROM assess_v2_cases ORDER BY id')).rows;
      const expectedCaseProcesses = fixture.expectedBrowserCaseProcesses();
      const actualProcessIds = browserCaseRows.map(row => row.process_id).sort();
      const expectedProcessIds = expectedCaseProcesses.map(item => item.processId).sort();
      if (browserCaseRows.length !== expectedCaseProcesses.length
        || JSON.stringify(actualProcessIds) !== JSON.stringify(expectedProcessIds)) {
        throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_CASE_INVENTORY_INVALID');
      }
      browserScope = { executionHash: fixture.evidence.scope.executionHash,
        organizationHash: fixture.evidence.scope.organizationHash,
        workspaceHash: fixture.evidence.scope.workspaceHash,
        caseHash: sha256(JSON.stringify(browserCaseRows.map(row => row.id))),
        caseCount: browserCaseRows.length };
    },
    cleanupPreview: async () => {
      if (!previewCreationStarted) return 'not-attempted';
      if (!preview) return 'unknown';
      previewStopped = await stop(preview);
      return previewStopped ? 'passed' : 'failed';
    },
    cleanupFixture: async () => {
      if (!fixtureCreationStarted) return 'not-attempted';
      if (!fixture) return 'unknown';
      cleanupSucceeded = await fixture.close();
      return cleanupSucceeded ? 'passed' : 'failed';
    },
    aggregation: async () => {
      fragments = await Promise.all(ENTERPRISE_LIFECYCLE_BROWSER_PROJECTS.map(readProjectFragment));
      const completedAt = new Date().toISOString();
      evidence = aggregateEnterpriseLifecycleBrowserEvidence({ fragments,
        journeyBinding: fixture.journeyBinding, executionId: fixture.evidence.execution.executionId,
        scope: browserScope, execution, providerEffects: fixture.evidence.providerEffects,
        cleanup: { backendAttempted: fixture.evidence.cleanup.attempted,
          backendSucceeded: fixture.evidence.cleanup.succeeded && cleanupSucceeded,
          browserContextsClosed: playwrightPassed && previewStopped }, startedAt, completedAt });
      evidence.sourceDigests = await digestSources(enterpriseLifecycleSourcePaths);
      await writeFile(path.join(outputDirectory, 'browser-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    },
    manifest: async () => {
      const completedAt = new Date().toISOString();
      const localExecution = { headSha: execution.headSha, runId: String(execution.runId),
        runAttempt: String(execution.runAttempt),
        executionId: fixture.evidence.execution.executionId.replace(/^sha256:/u, ''), startedAt, completedAt };
      const sourceDigestSetHash = localEvidence.authenticatedLocalDigest(authenticatedSourceDigests);
      const projects = { 'chromium-desktop': 'desktop-chromium', 'chromium-mobile': 'pixel-7-chromium' };
      const cases = fragments.flatMap(fragment => (fragment.authenticatedCases ?? []).map(row => ({ ...row,
        project: projects[fragment.project],
        sourceBinding: { executionId: localExecution.executionId, sourceDigestSetHash } })));
      const manifest = localEvidence.createAuthenticatedLocalManifest({ execution: localExecution,
        sourceDigests: authenticatedSourceDigests, cases,
        cleanup: { database: cleanupSucceeded, server: cleanupSucceeded, preview: previewStopped,
          browserState: playwrightPassed, secretBackend: cleanupSucceeded } });
      const manifestDirectory = path.join('output', 'acceptance', 'authenticated-product');
      await mkdir(manifestDirectory, { recursive: true });
      const manifestPath = path.join(manifestDirectory, 'local-evidence.json');
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
      const validationErrors = localEvidence.validateAuthenticatedLocalEvidence(manifest,
        { execution: localExecution, sourceDigests: localEvidence.authenticatedLocalSourceDigests() });
      if (validationErrors.length) throw new Error('AUTHENTICATED_LOCAL_EVIDENCE_INCOMPLETE');
    },
  };
  return runConnectedBrowserDiagnosticOrchestration({ session, operations });
};

const invoked = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) (authenticatedProductAcceptance
  ? runAuthenticatedEnterpriseLifecycleAcceptanceBrowser()
  : runLegacyEnterpriseLifecycleAcceptanceBrowser()).catch(error => {
  console.error(authenticatedProductAcceptance ? 'CONNECTED_BROWSER_DIAGNOSTIC_RUN_FAILED'
    : error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
