import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { canonicalCommands, groups, childEnvironment, sanitizedCapture } from './runCreationAccessValidation.mjs';
import { reviewedScripts, isSnapshotPath, snapshotScope } from './creationAccessValidationContract.mjs';
import { checkCreationAccessCiContract } from './checkCreationAccessCiContract.mjs';
import { collectEdgeImportGraph } from './checkPrCControlledHumanEdgeImports.mjs';
import { fileURLToPath } from 'node:url';

test('exploratory creation entrypoints resolve their complete Deno-compatible source graphs', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  for (const name of ['tenant-session', 'synthetic-admin', 'process-command', 'assess-v2-command']) {
    const entrypoint = `supabase/functions/${name}/index.ts`;
    const graph = collectEdgeImportGraph(root, entrypoint);
    assert(graph.some(source => source.path === entrypoint));
    assert(graph.length > 1, `${name} must include its actual shared dependencies`);
  }
});

test('every retained validation group resolves only registered repository commands', () => {
  const scripts = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts;
  assert.deepEqual(Object.keys(groups).sort(), ['authority', 'browser', 'coverage', 'postgres', 'regression', 'static']);
  for (const group of Object.keys(groups)) {
    const commands = canonicalCommands(group, scripts);
    assert.equal(commands.length, groups[group].length);
    for (const command of commands) assert.equal(command.script, reviewedScripts[command.name]);
  }
});

test('substituted command, nested command, skipped suite and lifecycle hooks reject before execution', () => {
  const scripts = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts;
  for (const group of Object.keys(groups)) for (const name of groups[group]) {
    for (const replacement of ['echo PASS', 'node --test --test-only fixture.test.mjs', scripts[name] + ' --grep skipped']) {
      assert.throws(() => canonicalCommands(group, { ...scripts, [name]: replacement }), /SUBSTITUTED_SCRIPT/);
    }
    assert.throws(() => canonicalCommands(group, { ...scripts, [`pre${name}`]: 'echo PASS' }), /UNREVIEWED_HOOK/);
    assert.throws(() => canonicalCommands(group, { ...scripts, [`post${name}`]: 'echo PASS' }), /UNREVIEWED_HOOK/);
  }
  assert.throws(() => canonicalCommands('authority', { ...scripts, 'test:product-action-policy': 'echo PASS' }), /SUBSTITUTED_SCRIPT/);
  assert.throws(() => groups.authority.push('echo PASS'), TypeError);
});

test('child environment retains infrastructure only, strips secrets and injection, pins exact local Git/Docker scope', () => {
  const source = { Path: 'runtime-path', SystemRoot: 'windows-root', USERPROFILE: 'profile-path',
    OPENAI_API_KEY: 'fake-provider', PR_C_CONTROLLED_HUMAN_SUPABASE_ACCESS_TOKEN: 'fake-token',
    NODE_OPTIONS: '--require evil', NODE_PATH: 'evil', HTTPS_PROXY: 'remote',
    DOCKER_HOST: 'tcp://remote:2375', DOCKER_CONTEXT: 'remote', GIT_CONFIG_COUNT: '99',
    npm_config_script_shell: 'evil', VITE_RUNTIME_MODE: 'production', PLAYWRIGHT_BASE_URL: 'remote' };
  const clean = childEnvironment('test:creation-access:postgres', source, 'exact-worktree', 'win32');
  for (const key of Object.keys(source).filter(key => !['Path', 'SystemRoot', 'USERPROFILE', 'DOCKER_HOST', 'GIT_CONFIG_COUNT'].includes(key))) assert(!Object.hasOwn(clean, key), key);
  assert.equal(clean.GIT_CONFIG_COUNT, '2'); assert.equal(clean.GIT_CONFIG_VALUE_1, 'exact-worktree');
  assert.equal(clean.DOCKER_HOST, 'npipe:////./pipe/dockerDesktopLinuxEngine');
  const scoring = childEnvironment('test:pr-c-scoring-law-drift', source);
  assert.equal(scoring.GIT_CONFIG_COUNT, '1'); assert(!Object.hasOwn(scoring, 'GIT_CONFIG_VALUE_1'));
  assert.equal(source.NODE_OPTIONS, '--require evil', 'caller environment is not modified');
});

test('console and artifact capture redact split credentials before emission and fail closed on oversized output', () => {
  let consoleOutput = '';
  const capture = sanitizedCapture(value => { consoleOutput += value; });
  const token = 'sk-' + 'a'.repeat(30);
  capture.append('example ' + token.slice(0, 8));
  assert.equal(consoleOutput, '');
  capture.append(token.slice(8) + '\npassword=' + 'synthetic-password\n');
  const result = capture.finish();
  assert(!result.output.includes(token)); assert(!result.output.includes('synthetic-password'));
  assert.equal(result.output, consoleOutput); assert.equal(result.truncated, false);
  const huge = sanitizedCapture(); huge.append('a'.repeat(20_000)); huge.append('\n');
  assert.equal(huge.finish().truncated, true);
  const capped = sanitizedCapture(() => {}, 10); capped.append('harmless but over budget\n'); assert.equal(capped.finish().truncated, true);
});

test('runtime/test fingerprint excludes only the documented derived PR C index, not test provenance or implementation', () => {
  assert.deepEqual(snapshotScope.excludedDerivedIndexes, ['testing/process-lifecycle/contracts/pr-c-source-provenance.json']);
  assert(!isSnapshotPath(snapshotScope.excludedDerivedIndexes[0]));
  assert(!isSnapshotPath('docs/quality/creation-access-remediation-evidence.md'));
  for (const path of ['App.tsx', 'tests/acceptance/source-provenance.json', 'testing/process-lifecycle/contracts/pr-c-assertion-registry.json',
    'supabase/functions/_shared/syntheticAdminEndpoint.ts', 'scripts/creationAccessValidationContract.mjs']) assert(isSnapshotPath(path), path);
});

test('isolated CI owns all required groups, full commit history and exact committed-patch verification', () => {
  const workflow = readFileSync(new URL('../.github/workflows/creation-access.yml', import.meta.url), 'utf8');
  assert(checkCreationAccessCiContract(workflow));
  for (const [before, after] of [
    ['fetch-depth: 0', 'fetch-depth: 1'],
    ['node scripts/checkCreationAccessCommittedPatch.mjs', 'git diff --check'],
    ['node scripts/runCreationAccessValidation.mjs authority', 'echo PASS'],
    ['- run: node scripts/runCreationAccessValidation.mjs postgres', '- if: false\n        run: node scripts/runCreationAccessValidation.mjs postgres'],
    ['contents: read', 'contents: write'],
    ['            output/playwright/local-controlled-boundary/\n', ''],
    ["node-version: '22'", "node-version: '22'\n        env:\n          EXTERNAL_SECRET: ${{ secrets.PRIVATE }}"],
  ]) {
    assert(workflow.includes(before));
    assert.throws(() => checkCreationAccessCiContract(workflow.replace(before, after)));
  }
});
test('missing and unknown execution groups fail before process creation', () => {
  for (const group of ['__proto__', 'constructor', 'arbitrary command', '']) assert.throws(() => canonicalCommands(group, {}), /UNKNOWN_GROUP/);
  assert.throws(() => canonicalCommands('authority', {}), /MISSING_SCRIPT/);
});
