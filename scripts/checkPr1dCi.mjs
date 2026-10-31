import fs from 'node:fs';
import path from 'node:path';

const root = process.env.PR1D_CI_ROOT ? path.resolve(process.env.PR1D_CI_ROOT) : process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const source = read('.github/workflows/ci.yml').replace(/\r\n/g, '\n');

for (const fragment of [
  'pull_request:', '- main', '- master', 'npm run test:docs:pr1d',
  'npm run test:ai-boundary-static', 'npm run test:secret-hygiene',
  'npm run test:hosted-pilot', 'npm run test:runtime', 'npm run build',
  'PR 1A, PR 1C, and PR 1D Chromium', 'pr1d-migrations:',
  'PR1D_MIGRATION_DATABASE_URL', 'npm run test:migrations:pr1d',
]) {
  if (!source.includes(fragment)) throw new Error(`PR1D_CI_GATE_MISSING: ${fragment}`);
}
if (source.includes("'codex/**'") || source.includes('- codex/**')) throw new Error('PR1D_CI_DUPLICATE_BRANCH_TRIGGER');

const verifyJobStart = source.indexOf('\n  verify:');
const verifyJobEnd = source.indexOf('\n  enterprise-browser:', verifyJobStart);
if (verifyJobStart < 0 || verifyJobEnd < 0) throw new Error('PR1D_CI_GATE_MISSING: bounded verify job');
const verifyJob = source.slice(verifyJobStart, verifyJobEnd);
for (const duplicate of [
  'npm run typecheck\n', 'npm run typecheck:edge', 'npm run lint:pr1a',
  'npm run lint:pr1b', 'npm run lint:pr1c', 'npm run lint:pr1d',
  'npm run lint:pr1e', 'npm run test:pr1b', 'npm run test:pr1c',
  'npm run test:pr1d', 'npm run test:pr1e',
]) {
  if (verifyJob.includes(duplicate)) throw new Error(`PR1D_CI_DUPLICATE_COMPOSED_GATE: ${duplicate.trim()}`);
}
if (verifyJob.indexOf('npm run test:docs:pr1d') > verifyJob.indexOf('npm run test:runtime')) {
  throw new Error('PR1D_CI_CHEAP_DOC_GATE_NOT_EARLY');
}

const pr1dJobStart = source.indexOf('\n  pr1d-migrations:');
const pr1dJobEnd = source.indexOf('\n  pr1e-migrations:', pr1dJobStart);
if (pr1dJobStart < 0 || pr1dJobEnd < 0) throw new Error('PR1D_CI_GATE_MISSING: bounded pr1d-migrations job');
const pr1dJob = source.slice(pr1dJobStart, pr1dJobEnd);
if (!pr1dJob.includes('image: postgres:16')) throw new Error('PR1D_CI_GATE_MISSING: PR 1D migration gate must run PostgreSQL 16');

for (const retained of [
  'npm run test:migrations:pr1a', 'npm run test:migrations:pr1b',
  'npm run test:migrations:pr1c', 'npm run test:browser', 'npm run test:browser:pr1d',
]) {
  if (!source.includes(retained)) throw new Error(`PR1D_CI_REGRESSION_GATE_REMOVED: ${retained}`);
}

const packageJson = JSON.parse(read('package.json'));
const scripts = packageJson.scripts ?? {};
for (const command of [
  'lint:pr1d', 'test:pr1d', 'test:pr1d:runtime', 'test:pr1d-coverage',
  'test:migrations:pr1d', 'test:browser:pr1d', 'test:docs:pr1d',
  'test:pr1e', 'test:pr1e:runtime', 'test:docs:pr1e', 'test:runtime',
]) {
  if (typeof scripts[command] !== 'string' || scripts[command].length === 0) throw new Error(`PR1D_PACKAGE_GATE_MISSING: ${command}`);
}
for (const required of [
  'checkPr1dSourceBoundaries.mjs', 'pr1dBrowserFixtureContract.test.mjs',
  'checkPr1dMigrationContract.mjs', 'checkAssessV2EdgeImports.mjs', 'checkPr1dCi.mjs',
]) {
  if (!scripts['lint:pr1d'].includes(required)) throw new Error(`PR1D_LINT_GATE_MISSING: ${required}`);
}
if (!scripts['test:pr1d'].includes('test:pr1d:runtime') || !scripts['test:pr1d'].includes('test:docs:pr1d')) {
  throw new Error('PR1D_DOC_GATE_NOT_AGGREGATED');
}
if (!scripts['test:pr1e'].includes('test:pr1e:runtime') || !scripts['test:pr1e'].includes('test:docs:pr1e')) {
  throw new Error('PR1E_DOC_GATE_NOT_AGGREGATED');
}
for (const retained of ['test:workflow-yaml', 'test:docs:pr1d', 'test:docs:pr1e', 'test:runtime']) {
  if (!scripts.test.includes(retained)) throw new Error(`CORE_TEST_COMPOSITION_MISSING: ${retained}`);
}
const runtimeCommands = scripts['test:runtime'].split(' && ').map(command => command.replace(/^npm run /u, ''));
for (const retained of ['typecheck', 'typecheck:edge', 'test:pr1a', 'test:pr1b', 'test:pr1c', 'test:pr1d:runtime', 'test:pr1e:runtime', 'test:enterprise-intelligence']) {
  if (!runtimeCommands.includes(retained)) throw new Error(`CORE_RUNTIME_COMPOSITION_MISSING: ${retained}`);
  if (runtimeCommands.filter(command => command === retained).length !== 1) throw new Error(`CORE_RUNTIME_COMPOSITION_DUPLICATED: ${retained}`);
}
if (scripts['test:runtime'].includes('test:docs:pr1d') || scripts['test:runtime'].includes('test:docs:pr1e')) throw new Error('CORE_TEST_DOC_GATE_DUPLICATED');

console.log('PR 1D CI composition, retained feature gates, and package-script gates verified.');
