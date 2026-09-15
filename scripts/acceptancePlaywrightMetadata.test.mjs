import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, unlinkSync,
  writeFileSync,
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
const metadataGitEnvironmentAuthority = new WeakSet();
const METADATA_FIXTURE_PREFIX = 'avalaos-playwright-metadata-';
const METADATA_CACHE_DIRECTORY = 'playwright-transform-cache';
const METADATA_INFRASTRUCTURE_ENVIRONMENT = Object.freeze([
  'PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'COMSPEC', 'WINDIR', 'TMP', 'TEMP', 'TMPDIR', 'LANG', 'LC_ALL',
]);
const METADATA_SYNTHETIC_ENVIRONMENT = Object.freeze([
  'CI', 'GITHUB_ACTIONS', 'GITHUB_REPOSITORY', 'GITHUB_WORKFLOW_REF', 'GITHUB_EVENT_NAME', 'GITHUB_RUN_ID',
  'GITHUB_RUN_ATTEMPT', 'GITHUB_SHA', 'GITHUB_EVENT_PATH', 'GITHUB_BASE_REF', 'GITHUB_HEAD_REF', 'GITHUB_REF',
  'GITHUB_REF_NAME', 'GITHUB_ACTOR', 'ACCEPTANCE_EXECUTION_KIND', 'ACCEPTANCE_RELEASE_SHA', 'EXPECTED_RELEASE_SHA',
  'HOSTED_PILOT_URL', 'NETLIFY_DEPLOY_ID',
]);

const samePath = (left, right) => process.platform === 'win32'
  ? path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase()
  : path.resolve(left) === path.resolve(right);
const inside = (owner, target) => {
  const relative = path.relative(owner, target);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
};
const rejectFixture = code => { throw new Error(`PLAYWRIGHT_METADATA_FIXTURE_REJECTED:${code}`); };
const captureParentCoverageEnvironment = () => Object.freeze({
  present: Object.hasOwn(process.env, 'NODE_V8_COVERAGE'),
  value: process.env.NODE_V8_COVERAGE,
});
const assertParentCoverageEnvironmentUnchanged = before => {
  const after = captureParentCoverageEnvironment();
  assert(after.present === before.present && after.value === before.value,
    'PLAYWRIGHT_METADATA_PARENT_COVERAGE_ENVIRONMENT_CHANGED');
};

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

const assertNoChildV8CoverageArtifacts = fixture => {
  const { temporaryRootReal } = inspectMetadataFixtureRoot(fixture);
  const pending = [temporaryRootReal];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(entryPath);
      else if (entry.isFile()) assert(!/^coverage-\d+-\d+-\d+\.json$/u.test(entry.name),
        'PLAYWRIGHT_METADATA_CHILD_COVERAGE_ARTIFACT_RETAINED');
    }
  }
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

const buildOwnedMetadataGitEnvironment = (fixture, repositoryRoot) => {
  const { temporaryRootReal } = inspectMetadataFixtureRoot(fixture);
  const repositoryReal = realpathSync(repositoryRoot);
  if (!inside(temporaryRootReal, repositoryReal) || !samePath(repositoryReal, repositoryRoot)) rejectFixture('git-root');
  const controlRoot = path.join(repositoryReal, '.metadata-git-control');
  const hooksPath = path.join(controlRoot, 'hooks');
  const templatesPath = path.join(controlRoot, 'templates');
  const globalConfigPath = path.join(controlRoot, 'global.config');
  mkdirSync(hooksPath, { recursive: true, mode: 0o700 });
  mkdirSync(templatesPath, { recursive: true, mode: 0o700 });
  writeFileSync(globalConfigPath, '', { flag: 'wx' });
  const entries = [
    ['safe.directory', repositoryReal], ['core.hooksPath', hooksPath], ['core.fsmonitor', 'false'],
    ['credential.helper', ''], ['credential.interactive', 'false'], ['protocol.file.allow', 'always'],
    ['protocol.http.allow', 'never'], ['protocol.https.allow', 'never'], ['protocol.ssh.allow', 'never'],
    ['protocol.git.allow', 'never'], ['protocol.ext.allow', 'never'], ['gc.auto', '0'], ['maintenance.auto', 'false'],
    ['fetch.writeCommitGraph', 'false'],
  ];
  const environment = Object.freeze({
    ...Object.fromEntries(METADATA_INFRASTRUCTURE_ENVIRONMENT.filter(name => process.env[name] !== undefined)
      .map(name => [name, process.env[name]])),
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: globalConfigPath, GIT_TEMPLATE_DIR: templatesPath,
    GIT_ALLOW_PROTOCOL: 'file', GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GIT_ASKPASS: '', SSH_ASKPASS: '',
    GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1', GIT_OPTIONAL_LOCKS: '0', GIT_CONFIG_COUNT: String(entries.length),
    ...Object.fromEntries(entries.flatMap(([key, value], index) => [
      [`GIT_CONFIG_KEY_${index}`, key], [`GIT_CONFIG_VALUE_${index}`, value],
    ])),
    NODE_V8_COVERAGE: '',
  });
  metadataGitEnvironmentAuthority.add(environment);
  return environment;
};

