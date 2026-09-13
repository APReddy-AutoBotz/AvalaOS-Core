import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const head = 'a'.repeat(40);
const workflowSha = 'c'.repeat(40);
const deployId = 'b'.repeat(24);
const workflowPath = '.github/workflows/preview-exhaustive-browser-qa.yml';
const repository = 'owner/repository';
const workflowRef = `${repository}/${workflowPath}@refs/pull/264/merge`;
const branch = 'controller/governed-delivery-monitor-pr-c-20260831';
const playwrightModuleUrl = pathToFileURL(path.join(root, 'node_modules/@playwright/test/index.mjs')).href;
const playwrightCli = path.join(root, 'node_modules/@playwright/test/cli.js');
const profileModuleUrl = pathToFileURL(path.join(root, 'scripts/acceptanceExecutionProfile.mjs')).href;
const previewContractUrl = pathToFileURL(path.join(root, 'scripts/previewBrowserEvidenceContract.mjs')).href;
const metadataFixtureAuthority = new WeakMap();
const METADATA_FIXTURE_PREFIX = 'avalaos-playwright-metadata-';
const METADATA_CACHE_DIRECTORY = 'playwright-transform-cache';

const samePath = (left, right) => process.platform === 'win32'
  ? path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase()
  : path.resolve(left) === path.resolve(right);
const inside = (owner, target) => {
  const relative = path.relative(owner, target);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
};
const rejectFixture = code => { throw new Error(`PLAYWRIGHT_METADATA_FIXTURE_REJECTED:${code}`); };

const inspectMetadataFixtureRoot = fixture => {
  const state = metadataFixtureAuthority.get(fixture);
  if (!state?.active) rejectFixture('authority');
  let temporaryRootReal;
  try {
    const temporaryStat = lstatSync(state.temporaryRoot);
    if (!temporaryStat.isDirectory() || temporaryStat.isSymbolicLink()) rejectFixture('root');
    temporaryRootReal = realpathSync(state.temporaryRoot);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('PLAYWRIGHT_METADATA_FIXTURE_REJECTED:')) throw error;
    rejectFixture('root');
  }
  if (!samePath(temporaryRootReal, state.temporaryRoot) || !inside(state.tempBaseReal, temporaryRootReal)
    || !path.basename(temporaryRootReal).startsWith(METADATA_FIXTURE_PREFIX)) rejectFixture('root');
  return { state, temporaryRootReal };
};

const assertOwnedMetadataCache = (fixture, candidate = undefined) => {
  const { state, temporaryRootReal } = inspectMetadataFixtureRoot(fixture);
  const cache = path.resolve(candidate ?? state.cacheRoot);
  if (!samePath(cache, state.cacheRoot) || !inside(temporaryRootReal, cache)) rejectFixture('cache-path');
  let cacheReal;
  try {
    const cacheStat = lstatSync(cache);
    if (!cacheStat.isDirectory() || cacheStat.isSymbolicLink()) rejectFixture('cache-link');
    cacheReal = realpathSync(cache);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('PLAYWRIGHT_METADATA_FIXTURE_REJECTED:')) throw error;
    rejectFixture('cache-path');
  }
  if (!samePath(cacheReal, cache) || !inside(temporaryRootReal, cacheReal)) rejectFixture('cache-path');
  return cacheReal;
};

const createMetadataFixture = () => {
  const tempBaseReal = realpathSync(tmpdir());
  const temporaryRoot = mkdtempSync(path.join(tempBaseReal, METADATA_FIXTURE_PREFIX));
  const cacheRoot = path.join(temporaryRoot, METADATA_CACHE_DIRECTORY);
  const fixture = Object.freeze({ temporaryRoot, cacheRoot });
  metadataFixtureAuthority.set(fixture, { active: true, tempBaseReal, temporaryRoot, cacheRoot });
  try {
    mkdirSync(cacheRoot, { mode: 0o700 });
    assertOwnedMetadataCache(fixture);
    return fixture;
  } catch (error) {
    try { rmSync(temporaryRoot, { recursive: true, force: true }); } catch { /* Retain the original fixed failure. */ }
    metadataFixtureAuthority.get(fixture).active = false;
    throw error;
  }
};

const buildMetadataChildEnvironment = (baseEnvironment, fixture) => ({
  ...baseEnvironment,
  PWTEST_CACHE_DIR: assertOwnedMetadataCache(fixture),
});

const cleanupMetadataFixture = fixture => {
  const { state, temporaryRootReal } = inspectMetadataFixtureRoot(fixture);
  if (existsSync(state.cacheRoot)) assertOwnedMetadataCache(fixture);
  try { rmSync(temporaryRootReal, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); }
  catch { rejectFixture('cleanup'); }
  if (existsSync(temporaryRootReal)) rejectFixture('cleanup');
  state.active = false;
};

