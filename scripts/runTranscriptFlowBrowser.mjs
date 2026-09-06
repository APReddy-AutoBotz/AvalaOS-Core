import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { get as httpGet } from 'node:http';
import { createServer } from 'node:net';
import path from 'node:path';
import {
  createAcceptanceReportMetadata,
  createSyntheticRegressionOutputRoot,
  decodeAcceptanceExecutionProfile,
  verifySyntheticRegressionResultInventory,
} from './acceptanceExecutionProfile.mjs';

export const READINESS_TIMEOUT_MS = 120_000;
const READINESS_REQUEST_TIMEOUT_MS = 1_000;
const READINESS_POLL_INTERVAL_MS = 250;
const OUTPUT_CAPTURE_LIMIT = 4_000;
export const SYNTHETIC_BROWSER_VITE_CONFIG = 'vite.synthetic-browser-test.config.ts';

const syntheticRegressionCommon = {
  readinessPath: '/sandbox',
  serverCommand: 'preview',
  build: true,
  environment: {
    AVALAOS_HOSTED_NONPRODUCTION_STABLE_TESTING: 'authorized',
    SITE_NAME: 'avalaos-pilot',
  },
};

export const browserModeByFlag = new Map([
  ['--preview-sandbox-regression', {
    ...syntheticRegressionCommon,
    label: 'PR #264 exact-head synthetic Sandbox regression',
    port: '4201',
    config: 'playwright.local-sandbox-regression.config.ts',
    localAcceptance: {
      flag: '--preview-sandbox-regression',
      reportArea: 'sandbox',
      sourcePaths: [
        'tests/browser/exhaustiveHostedAcceptance.spec.ts',
        'tests/acceptance/execution-bindings.json',
        'tests/acceptance/catalog/test-catalog.json',
      ],
      inventory: 'sandbox',
    },
  }],
  ['--preview-navigation-regression', {
    ...syntheticRegressionCommon,
    label: 'PR #264 exact-head synthetic navigation regression',
    port: '4202',
    config: 'playwright.local-navigation-regression.config.ts',
    localAcceptance: {
      flag: '--preview-navigation-regression',
      reportArea: 'navigation',
      sourcePaths: ['tests/browser/controllerNavigationHistory.spec.ts'],
      inventory: 'navigation',
    },
  }],
  ['--full-platform', {
    label: 'Full-platform fixture campaign',
    // Keep the governed campaign isolated from the retained default suite,
    // whose Playwright-owned preview uses 4173.
    port: '4192',
    config: 'playwright.full-platform.config.ts',
    readinessPath: '/sandbox',
    serverCommand: 'preview',
    build: true,
    environment: {
      AVALAOS_HOSTED_NONPRODUCTION_STABLE_TESTING: 'authorized',
      SITE_NAME: 'avalaos-pilot',
    },
    playwrightEnvironment: {
      FULL_PLATFORM_BASE_URL: 'http://127.0.0.1:4192',
      FULL_PLATFORM_EXECUTION_MODE: 'fixture',
    },
  }],
  ['--enterprise-intelligence', {
    label: 'Enterprise Intelligence',
    port: '4191',
    config: 'playwright.enterprise-intelligence.config.ts',
    readinessPath: '/tests/browser/enterpriseIntelligenceHarness.html',
    serverCommand: 'preview',
    build: true,
    environment: {
      ENTERPRISE_INTELLIGENCE_BROWSER_TEST_BUILD: 'true',
    },
  }],
  ['--pr1d', {
    label: 'PR1D',
    port: '4183',
    config: 'playwright.pr1d.config.ts',
    readinessPath: '/',
    serverCommand: 'preview',
    build: true,
  }],
  ['--studio-artifacts', {
    label: 'Studio artifacts',
    port: '4187',
    config: 'playwright.studio-artifacts.config.ts',
    readinessPath: '/tests/browser/studioArtifactsHarness.html',
    serverCommand: 'preview',
    build: true,
    environment: {
      STUDIO_ARTIFACT_BROWSER_TEST_BUILD: 'true',
    },
  }],
  ['--studio-pr-b', {
    label: 'Governed multi-source Studio PR B',
    port: '4197',
    config: 'playwright.studio-pr-b.config.ts',
    readinessPath: '/tests/browser/studioPrB/harness.html',
    serverCommand: 'preview',
    build: true,
    viteConfig: 'vite.studio-pr-b.config.ts',
    playwrightEnvironment: {
      STUDIO_PR_B_EXTERNAL_SERVER: 'true',
    },
  }],
  ['--studio-private-artifacts', {
    label: 'Studio private artifacts',
    port: '4190',
    config: 'playwright.studio-private-artifacts.config.ts',
    readinessPath: '/tests/browser/studioPrivateArtifactsHarness.html',
    serverCommand: 'preview',
    build: true,
    environment: {
      STUDIO_PRIVATE_ARTIFACT_BROWSER_TEST_BUILD: 'true',
    },
    playwrightEnvironment: {
      STUDIO_PRIVATE_ARTIFACT_EXTERNAL_SERVER: 'true',
    },
  }],
  ['--pr1e', {
    label: 'PR 1E',
    port: '4184',
    config: 'playwright.pr1e.config.ts',
    readinessPath: '/',
    serverCommand: 'preview',
    build: true,
    playwrightEnvironment: {
      PR1E_EXTERNAL_SERVER: 'true',
    },
  }],
  ['--pr1f', {
    label: 'PR 1F',
    port: '4185',
    config: 'playwright.pr1f.config.ts',
    readinessPath: '/',
    serverCommand: 'preview',
    build: true,
    playwrightEnvironment: {
      PR1F_EXTERNAL_SERVER: 'true',
    },
  }],
  ['--pr1g', {
    label: 'PR 1G',
    port: '4186',
    config: 'playwright.pr1g.config.ts',
    readinessPath: '/',
    serverCommand: 'preview',
    build: true,
    playwrightEnvironment: {
      PR1G_EXTERNAL_SERVER: 'true',
    },
  }],
  ['--delivery-monitor-pr-c', {
    label: 'Governed Delivery/Monitor PR C',
    port: '4198',
    config: 'playwright.delivery-monitor-pr-c.config.ts',
    readinessPath: '/tests/browser/deliveryMonitorPrC/harness.html',
    serverCommand: 'preview',
    build: true,
    environment: {
      DELIVERY_MONITOR_PR_C_BROWSER_TEST_BUILD: 'true',
    },
  }],
  ['--pilot-operations', {
    label: 'Pilot Operations',
    port: '4427',
    config: 'playwright.pilot-operations.config.ts',
    readinessPath: '/tests/browser/pilotOperationsHarness.html',
    serverCommand: 'preview',
    build: true,
    runtimeMode: 'automated_test',
    environment: {
      PILOT_OPERATIONS_BROWSER_TEST_BUILD: 'true',
    },
    playwrightEnvironment: {
      PILOT_OPERATIONS_EXTERNAL_SERVER: 'true',
    },
  }],
  ['--trust-assurance', {
    label: 'Trust assurance',
    port: '4417',
    config: 'playwright.trust-assurance.config.ts',
    readinessPath: '/tests/trust-assurance/browser/trustAssuranceHarness.html',
    serverCommand: 'preview',
    build: true,
    viteConfig: 'vite.trust-assurance.config.ts',
    playwrightEnvironment: {
      TRUST_ASSURANCE_EXTERNAL_SERVER: 'true',
    },
  }],
]);

