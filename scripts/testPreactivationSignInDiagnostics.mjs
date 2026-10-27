import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { PREACTIVATION_SIGN_IN_CHILD_BYTE_CAP, preactivationSignInDiagnosticPaths,
  readPreactivationSignInChild, readPreactivationSignInSummary,
  resolvePreactivationSignInIdentity } from './preactivationSignInDiagnostics.mjs';

const execFileAsync = promisify(execFile);
const privateExtensions = new Set(['.md', '.zip', '.png', '.jpg', '.jpeg', '.webm']);
const title = 'actual application uses the shared real-auth helper for rejected, cold and cached sign-in';

const listFiles = async directory => {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await listFiles(candidate));
    else result.push(candidate);
  }
  return result;
};

export const runPreactivationSignInDiagnosticsProbe = async () => {
  const parent = path.resolve('output/local-private');
  await mkdir(parent, { recursive: true });
  const playwrightTestUrl = pathToFileURL(path.resolve('node_modules/@playwright/test/index.mjs')).href;
  const reporterPath = path.resolve('scripts/preactivationSignInPlaywrightReporter.mjs');
  const correlationUrl = pathToFileURL(path.resolve('scripts/preactivationSignInRequestCorrelation.mjs')).href;
  const cliPath = path.resolve('node_modules/@playwright/test/cli.js');
  const scenarios = [];
  const runScenario = async ({ mode, project }) => {
    const workspaceRoot = await mkdtemp(path.join(parent, 'preactivation-signin-diagnostic-probe-'));
    const identity = resolvePreactivationSignInIdentity({}, randomBytes(32).toString('hex'));
    const phase = 'entry';
    const phaseNonce = randomBytes(32).toString('hex');
    const paths = preactivationSignInDiagnosticPaths(workspaceRoot, phase);
    const specPath = path.join(workspaceRoot, 'tests/browser/authenticatedHostedSignInEntry.spec.ts');
    const configPath = path.join(workspaceRoot, 'playwright.config.mjs');
    let cleanup = 'unknown';
    try {
      await mkdir(path.dirname(specPath), { recursive: true });
      await writeFile(specPath, `import { test, expect } from ${JSON.stringify(playwrightTestUrl)};
import { createPreactivationSignInRequestCorrelationCollector,
  PREACTIVATION_SIGN_IN_REQUEST_CORRELATION_ANNOTATION } from ${JSON.stringify(correlationUrl)};
test(${JSON.stringify(title)}, async ({ page }, testInfo) => {
  await page.setContent('<main><h1>Preactivation diagnostic probe</h1></main>');
  await expect(page.getByRole('heading')).toBeVisible();
  if (process.env.PREACTIVATION_PROBE_MODE === 'known') {
    const collector = createPreactivationSignInRequestCorrelationCollector();
    const request = { url: () => 'https://backend.example.invalid/functions/v1/tenant-session' };
    collector.requestDiagnostics.onRoute(request);
    collector.requestDiagnostics.onRequest(request);
    collector.actionDiagnostics.onStart(request, { route: '/functions/v1/tenant-session' });
    const snapshot = collector.freeze({ targetRequest: request,
      gate: { armed: false, waiting: true, released: false },
      pendingActionStarts: 1, activeActionCount: 0 });
    testInfo.annotations.push({ type: PREACTIVATION_SIGN_IN_REQUEST_CORRELATION_ANNOTATION,
      description: JSON.stringify(snapshot) });
    throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_TIMEOUT');
  }
  if (process.env.PREACTIVATION_PROBE_MODE === 'unknown') {
    testInfo.annotations.push({ type: PREACTIVATION_SIGN_IN_REQUEST_CORRELATION_ANNOTATION,
      description: JSON.stringify({ raw: 'Bearer probe-secret https://invalid.example.test body=probe UUID=00000000-0000-0000-0000-000000000000' }) });
    throw new Error('Bearer probe-secret https://invalid.example.test body=probe UUID=00000000-0000-0000-0000-000000000000');
  }
});
`, 'utf8');
      await writeFile(configPath, `import { defineConfig } from ${JSON.stringify(playwrightTestUrl)};
export default defineConfig({ testDir: ${JSON.stringify(path.dirname(specPath))},
  testMatch: ${JSON.stringify(path.basename(specPath))}, workers: 1, maxFailures: 1,
  timeout: 14000, expect: { timeout: 10000 },
  reporter: [[${JSON.stringify(reporterPath)}, { workspaceRoot: ${JSON.stringify(workspaceRoot)},
    identity: ${JSON.stringify(identity)}, phase: ${JSON.stringify(phase)}, phaseNonce: ${JSON.stringify(phaseNonce)} }]],
  outputDir: ${JSON.stringify(path.join(workspaceRoot, 'playwright-output'))}, preserveOutput: 'never',
  use: { browserName: 'chromium', actionTimeout: 10000, navigationTimeout: 10000,
    trace: 'off', screenshot: 'off', video: 'off', serviceWorkers: 'block' },
  projects: [{ name: ${JSON.stringify(project)}, use: { browserName: 'chromium' } }],
});
`, 'utf8');
      let failed = false;
      try {
        await execFileAsync(process.execPath, [cliPath, 'test', `--config=${configPath}`, '--workers=1'], {
          cwd: process.cwd(), timeout: 15_000, maxBuffer: 1024 * 1024,
          env: { ...process.env, PREACTIVATION_PROBE_MODE: mode },
        });
      } catch { failed = true; }
      const child = await readPreactivationSignInChild(identity, phase, phaseNonce, { workspaceRoot });
      const summary = await readPreactivationSignInSummary(identity, phase, phaseNonce, { workspaceRoot });
      if (summary.state !== 'available' || summary.summary.terminalCases.total !== 1) {
        throw new Error('PREACTIVATION_SIGN_IN_PROBE_SUMMARY_REJECTED');
      }
      if (mode === 'pass') {
        if (failed) throw new Error('PREACTIVATION_SIGN_IN_PROBE_PASS_BROWSER_REJECTED');
        if (child.reason !== 'MISSING') throw new Error('PREACTIVATION_SIGN_IN_PROBE_PASS_CHILD_REJECTED');
        if (summary.summary.terminalCases.passed !== 1) {
          throw new Error('PREACTIVATION_SIGN_IN_PROBE_PASS_SUMMARY_REJECTED');
        }
      } else {
        const expectedCode = mode === 'known' ? 'CONTROL_TIMEOUT' : 'REDACTED';
        if (!failed || child.state !== 'available' || child.child.failure.code !== expectedCode
          || child.child.project !== project) throw new Error('PREACTIVATION_SIGN_IN_PROBE_FAILURE_REJECTED');
        if (mode === 'known' && (child.child.requestCorrelation.state !== 'available'
          || child.child.requestCorrelation.detail.state !== 'captured')) {
          throw new Error('PREACTIVATION_SIGN_IN_PROBE_CORRELATION_REJECTED');
        }
        if (mode === 'unknown' && (child.child.requestCorrelation.state !== 'invalid'
          || child.child.requestCorrelation.reason !== 'SCHEMA')) {
          throw new Error('PREACTIVATION_SIGN_IN_PROBE_CORRELATION_REJECTED');
        }
        const serialized = await readFile(paths.childPath, 'utf8');
        if (Buffer.byteLength(serialized) > PREACTIVATION_SIGN_IN_CHILD_BYTE_CAP
          || ['probe-secret', 'invalid.example.test', '00000000-0000-0000-0000-000000000000']
            .some(value => serialized.includes(value))) {
          throw new Error('PREACTIVATION_SIGN_IN_PROBE_PRIVACY_REJECTED');
        }
      }
      const privateFiles = (await listFiles(workspaceRoot)).filter(file => privateExtensions.has(path.extname(file)));
      if (privateFiles.length) throw new Error('PREACTIVATION_SIGN_IN_PROBE_PRIVATE_OUTPUT_RETAINED');
      scenarios.push({ mode, project, status: 'passed', terminalCases: summary.summary.terminalCases });
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
      cleanup = await lstat(workspaceRoot).then(() => 'failed', error => error?.code === 'ENOENT' ? 'passed' : 'unknown');
      if (cleanup !== 'passed') throw new Error('PREACTIVATION_SIGN_IN_PROBE_CLEANUP_FAILED');
    }
  };
  await runScenario({ mode: 'pass', project: 'desktop-chromium' });
  await runScenario({ mode: 'known', project: 'desktop-chromium' });
  await runScenario({ mode: 'unknown', project: 'pixel-7-chromium' });
  return Object.freeze({ status: 'passed', scenarios, cleanup: 'passed', providers: 'off',
    perInvocationLimitMs: 15_000 });
};

const invoked = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) runPreactivationSignInDiagnosticsProbe().then(() => {
  console.log('PREACTIVATION_SIGN_IN_DIAGNOSTICS_PROBE_PASS');
}).catch(() => {
  console.error('PREACTIVATION_SIGN_IN_DIAGNOSTICS_PROBE_FAILED');
  process.exitCode = 1;
});