test('installed Playwright preserves only sanitized acceptance metadata under simulated GitHub Actions', () => {
  const metadataFixture = createMetadataFixture();
  const temporaryRoot = metadataFixture.temporaryRoot;
  const resolvedTempBase = path.resolve(tmpdir());
  const resolvedTemporaryRoot = path.resolve(temporaryRoot);
  assert.equal(
    resolvedTemporaryRoot.startsWith(`${resolvedTempBase}${path.sep}`)
      && path.basename(resolvedTemporaryRoot).startsWith('avalaos-playwright-metadata-'),
    true,
    'metadata smoke must own a uniquely prefixed temporary directory',
  );
  const eventPath = path.join(temporaryRoot, 'event.json');
  const configPath = path.join(temporaryRoot, 'playwright.metadata-smoke.config.mjs');
  const adverseConfigPath = path.join(temporaryRoot, 'playwright.metadata-adverse-control.config.mjs');
  const specPath = path.join(temporaryRoot, 'metadata-smoke.spec.mjs');
  const reportPath = path.join(temporaryRoot, 'playwright-results.json');
  const adverseReportPath = path.join(temporaryRoot, 'playwright-adverse-control-results.json');
  const outputPath = path.join(temporaryRoot, 'test-results');
  const adverseOutputPath = path.join(temporaryRoot, 'adverse-test-results');
  const exactCommand = ['node', 'node_modules/@playwright/test/cli.js', 'test', '--config=<temp-metadata-smoke>', '--workers=1'];
  const sourcePaths = ['scripts/acceptancePlaywrightMetadata.test.mjs'];

  try {
    const runGit = args => {
      const result = spawnSync('git', args, {
        cwd: temporaryRoot,
        encoding: 'utf8',
        timeout: 30_000,
        maxBuffer: 1_048_576,
        windowsHide: true,
      });
      assert.equal(result.status, 0, `PLAYWRIGHT_METADATA_SYNTHETIC_GIT_FAILED:${args[0]}`);
      return result;
    };
    runGit(['init', '--quiet']);
    runGit(['config', 'user.name', 'Synthetic Metadata Fixture']);
    runGit(['config', 'user.email', 'synthetic-metadata@example.invalid']);
    const trackedFixturePath = path.join(temporaryRoot, 'synthetic-tracked-fixture.txt');
    writeFileSync(trackedFixturePath, 'synthetic committed state\n');
    runGit(['add', 'synthetic-tracked-fixture.txt']);
    runGit(['commit', '--quiet', '-m', 'synthetic metadata base fixture']);
    const baseSha = runGit(['rev-parse', 'HEAD']).stdout.trim();
    assert.match(baseSha, /^[0-9a-f]{40}$/);
    writeFileSync(trackedFixturePath, 'synthetic changed state\n');
    runGit(['add', 'synthetic-tracked-fixture.txt']);
    runGit(['commit', '--quiet', '-m', 'synthetic metadata head fixture']);
    runGit(['remote', 'add', 'origin', resolvedTemporaryRoot]);

    writeFileSync(eventPath, JSON.stringify({
      action: 'synchronize',
      number: 264,
      repository: { full_name: repository },
      pull_request: {
        number: 264,
        title: 'Synthetic metadata smoke pull request',
        base: { ref: 'main', sha: baseSha, repo: { full_name: repository } },
        head: { ref: branch, sha: head, repo: { full_name: repository } },
      },
    }));
    writeFileSync(specPath, `import { test } from ${JSON.stringify(playwrightModuleUrl)};\ntest('metadata smoke without browser fixtures', () => {});\n`);
    writeFileSync(configPath, `
import { readFileSync } from 'node:fs';
import { defineConfig } from ${JSON.stringify(playwrightModuleUrl)};
import { createAcceptanceReportMetadata, decodeAcceptanceExecutionProfile } from ${JSON.stringify(profileModuleUrl)};
import { decodeControlledPreviewGitHubRuntime } from ${JSON.stringify(previewContractUrl)};
const profile = decodeAcceptanceExecutionProfile(process.env);
const eventPayload = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const metadata = {
  ...createAcceptanceReportMetadata({
    profile,
    exactCommand: ${JSON.stringify(exactCommand)},
    configPath: 'playwright.metadata-smoke.config.mjs',
    sourcePaths: ${JSON.stringify(sourcePaths)},
  }),
  workflowRuntime: decodeControlledPreviewGitHubRuntime(process.env, eventPayload),
};
export default defineConfig({
  captureGitInfo: { commit: false, diff: false },
  testDir: ${JSON.stringify(temporaryRoot)},
  testMatch: 'metadata-smoke.spec.mjs',
  outputDir: ${JSON.stringify(outputPath)},
  forbidOnly: true,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['json', { outputFile: ${JSON.stringify(reportPath)} }]],
  metadata,
});
`);
    writeFileSync(adverseConfigPath, `
import { defineConfig } from ${JSON.stringify(playwrightModuleUrl)};
export default defineConfig({
  captureGitInfo: { commit: true, diff: true },
  testDir: ${JSON.stringify(temporaryRoot)},
  testMatch: 'metadata-smoke.spec.mjs',
  outputDir: ${JSON.stringify(adverseOutputPath)},
  forbidOnly: true,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['json', { outputFile: ${JSON.stringify(adverseReportPath)} }]],
  metadata: { authorityMarker: 'synthetic-adverse-control' },
});
`);
    const environment = buildMetadataChildEnvironment({
      ...process.env,
      CI: 'true',
      GITHUB_ACTIONS: 'true',
      GITHUB_REPOSITORY: repository,
      GITHUB_WORKFLOW_REF: workflowRef,
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_RUN_ID: '34040328938',
      GITHUB_RUN_ATTEMPT: '1',
      GITHUB_SHA: workflowSha,
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_BASE_REF: 'main',
      GITHUB_HEAD_REF: branch,
      GITHUB_REF: 'refs/pull/264/merge',
      GITHUB_REF_NAME: '264/merge',
      GITHUB_ACTOR: 'synthetic-ci-actor',
      ACCEPTANCE_EXECUTION_KIND: 'hosted_preview',
      ACCEPTANCE_RELEASE_SHA: head,
      EXPECTED_RELEASE_SHA: head,
      HOSTED_PILOT_URL: 'https://deploy-preview-264--avalaos-pilot.netlify.app',
      NETLIFY_DEPLOY_ID: deployId,
    }, metadataFixture);
    const spawnPlaywright = targetConfig => spawnSync(process.execPath, [playwrightCli, 'test', `--config=${targetConfig}`, '--workers=1'], {
      cwd: temporaryRoot,
      env: environment,
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 1_048_576,
      windowsHide: true,
    });
    const adverseExecution = spawnPlaywright(adverseConfigPath);
    assert.equal(adverseExecution.status, 0, `PLAYWRIGHT_METADATA_ADVERSE_CONTROL_FAILED:${adverseExecution.status}`);
    const adverseMetadata = JSON.parse(readFileSync(adverseReportPath, 'utf8')).config?.metadata;
    assert.equal(Boolean(adverseMetadata?.ci && Object.keys(adverseMetadata.ci).length > 0), true, 'adverse control must demonstrate CI auto-enrichment');
    assert.equal(Object.hasOwn(adverseMetadata, 'gitCommit'), true, 'adverse control must demonstrate Git commit capture');
    assert.equal(Object.hasOwn(adverseMetadata, 'gitDiff'), true, 'adverse control must demonstrate Git diff capture');

    const execution = spawnPlaywright(configPath);
    assert.equal(execution.status, 0, `PLAYWRIGHT_METADATA_SMOKE_EXECUTION_FAILED:${execution.status}`);

    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    const metadata = report.config?.metadata;
    assert.ok(metadata && typeof metadata === 'object' && !Array.isArray(metadata));
    assert.deepEqual(Object.keys(metadata).sort(), [
      'actualWorkers',
      'ci',
      'configPath',
      'deployId',
      'evidenceKind',
      'exactCommand',
      'exactHead',
      'executionKind',
      'schemaVersion',
      'sourcePaths',
      'targetOrigin',
      'workflowRuntime',
    ].sort());
    assert.deepEqual(metadata.ci, {});
    assert.equal(metadata.actualWorkers, 1);
    assert.equal(metadata.executionKind, 'hosted_preview');
    assert.equal(metadata.exactHead, head);
    assert.equal(metadata.deployId, deployId);
    assert.equal(metadata.targetOrigin, 'https://deploy-preview-264--avalaos-pilot.netlify.app');
    assert.equal(metadata.workflowRuntime?.authority, 'github-actions');
    assert.equal(metadata.workflowRuntime?.runId, '34040328938');
    assert.equal(metadata.workflowRuntime?.runAttempt, '1');
    assert.equal(Object.hasOwn(metadata, 'gitCommit'), false);
    assert.equal(Object.hasOwn(metadata, 'gitDiff'), false);
    assert.equal(report.errors?.length, 0);
    const scenarioDirectory = process.env.PR_C_CONTROL_SCRIPT_SCENARIO_REPORT_DIRECTORY;
    if (scenarioDirectory) {
      writeFileSync(path.join(scenarioDirectory, 'acceptance-playwright-metadata-scenarios.json'), JSON.stringify({
        contractVersion: 'pr-c-control-script-scenarios-1',
        producer: 'scripts/acceptancePlaywrightMetadata.test.mjs',
        scenarios: [{ name: 'acceptance-playwright-metadata-installed-synthetic-config', status: 'passed' }],
      }), { flag: 'wx' });
    }
  } finally {
    cleanupMetadataFixture(metadataFixture);
  }
});