export const defaultBrowserMode = {
  label: 'Transcript-flow',
  port: '4193',
  config: 'playwright.transcript-flow-pr-a.config.ts',
  readinessPath: '/tests/browser/enterpriseIntelligenceHarness.html',
  serverCommand: 'preview',
  build: true,
  environment: {
    ENTERPRISE_INTELLIGENCE_BROWSER_TEST_BUILD: 'true',
  },
};

const ANSI_ESCAPE_PATTERN = /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;

export const sanitizeProcessOutput = value => String(value)
  .replace(ANSI_ESCAPE_PATTERN, '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');

export const createCappedOutputCapture = (limit = OUTPUT_CAPTURE_LIMIT) => {
  const output = { stdout: '', stderr: '' };
  const append = (stream, chunk) => {
    output[stream] = `${output[stream]}${sanitizeProcessOutput(chunk)}`.slice(-limit);
  };
  return {
    append,
    snapshot: () => ({ ...output }),
  };
};

const escapeRegularExpression = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const createOwnedListeningState = ({ host, port, limit = 1_024 }) => {
  const ownedUrl = `http://${host}:${port}/`;
  const listeningLinePattern = new RegExp(
    `^\\s*(?:➜\\s*)?Local:\\s+${escapeRegularExpression(ownedUrl)}\\s*$`,
  );
  let pendingLine = '';
  let boundedStdout = '';
  let observed = false;

  const consume = chunk => {
    const sanitized = sanitizeProcessOutput(chunk);
    boundedStdout = `${boundedStdout}${sanitized}`.slice(-limit);
    const lines = `${pendingLine}${sanitized}`.slice(-limit).split(/\r\n|\r|\n/);
    pendingLine = lines.pop() ?? '';
    for (const line of lines) {
      if (listeningLinePattern.test(line)) observed = true;
    }
  };

  return {
    consume,
    snapshot: () => ({ observed, boundedStdout, pendingLine }),
  };
};

