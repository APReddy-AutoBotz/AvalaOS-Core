import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { validateAuthenticatedHostedPlaywrightDiagnostic } from './authenticatedHostedDiagnostics.mjs';
const execFileAsync = promisify(execFile);

test('real primary locator timeout retains its nested operation after teardown steps finish', async t => {
  const root = await mkdtemp(path.join(process.cwd(), 'authenticated-primary-timeout-regression-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const destination = path.join(root, 'diagnostic.json');
  const config = path.join(root, 'playwright.config.mjs');
  await writeFile(path.join(root, 'timeout.spec.mjs'), `import { test } from '@playwright/test';
test.afterEach(async () => {
  await test.step('hosted:queue:teardown', async () => {
    await test.step('hosted:queue:network-drain', async () => {});
    await test.step('hosted:queue:case-drain', async () => {});
  });
});
test('authors, replays, rejects stale work, requests changes and resubmits through the production UI', async ({ page }) => {
  await page.setContent('<main>Local timeout fixture</main>');
  await test.step('hosted:primary:journey', () =>
    test.step('hosted:primary:v2-finalization-and-review', async () => {
      await page.getByRole('button', { name: 'private-fixture-target' }).click({ timeout: 15000 });
    }));
});
`);
  await writeFile(config, `export default {
    testDir: ${JSON.stringify(root.replaceAll('\\', '/'))}, timeout: 3000, workers: 1,
    projects: [{ name: 'desktop-chromium' }],
    reporter: [[${JSON.stringify(path.resolve('scripts/authenticatedHostedPlaywrightReporter.mjs'))}]],
    use: { trace: 'off', screenshot: 'off', video: 'off' }
  };`);
  let exitCode = 0;
  try {
    await execFileAsync(process.execPath, [path.resolve('node_modules/@playwright/test/cli.js'), 'test', '--config', config], {
      cwd: process.cwd(), env: { ...process.env, AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH: destination },
      maxBuffer: 2_000_000, timeout: 30_000,
    });
  } catch (error) { exitCode = error?.code; }
  assert.equal(exitCode, 1);
  const serialized = await readFile(destination, 'utf8');
  const value = JSON.parse(serialized);
  assert.equal(value.category, 'timeout');
  assert.equal(value.operation, 'PRIMARY_V2_FINALIZATION_AND_REVIEW');
  assert.deepEqual(validateAuthenticatedHostedPlaywrightDiagnostic(value), value);
  assert.equal(serialized.includes('private-fixture-target'), false);
  assert.equal(serialized.includes('locator'), false);
});