test('metadata fixture overrides inherited Playwright cache with one exact owned directory', () => {
  const fixture = createMetadataFixture();
  try {
    const environment = buildMetadataChildEnvironment({ PWTEST_CACHE_DIR: path.join(tmpdir(), 'hostile-inherited-cache'), RETAINED: 'yes' }, fixture);
    assert.equal(environment.PWTEST_CACHE_DIR, fixture.cacheRoot);
    assert.equal(environment.RETAINED, 'yes');
    assert.equal(assertOwnedMetadataCache(fixture), fixture.cacheRoot);
  } finally {
    cleanupMetadataFixture(fixture);
  }
});

test('metadata cache containment rejects path escape and symlink without touching unrelated data', () => {
  const fixture = createMetadataFixture();
  const unrelatedRoot = mkdtempSync(path.join(tmpdir(), 'avalaos-playwright-metadata-unrelated-'));
  const unrelatedMarker = path.join(unrelatedRoot, 'must-remain.txt');
  writeFileSync(unrelatedMarker, 'unrelated');
  try {
    assert.throws(() => assertOwnedMetadataCache(fixture, unrelatedRoot), /PLAYWRIGHT_METADATA_FIXTURE_REJECTED:cache-path/u);
    rmSync(fixture.cacheRoot, { recursive: true, force: true });
    symlinkSync(unrelatedRoot, fixture.cacheRoot, process.platform === 'win32' ? 'junction' : 'dir');
    try {
      assert.throws(() => assertOwnedMetadataCache(fixture), /PLAYWRIGHT_METADATA_FIXTURE_REJECTED:cache-link/u);
      assert.throws(() => cleanupMetadataFixture(fixture), /PLAYWRIGHT_METADATA_FIXTURE_REJECTED:cache-link/u);
      assert.equal(readFileSync(unrelatedMarker, 'utf8'), 'unrelated');
    } finally {
      if (existsSync(fixture.cacheRoot)) unlinkSync(fixture.cacheRoot);
      mkdirSync(fixture.cacheRoot, { mode: 0o700 });
    }
  } finally {
    cleanupMetadataFixture(fixture);
    rmSync(unrelatedRoot, { recursive: true, force: true });
  }
});