export const classifyReadinessError = error => {
  const code = error?.cause?.code ?? error?.code;
  if (code === 'ECONNREFUSED') return 'connection refused';
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError' || code === 'ETIMEDOUT') {
    return 'request timeout';
  }
  const message = sanitizeProcessOutput(error?.message ?? String(error ?? 'unknown fetch error'))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
  return `fetch error${message ? `: ${message}` : ''}`;
};

export const requestBrowserReadiness = (url, { signal } = {}) => new Promise((resolve, reject) => {
  const request = httpGet(url, { signal }, response => {
    response.resume();
    const status = response.statusCode ?? 0;
    resolve({
      ok: status >= 200 && status < 300,
      status,
      statusText: response.statusMessage ?? '',
    });
  });
  request.once('error', reject);
});

export const assertBrowserPortAvailable = ({
  host,
  port,
  label,
  createServerImpl = createServer,
}) => new Promise((resolve, reject) => {
  const probe = createServerImpl();
  let settled = false;
  const fail = error => {
    if (settled) return;
    settled = true;
    const code = error?.code ? ` (${sanitizeProcessOutput(error.code)})` : '';
    const reason = error?.code === 'EADDRINUSE'
      ? 'address already in use'
      : sanitizeProcessOutput(error?.message ?? String(error ?? 'unknown bind error'))
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 240);
    reject(new Error(`${label} browser port preflight rejected ${host}:${port}${code}: ${reason}. No build or Playwright process was started.`));
  };
  probe.once('error', fail);
  probe.once('listening', () => {
    probe.close(error => {
      if (error) {
        fail(error);
        return;
      }
      if (settled) return;
      settled = true;
      resolve();
    });
  });
  try {
    probe.listen({ host, port: Number(port), exclusive: true });
  } catch (error) {
    fail(error);
  }
});

const serverHasExited = server => server.exitCode !== null || server.signalCode !== null;
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

const formatPhaseDiagnostics = ({ phase, lastReadinessObservation, capture, ownedListeningState }) => {
  const { stdout, stderr } = capture.snapshot();
  const ownedBindingObserved = ownedListeningState.snapshot().observed;
  return [
    `phase: ${phase}`,
    `owned server binding observed: ${ownedBindingObserved ? 'yes' : 'no'}`,
    `last readiness observation: ${lastReadinessObservation}`,
    ...(stdout ? [`server stdout (sanitized tail):\n${stdout}`] : []),
    ...(stderr ? [`server stderr (sanitized tail):\n${stderr}`] : []),
  ].join('\n');
};