const buildMetadataChildEnvironment = (baseEnvironment, fixture, gitEnvironment = undefined) => {
  if (gitEnvironment !== undefined && !metadataGitEnvironmentAuthority.has(gitEnvironment)) rejectFixture('git-environment');
  const names = [...METADATA_INFRASTRUCTURE_ENVIRONMENT, ...METADATA_SYNTHETIC_ENVIRONMENT];
  return Object.freeze({
    ...Object.fromEntries(names.filter(name => baseEnvironment[name] !== undefined).map(name => [name, baseEnvironment[name]])),
    ...(gitEnvironment ?? {}),
    PWTEST_CACHE_DIR: assertOwnedMetadataCache(fixture),
    NODE_V8_COVERAGE: '',
  });
};

const cleanupMetadataFixture = fixture => {
  const { state, temporaryRootReal } = inspectMetadataFixtureRoot(fixture);
  if (existsSync(state.cacheRoot)) assertOwnedMetadataCache(fixture);
  try { rmSync(temporaryRootReal, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); }
  catch { rejectFixture('cleanup'); }
  if (existsSync(temporaryRootReal)) rejectFixture('cleanup');
  state.active = false;
};

test('installed Playwright Git capture is disabled only by the complete literal policy while sanitized metadata is preserved', () => {
  const parentCoverageEnvironment = captureParentCoverageEnvironment();
  const metadataFixture = createMetadataFixture();
  const temporaryRoot = metadataFixture.temporaryRoot;
  const exactCommand = ['node', 'node_modules/@playwright/test/cli.js', 'test', '--config=<temp-metadata-smoke>', '--workers=1'];
  const sourcePaths = ['scripts/acceptancePlaywrightMetadata.test.mjs'];
  const caseDefinitions = Object.freeze([
    { name: 'ci-default', capture: '', ci: true, commit: true, diff: true, native: 'TRUE', shape: 'NONEMPTY_REGULAR' },
    { name: 'ci-commit-false', capture: 'captureGitInfo: { commit: false },', ci: true, commit: false, diff: true,
      native: 'TRUE', shape: 'NONEMPTY_REGULAR' },
    { name: 'ci-diff-false', capture: 'captureGitInfo: { diff: false },', ci: true, commit: true, diff: false,
      native: 'FALSE', shape: 'ABSENT' },
    { name: 'ci-both-false', capture: 'captureGitInfo: { commit: false, diff: false },', ci: true, commit: false, diff: false,
      native: 'FALSE', shape: 'ABSENT', governedMetadata: true },
    { name: 'local-default', capture: '', ci: false, commit: false, diff: false, native: 'FALSE', shape: 'ABSENT' },
  ]);

  try {
    for (const definition of caseDefinitions) {
      const caseRoot = path.join(temporaryRoot, definition.name);
      mkdirSync(caseRoot, { mode: 0o700 });
      const gitEnvironment = buildOwnedMetadataGitEnvironment(metadataFixture, caseRoot);
      assert.equal(Object.isFrozen(gitEnvironment), true);
      assert.equal(Object.hasOwn(gitEnvironment, 'NODE_V8_COVERAGE'), true);
      assert.equal(gitEnvironment.NODE_V8_COVERAGE, '');
      assertParentCoverageEnvironmentUnchanged(parentCoverageEnvironment);
      const runGit = args => {
        const result = spawnSync('git', args, {
          cwd: caseRoot, env: gitEnvironment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 30_000, maxBuffer: 1_048_576, windowsHide: true,
        });
        assert(result.status === 0 && result.signal === null && !result.error, `PLAYWRIGHT_METADATA_SYNTHETIC_GIT_FAILED:${args[0]}`);
        return result.stdout.trim();
      };
      runGit(['init', '--quiet', '--initial-branch=main']);
      const trackedFixturePath = path.join(caseRoot, 'synthetic-tracked-fixture.txt');
      const commitEnvironment = { ...gitEnvironment,
        GIT_AUTHOR_NAME: 'Synthetic Metadata Fixture', GIT_AUTHOR_EMAIL: 'synthetic-metadata@example.invalid',
        GIT_COMMITTER_NAME: 'Synthetic Metadata Fixture', GIT_COMMITTER_EMAIL: 'synthetic-metadata@example.invalid' };
      const commit = message => {
        const add = spawnSync('git', ['add', 'synthetic-tracked-fixture.txt'], { cwd: caseRoot, env: gitEnvironment,
          encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000, maxBuffer: 1_048_576, windowsHide: true });
        const created = spawnSync('git', ['commit', '--quiet', '-m', message], { cwd: caseRoot, env: commitEnvironment,
          encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000, maxBuffer: 1_048_576, windowsHide: true });
        assert(add.status === 0 && created.status === 0 && add.signal === null && created.signal === null,
          'PLAYWRIGHT_METADATA_SYNTHETIC_COMMIT_FAILED');
      };
      writeFileSync(trackedFixturePath, 'synthetic committed state\n'); commit('synthetic metadata base fixture');
      const baseSha = runGit(['rev-parse', 'HEAD']);
      writeFileSync(trackedFixturePath, 'synthetic changed state\n'); commit('synthetic metadata head fixture');
      runGit(['remote', 'add', 'origin', caseRoot]);

      const eventPath = path.join(caseRoot, 'event.json');
      const configPath = path.join(caseRoot, 'playwright.metadata-smoke.config.mjs');
      const specPath = path.join(caseRoot, 'metadata-smoke.spec.mjs');
      const reportPath = path.join(caseRoot, 'playwright-results.json');
      const outputPath = path.join(caseRoot, 'test-results');
      writeFileSync(eventPath, JSON.stringify({ action: 'synchronize', number: 264, repository: { full_name: repository },
        pull_request: { number: 264, title: 'Synthetic metadata smoke pull request',
          base: { ref: 'main', sha: baseSha, repo: { full_name: repository } },
          head: { ref: branch, sha: head, repo: { full_name: repository } } } }));
      writeFileSync(specPath, `import { test } from ${JSON.stringify(playwrightModuleUrl)};\ntest('metadata smoke without browser fixtures', () => {});\n`);
      const metadataSource = definition.governedMetadata ? `
import { readFileSync } from 'node:fs';
import { createAcceptanceReportMetadata, decodeAcceptanceExecutionProfile } from ${JSON.stringify(profileModuleUrl)};
import { decodeControlledPreviewGitHubRuntime } from ${JSON.stringify(previewContractUrl)};
const profile = decodeAcceptanceExecutionProfile(process.env);
const eventPayload = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const metadata = { ...createAcceptanceReportMetadata({ profile, exactCommand: ${JSON.stringify(exactCommand)},
  configPath: 'playwright.metadata-smoke.config.mjs', sourcePaths: ${JSON.stringify(sourcePaths)} }),
  workflowRuntime: decodeControlledPreviewGitHubRuntime(process.env, eventPayload) };` :
        `const metadata = { policyCase: ${JSON.stringify(definition.name)} };`;
      writeFileSync(configPath, `import { defineConfig } from ${JSON.stringify(playwrightModuleUrl)};${metadataSource}
export default defineConfig({ ${definition.capture}
  testDir: ${JSON.stringify(caseRoot)}, testMatch: 'metadata-smoke.spec.mjs', outputDir: ${JSON.stringify(outputPath)},
  forbidOnly: true, fullyParallel: false, workers: 1, retries: 0,
  reporter: [['json', { outputFile: ${JSON.stringify(reportPath)} }]], metadata,
});\n`);

      const infrastructureOnly = Object.fromEntries(METADATA_INFRASTRUCTURE_ENVIRONMENT
        .filter(name => process.env[name] !== undefined).map(name => [name, process.env[name]]));
      const hostileChildCoverageRoot = path.join(caseRoot, 'hostile-child-v8-coverage');
      const syntheticEnvironment = definition.ci ? {
        ...process.env, NODE_V8_COVERAGE: hostileChildCoverageRoot,
        CI: 'true', GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: repository, GITHUB_WORKFLOW_REF: workflowRef,
        GITHUB_EVENT_NAME: 'pull_request', GITHUB_RUN_ID: '34040328938', GITHUB_RUN_ATTEMPT: '1',
        GITHUB_SHA: definition.governedMetadata ? workflowSha : runGit(['rev-parse', 'HEAD']), GITHUB_EVENT_PATH: eventPath,
        GITHUB_BASE_REF: 'main', GITHUB_HEAD_REF: branch, GITHUB_REF: 'refs/pull/264/merge', GITHUB_REF_NAME: '264/merge',
        GITHUB_ACTOR: 'synthetic-ci-actor', ACCEPTANCE_EXECUTION_KIND: 'hosted_preview', ACCEPTANCE_RELEASE_SHA: head,
        EXPECTED_RELEASE_SHA: head, HOSTED_PILOT_URL: 'https://deploy-preview-264--avalaos-pilot.netlify.app', NETLIFY_DEPLOY_ID: deployId,
      } : { ...infrastructureOnly, NODE_V8_COVERAGE: hostileChildCoverageRoot };
      const childEnvironment = buildMetadataChildEnvironment(syntheticEnvironment, metadataFixture, gitEnvironment);
      assert.equal(Object.isFrozen(childEnvironment), true);
      assert.equal(Object.hasOwn(childEnvironment, 'NODE_V8_COVERAGE'), true);
      assert.equal(childEnvironment.NODE_V8_COVERAGE, '');
      assert.equal(Object.hasOwn(childEnvironment, 'NODE_OPTIONS'), false);
      assertParentCoverageEnvironmentUnchanged(parentCoverageEnvironment);

      const inspectRepository = () => {
        const commonValue = runGit(['rev-parse', '--git-common-dir']);
        const commonPath = realpathSync(path.resolve(caseRoot, commonValue));
        const shallowPath = path.resolve(caseRoot, runGit(['rev-parse', '--git-path', 'shallow']));
        assert(samePath(commonPath, path.join(caseRoot, '.git')) && samePath(shallowPath, path.join(commonPath, 'shallow')),
          'PLAYWRIGHT_METADATA_GIT_PATH_REJECTED');
        const shallowStat = existsSync(shallowPath) ? lstatSync(shallowPath) : null;
        const native = runGit(['rev-parse', '--is-shallow-repository']) === 'true' ? 'TRUE' : 'FALSE';
        const shape = shallowStat === null ? 'ABSENT' : shallowStat.isFile() && !shallowStat.isSymbolicLink()
          && shallowStat.nlink === 1 && shallowStat.size > 0 ? 'NONEMPTY_REGULAR' : 'INVALID_PATH';
        const indexPath = path.resolve(caseRoot, runGit(['rev-parse', '--git-path', 'index']));
        const indexStat = lstatSync(indexPath);
        assert(samePath(indexPath, path.join(commonPath, 'index')) && indexStat.isFile() && !indexStat.isSymbolicLink()
          && indexStat.nlink === 1, 'PLAYWRIGHT_METADATA_INDEX_REJECTED');
        return { commonPath, shallowPath, native, shape, head: runGit(['rev-parse', 'HEAD']), tree: runGit(['rev-parse', 'HEAD^{tree}']),
          refs: runGit(['for-each-ref', '--format=%(refname) %(objectname)']), index: readFileSync(indexPath), tracked: readFileSync(trackedFixturePath) };
      };
      const before = inspectRepository();
      assert.equal(`${before.native}:${before.shape}`, 'FALSE:ABSENT', `PLAYWRIGHT_METADATA_INITIAL_SHALLOW_STATE:${definition.name}`);
      const execution = spawnSync(process.execPath, [playwrightCli, 'test', `--config=${configPath}`, '--workers=1'], {
        cwd: caseRoot, env: childEnvironment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000,
        maxBuffer: 1_048_576, windowsHide: true,
      });
      assert(execution.status === 0 && execution.signal === null && !execution.error,
        `PLAYWRIGHT_METADATA_POLICY_CASE_FAILED:${definition.name}`);
      assert.equal(existsSync(hostileChildCoverageRoot), false);
      assertNoChildV8CoverageArtifacts(metadataFixture);
      assertParentCoverageEnvironmentUnchanged(parentCoverageEnvironment);
      const after = inspectRepository();
      assert(before.head === after.head && before.tree === after.tree && before.refs === after.refs
        && before.index.equals(after.index) && before.tracked.equals(after.tracked)
        && samePath(before.commonPath, after.commonPath) && samePath(before.shallowPath, after.shallowPath),
      'PLAYWRIGHT_METADATA_REPOSITORY_BINDING_CHANGED');
      assert.equal(`${after.native}:${after.shape}`, `${definition.native}:${definition.shape}`,
        `PLAYWRIGHT_METADATA_SHALLOW_OUTCOME:${definition.name}`);

      const report = JSON.parse(readFileSync(reportPath, 'utf8'));
      const metadata = report.config?.metadata;
      assert(metadata && typeof metadata === 'object' && !Array.isArray(metadata), 'PLAYWRIGHT_METADATA_REPORT_REJECTED');
      const reportedTests = (report.suites ?? []).flatMap(suite => suite.specs ?? []).flatMap(spec => spec.tests ?? []);
      const reportedResults = reportedTests.flatMap(reportedTest => reportedTest.results ?? []);
      assert(reportedTests.length === 1 && reportedResults.length === 1 && reportedResults[0].status === 'passed'
        && report.stats?.expected === 1 && report.stats?.unexpected === 0 && report.stats?.skipped === 0,
      `PLAYWRIGHT_METADATA_TEST_RESULT_REJECTED:${definition.name}`);
      assert.equal(Object.hasOwn(metadata, 'gitCommit'), definition.commit, `PLAYWRIGHT_METADATA_COMMIT_POLICY:${definition.name}`);
      assert.equal(Object.hasOwn(metadata, 'gitDiff'), definition.diff, `PLAYWRIGHT_METADATA_DIFF_POLICY:${definition.name}`);
      assert.equal(report.errors?.length, 0, `PLAYWRIGHT_METADATA_REPORT_ERRORS:${definition.name}`);
      if (definition.governedMetadata) {
        assert.deepEqual(Object.keys(metadata).sort(), ['actualWorkers','ci','configPath','deployId','evidenceKind','exactCommand',
          'exactHead','executionKind','schemaVersion','sourcePaths','targetOrigin','workflowRuntime'].sort());
        assert.deepEqual(metadata.ci, {}); assert.equal(metadata.actualWorkers, 1); assert.equal(metadata.executionKind, 'hosted_preview');
        assert.equal(metadata.exactHead, head); assert.equal(metadata.deployId, deployId);
        assert.equal(metadata.targetOrigin, 'https://deploy-preview-264--avalaos-pilot.netlify.app');
        assert.deepEqual(metadata.exactCommand, exactCommand); assert.equal(metadata.configPath, 'playwright.metadata-smoke.config.mjs');
        assert.deepEqual(metadata.sourcePaths, sourcePaths);
        assert.deepEqual(metadata.workflowRuntime, { authority: 'github-actions', workflowPath, workflowRef, repository,
          eventName: 'pull_request', runId: '34040328938', runAttempt: '1', workflowSha, prNumber: 264,
          headRef: branch, headRepository: repository, releaseSha: head });
      }
    }
    const scenarioDirectory = process.env.PR_C_CONTROL_SCRIPT_SCENARIO_REPORT_DIRECTORY;
    if (scenarioDirectory) writeFileSync(path.join(scenarioDirectory, 'acceptance-playwright-metadata-scenarios.json'), JSON.stringify({
      contractVersion: 'pr-c-control-script-scenarios-1', producer: 'scripts/acceptancePlaywrightMetadata.test.mjs',
      scenarios: [{ name: 'acceptance-playwright-metadata-installed-synthetic-config', status: 'passed' }],
    }), { flag: 'wx' });
  } finally { cleanupMetadataFixture(metadataFixture); }
});