test('metadata fixture cleanup removes only its exact owned root and rejects stale or forged authority', () => {
  const fixture = createMetadataFixture();
  const unrelatedRoot = mkdtempSync(path.join(tmpdir(), 'avalaos-playwright-metadata-unrelated-'));
  const unrelatedMarker = path.join(unrelatedRoot, 'must-remain.txt');
  writeFileSync(unrelatedMarker, 'unrelated');
  let removed = false;
  try {
    assert.throws(() => cleanupMetadataFixture(Object.freeze({ ...fixture })), /PLAYWRIGHT_METADATA_FIXTURE_REJECTED:authority/u);
    assert.equal(existsSync(fixture.temporaryRoot), true);
    cleanupMetadataFixture(fixture);
    removed = true;
    assert.equal(existsSync(fixture.temporaryRoot), false);
    assert.equal(readFileSync(unrelatedMarker, 'utf8'), 'unrelated');
    assert.throws(() => cleanupMetadataFixture(fixture), /PLAYWRIGHT_METADATA_FIXTURE_REJECTED:authority/u);
  } finally {
    if (!removed) cleanupMetadataFixture(fixture);
    rmSync(unrelatedRoot, { recursive: true, force: true });
  }

  const failedExecutionFixture = createMetadataFixture();
  const failedExecutionRoot = failedExecutionFixture.temporaryRoot;
  assert.throws(() => {
    try {
      assert.equal(1, 0, 'synthetic failed CLI status');
    } finally {
      cleanupMetadataFixture(failedExecutionFixture);
    }
  }, /synthetic failed CLI status/u);
  assert.equal(existsSync(failedExecutionRoot), false);
});