export const waitForBrowserServer = async ({
  server,
  spawnState,
  harnessUrl,
  label,
  capture,
  ownedListeningState,
  fetchImpl = requestBrowserReadiness,
  timeoutMs = READINESS_TIMEOUT_MS,
  requestTimeoutMs = READINESS_REQUEST_TIMEOUT_MS,
  pollIntervalMs = READINESS_POLL_INTERVAL_MS,
  sleep = delay,
  now = Date.now,
}) => {
  const deadline = now() + timeoutMs;
  let lastReadinessObservation = 'readiness request not yet completed';

  while (now() < deadline) {
    if (spawnState.error) {
      const code = spawnState.error.code ? ` (${spawnState.error.code})` : '';
      lastReadinessObservation = `server spawn error${code}: ${sanitizeProcessOutput(spawnState.error.message).slice(0, 240)}`;
      throw new Error(`${label} browser server could not start.\n${formatPhaseDiagnostics({
        phase: 'server spawn', lastReadinessObservation, capture, ownedListeningState,
      })}`);
    }
    if (serverHasExited(server)) {
      lastReadinessObservation = `server exited with code ${server.exitCode ?? 'null'}${server.signalCode ? ` and signal ${server.signalCode}` : ''}`;
      throw new Error(`${label} browser server exited before readiness.\n${formatPhaseDiagnostics({
        phase: 'server readiness', lastReadinessObservation, capture, ownedListeningState,
      })}`);
    }
    try {
      const signal = typeof AbortSignal?.timeout === 'function'
        ? AbortSignal.timeout(requestTimeoutMs)
        : undefined;
      const response = await fetchImpl(harnessUrl, { signal });
      if (response.ok && ownedListeningState.snapshot().observed) return;
      if (response.ok) {
        lastReadinessObservation = `HTTP ${response.status} received before the owned server binding signal`;
      } else {
        lastReadinessObservation = `non-OK HTTP status ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;
      }
    } catch (error) {
      lastReadinessObservation = classifyReadinessError(error);
    }
    await sleep(pollIntervalMs);
  }

  throw new Error(`${label} browser server did not become ready within ${timeoutMs}ms.\n${formatPhaseDiagnostics({
    phase: 'server readiness timeout', lastReadinessObservation, capture, ownedListeningState,
  })}`);
};

export const stopOwnedBrowserServer = async ({
  server,
  spawnState,
  label,
  spawnSyncImpl = spawnSync,
  sleep = delay,
}) => {
  if (serverHasExited(server) || (spawnState.error && !server.pid)) return;
  const closed = new Promise(resolve => server.once('close', resolve));
  server.kill();
  await Promise.race([closed, sleep(5_000)]);
  if (!serverHasExited(server) && process.platform === 'win32') {
    spawnSyncImpl('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    await Promise.race([closed, sleep(5_000)]);
  }
  if (!serverHasExited(server)) throw new Error(`Could not stop owned ${label} browser server process ${server.pid}.`);
};

const runOwnedCommand = ({ arguments_, root, environment, spawnImpl }) => new Promise((resolve, reject) => {
  const child = spawnImpl(process.execPath, arguments_, {
    cwd: root,
    env: environment,
    stdio: 'inherit',
    windowsHide: true,
  });
  child.once('error', reject);
  child.once('close', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
});

export const resolveCurrentCheckoutSha = ({ root, spawnSyncImpl = spawnSync }) => {
  const result = spawnSyncImpl('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const sha = typeof result.stdout === 'string' ? result.stdout.trim() : '';
  if (result.status !== 0 || !/^[0-9a-f]{40}$/u.test(sha)) {
    throw new Error('LOCAL_SOURCE_FIXTURE_CHECKOUT_SHA_UNAVAILABLE');
  }
  return sha;
};

export const createLocalAcceptanceInvocationId = () => randomBytes(16).toString('hex');

const prepareLocalAcceptanceExecution = ({
  mode,
  root,
  environment,
  spawnSyncImpl,
  invocationIdFactory,
}) => {
  if (!mode.localAcceptance) return null;
  const checkoutSha = resolveCurrentCheckoutSha({ root, spawnSyncImpl });
  const invocationId = invocationIdFactory();
  const localEnvironment = {
    ...environment,
    ACCEPTANCE_EXECUTION_KIND: 'local_source_fixture',
    ACCEPTANCE_RELEASE_SHA: checkoutSha,
    ACCEPTANCE_CHECKOUT_SHA: checkoutSha,
    ACCEPTANCE_INVOCATION_ID: invocationId,
    LOCAL_ACCEPTANCE_BASE_URL: `http://127.0.0.1:${mode.port}`,
  };
  const profile = decodeAcceptanceExecutionProfile(localEnvironment, { expectedCheckoutSha: checkoutSha });
  const exactCommand = ['node', 'scripts/runTranscriptFlowBrowser.mjs', mode.localAcceptance.flag];
  const metadata = createAcceptanceReportMetadata({
    profile,
    exactCommand,
    configPath: mode.config,
    sourcePaths: mode.localAcceptance.sourcePaths,
  });
  const relativeOutputRoot = createSyntheticRegressionOutputRoot({
    profile,
    reportArea: mode.localAcceptance.reportArea,
  });
  const outputRoot = path.join(root, ...relativeOutputRoot.split('/'));
  if (existsSync(outputRoot)) throw new Error('SYNTHETIC_REGRESSION_INVOCATION_ALREADY_EXISTS');
  return {
    checkoutSha,
    invocationId,
    environment: localEnvironment,
    metadata,
    profile,
    reportPath: path.join(outputRoot, 'playwright-results.json'),
  };
};

const expectedSyntheticRegressionInventory = ({ mode, root }) => {
  if (mode.localAcceptance.inventory === 'navigation') {
    return {
      expectedProjects: ['desktop-chromium', 'pixel-7-chromium'],
      expectedTestIds: ['CONTROLLER-NAV-HISTORY-001'],
      executableTestIds: ['CONTROLLER-NAV-HISTORY-001'],
    };
  }
  const bindings = JSON.parse(readFileSync(path.join(root, 'tests', 'acceptance', 'execution-bindings.json'), 'utf8')).hostedTests;
  return {
    expectedProjects: ['desktop-chromium', 'pixel-7-chromium'],
    expectedTestIds: bindings.map(binding => binding.testId),
    executableTestIds: bindings.filter(binding => binding.scenario).map(binding => binding.testId),
  };
};

export const verifyLocalAcceptanceReport = ({ mode, root, metadata, profile, reportPath }) => {
  if (!mode.localAcceptance) throw new Error('SYNTHETIC_REGRESSION_MODE_REQUIRED');
  const expectedRelativeRoot = createSyntheticRegressionOutputRoot({
    profile,
    reportArea: mode.localAcceptance.reportArea,
  });
  const expectedReportPath = path.join(root, ...expectedRelativeRoot.split('/'), 'playwright-results.json');
  if (reportPath !== expectedReportPath || metadata.invocationId !== profile.invocationId) {
    throw new Error('SYNTHETIC_REGRESSION_INVOCATION_BINDING_MISMATCH');
  }
  let report;
  try {
    report = JSON.parse(readFileSync(expectedReportPath, 'utf8'));
  } catch {
    throw new Error('SYNTHETIC_REGRESSION_REPORT_UNAVAILABLE');
  }
  return verifySyntheticRegressionResultInventory({
    report,
    expectedMetadata: metadata,
    ...expectedSyntheticRegressionInventory({ mode, root }),
  });
};

export const runBrowserHarness = async ({
  mode,
  playwrightArguments = [],
  root = process.cwd(),
  environment = process.env,
  spawnImpl = spawn,
  spawnSyncImpl = spawnSync,
  fetchImpl = requestBrowserReadiness,
  readinessTimeoutMs = READINESS_TIMEOUT_MS,
  readinessRequestTimeoutMs = READINESS_REQUEST_TIMEOUT_MS,
  readinessPollIntervalMs = READINESS_POLL_INTERVAL_MS,
  portPreflightImpl = assertBrowserPortAvailable,
  sleep = delay,
  now = Date.now,
  invocationIdFactory = createLocalAcceptanceInvocationId,
}) => {
  if (mode.localAcceptance && (!Array.isArray(playwrightArguments) || playwrightArguments.length > 0)) {
    throw new Error('SYNTHETIC_REGRESSION_PARTIAL_EXECUTION_REJECTED');
  }
  const localAcceptance = prepareLocalAcceptanceExecution({
    mode,
    root,
    environment,
    spawnSyncImpl,
    invocationIdFactory,
  });
  await portPreflightImpl({ host: '127.0.0.1', port: mode.port, label: mode.label });
  const viteConfig = mode.viteConfig ?? SYNTHETIC_BROWSER_VITE_CONFIG;

  const serverEnvironment = {
    ...environment,
    ...mode.environment,
    VITE_AVALA_RUNTIME_MODE: mode.runtimeMode ?? 'pilot',
    VITE_SUPABASE_URL: 'https://127.0.0.1:59999',
    VITE_SUPABASE_ANON_KEY: 'sb_publishable_synthetic_public_key_264',
    VITE_AI_EDGE_FUNCTIONS_ENABLED: 'false',
  };
  const playwrightEnvironment = {
    ...environment,
    ...mode.playwrightEnvironment,
    ...localAcceptance?.environment,
  };

  if (mode.build) {
    const buildExitCode = await runOwnedCommand({
      arguments_: [
        path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'),
        'build',
        '--config', viteConfig,
      ],
      root,
      environment: serverEnvironment,
      spawnImpl,
    });
    if (buildExitCode !== 0) return buildExitCode;
  }

  const capture = createCappedOutputCapture();
  const ownedListeningState = createOwnedListeningState({ host: '127.0.0.1', port: mode.port });
  const spawnState = { error: null };
  const server = spawnImpl(process.execPath, [
    path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'),
    ...(mode.serverCommand === 'preview' ? ['preview'] : []),
    '--config', viteConfig,
    '--host', '127.0.0.1', '--port', mode.port, '--strictPort', '--clearScreen', 'false',
  ], {
    cwd: root,
    env: serverEnvironment,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  server.once('error', error => {
    spawnState.error = error;
  });
  for (const stream of ['stdout', 'stderr']) {
    server[stream]?.setEncoding('utf8');
    server[stream]?.on('data', chunk => {
      capture.append(stream, chunk);
      if (stream === 'stdout') ownedListeningState.consume(chunk);
    });
  }

  const harnessUrl = `http://127.0.0.1:${mode.port}${mode.readinessPath}`;
  let exitCode = 1;
  try {
    await waitForBrowserServer({
      server,
      spawnState,
      harnessUrl,
      label: mode.label,
      capture,
      ownedListeningState,
      fetchImpl,
      timeoutMs: readinessTimeoutMs,
      requestTimeoutMs: readinessRequestTimeoutMs,
      pollIntervalMs: readinessPollIntervalMs,
      sleep,
      now,
    });
    exitCode = await runOwnedCommand({
      arguments_: [
        path.join(root, 'node_modules', '@playwright', 'test', 'cli.js'),
        'test', `--config=${mode.config}`, ...playwrightArguments,
      ],
      root,
      environment: playwrightEnvironment,
      spawnImpl,
    });
    if (exitCode === 0 && localAcceptance) {
      const inventory = verifyLocalAcceptanceReport({
        mode,
        root,
        metadata: localAcceptance.metadata,
        profile: localAcceptance.profile,
        reportPath: localAcceptance.reportPath,
      });
      console.log(`Synthetic regression inventory verified: ${inventory.passed} passed, ${inventory.skipped} not_run, ${inventory.total} total.`);
    }
  } finally {
    await stopOwnedBrowserServer({ server, spawnState, label: mode.label, spawnSyncImpl, sleep });
  }
  return exitCode;
};

export const runBrowserCli = async (arguments_ = process.argv.slice(2)) => {
  const [firstArgument, ...remainingArguments] = arguments_;
  const selectedMode = browserModeByFlag.get(firstArgument);
  if (selectedMode?.localAcceptance && remainingArguments.length > 0) {
    throw new Error('SYNTHETIC_REGRESSION_PARTIAL_EXECUTION_REJECTED');
  }
  return runBrowserHarness({
    mode: selectedMode ?? defaultBrowserMode,
    playwrightArguments: selectedMode ? remainingArguments : arguments_,
  });
};

const isDirectInvocation = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectInvocation) {
  try {
    process.exitCode = await runBrowserCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
