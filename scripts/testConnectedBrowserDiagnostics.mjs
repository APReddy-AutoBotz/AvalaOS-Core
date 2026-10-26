import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import {
  CONNECTED_BROWSER_CHILD_BYTE_CAP,
  connectedBrowserDiagnosticPaths,
  readConnectedBrowserChildDiagnostic,
} from './connectedBrowserDiagnostics.mjs';

const execFileAsync = promisify(execFile);
const privateExtensions = new Set(['.md', '.zip', '.png', '.jpg', '.jpeg', '.webm']);

const listFiles = async directory => {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await listFiles(candidate));
    else result.push(candidate);
  }
  return result;
};

export const runConnectedBrowserDiagnosticsProbe = async () => {
  const probeParent = path.resolve('output/local-private');
  await mkdir(probeParent, { recursive: true });
  const playwrightTestUrl = pathToFileURL(path.resolve('node_modules/@playwright/test/index.mjs')).href;
  const reporterPath = path.resolve('scripts/connectedBrowserPlaywrightReporter.mjs');
  const cliPath = path.resolve('node_modules/@playwright/test/cli.js');
  const runScenario = async ({ failure, project = 'chromium-desktop' }) => {
    const workspaceRoot = await mkdtemp(path.join(probeParent, 'connected-browser-playwright-probe-'));
    const paths = connectedBrowserDiagnosticPaths(workspaceRoot);
    const specPath = path.join(workspaceRoot,
      'tests/browser/enterpriseLifecycleAcceptance/enterpriseLifecycleAcceptance.spec.ts');
    const configPath = path.join(workspaceRoot, 'playwright.config.mjs');
    const identity = { headSha: 'local-working-tree', runId: `local-${process.pid}`, runAttempt: '1',
      workflow: 'local', logicalJob: 'local',
      command: 'node scripts/runEnterpriseLifecycleAcceptanceBrowser.mjs --authenticated',
      environment: 'local', nonce: randomBytes(32).toString('hex') };
    try {
    await mkdir(path.dirname(specPath), { recursive: true });
    await writeFile(specPath, `import { test, expect } from ${JSON.stringify(playwrightTestUrl)};
test('authors, replays, rejects stale work, requests changes and resubmits through the production UI', async ({ page }) => {
  await page.setContent('<main><h1>Connected browser diagnostic probe</h1></main>');
  await expect(page.getByRole('heading')).toBeVisible();
  if (process.env.CONNECTED_BROWSER_PROBE_FAILURE === 'known') {
    throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_TIMEOUT');
  }
  if (process.env.CONNECTED_BROWSER_PROBE_FAILURE === 'unknown') {
    throw new Error('Bearer probe-secret https://invalid.example.test body=probe UUID=00000000-0000-0000-0000-000000000000');
  }
});
`, 'utf8');
    await writeFile(configPath, `import { defineConfig } from ${JSON.stringify(playwrightTestUrl)};
export default defineConfig({ testDir: ${JSON.stringify(path.dirname(specPath))}, testMatch: ${JSON.stringify(path.basename(specPath))},
  workers: 1, maxFailures: 1, timeout: 14000, expect: { timeout: 10000 },
  reporter: [[${JSON.stringify(reporterPath)}, { workspaceRoot: ${JSON.stringify(workspaceRoot)}, identity: ${JSON.stringify(identity)} }]],
  outputDir: ${JSON.stringify(path.join(workspaceRoot, 'playwright-output'))}, preserveOutput: 'never',
  use: { browserName: 'chromium', actionTimeout: 10000, navigationTimeout: 10000,
    trace: 'off', screenshot: 'off', video: 'off', serviceWorkers: 'block' },
  projects: [{ name: ${JSON.stringify(project)}, use: { browserName: 'chromium' } }],
});
`, 'utf8');
    let didFail = false;
    try {
      await execFileAsync(process.execPath,
      [cliPath, 'test', `--config=${configPath}`, '--workers=1'], {
        cwd: process.cwd(), timeout: 15_000, maxBuffer: 1024 * 1024,
        env: { ...process.env, CONNECTED_BROWSER_PROBE_FAILURE: failure ?? 'none' },
      });
    } catch { didFail = true; }
    const result = await readConnectedBrowserChildDiagnostic(identity, { workspaceRoot });
    if (!failure) {
      if (didFail || result.reason !== 'MISSING') throw new Error('CONNECTED_BROWSER_PROBE_PASS_REJECTED');
    } else {
      if (!didFail || result.state !== 'available'
        || result.child.failure.code !== (failure === 'known' ? 'CONTROL_TIMEOUT' : 'REDACTED')
        || result.child.project !== project
        || result.child.failure.location?.source
          !== 'tests/browser/enterpriseLifecycleAcceptance/enterpriseLifecycleAcceptance.spec.ts') {
        throw new Error('CONNECTED_BROWSER_PROBE_DIAGNOSTIC_REJECTED');
      }
      const child = await readFile(paths.childPath);
      const serialized = child.toString('utf8');
      if (child.length > CONNECTED_BROWSER_CHILD_BYTE_CAP
        || serialized.includes('Connected browser diagnostic probe')
        || serialized.includes('probe-secret')
        || serialized.includes('invalid.example.test')
        || serialized.includes('00000000-0000-0000-0000-000000000000')) {
        throw new Error('CONNECTED_BROWSER_PROBE_PRIVACY_REJECTED');
      }
    }
    const privateFiles = (await listFiles(workspaceRoot)).filter(file => privateExtensions.has(path.extname(file)));
    if (privateFiles.length) throw new Error('CONNECTED_BROWSER_PROBE_PRIVATE_OUTPUT_RETAINED');
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  };
  await runScenario({ failure: null });
  await runScenario({ failure: 'known' });
  await runScenario({ failure: 'unknown', project: 'chromium-mobile' });
  return true;
};

const invoked = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) runConnectedBrowserDiagnosticsProbe().then(() => {
  console.log('CONNECTED_BROWSER_DIAGNOSTICS_PROBE_PASS');
}).catch(() => {
  console.error('CONNECTED_BROWSER_DIAGNOSTICS_PROBE_FAILED');
  process.exitCode = 1;
});