test('metadata fixture overrides inherited Playwright cache with one exact owned directory', () => {
  const parentCoverageEnvironment = captureParentCoverageEnvironment();
  const fixture = createMetadataFixture();
  try {
    const environment = buildMetadataChildEnvironment({ PWTEST_CACHE_DIR: path.join(tmpdir(), 'hostile-inherited-cache'),
      RETAINED: 'yes', NODE_OPTIONS: '--import=hostile', NODE_V8_COVERAGE: path.join(fixture.temporaryRoot, 'hostile-coverage'),
      GIT_DIR: path.join(tmpdir(), 'hostile-git') }, fixture);
    assert.equal(Object.isFrozen(environment), true);
    assert.equal(environment.PWTEST_CACHE_DIR, fixture.cacheRoot);
    assert.equal(Object.hasOwn(environment, 'NODE_V8_COVERAGE'), true);
    assert.equal(environment.NODE_V8_COVERAGE, '');
    for (const name of ['RETAINED','NODE_OPTIONS','GIT_DIR']) assert.equal(Object.hasOwn(environment, name), false);
    assert.equal(assertOwnedMetadataCache(fixture), fixture.cacheRoot);
    assert.equal(existsSync(path.join(fixture.temporaryRoot, 'hostile-coverage')), false);
    assertNoChildV8CoverageArtifacts(fixture);
    assertParentCoverageEnvironmentUnchanged(parentCoverageEnvironment);
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
