import fs from 'node:fs';

const file = '.github/workflows/ci.yml';
const source = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

for (const fragment of [
  'npm run lint:pr1d',
  'npm run test:pr1d',
  'PR 1A, PR 1C, and PR 1D Chromium',
  'pr1d-migrations:',
  'PR1D_MIGRATION_DATABASE_URL',
  'npm run test:migrations:pr1d',
]) {
  if (!source.includes(fragment)) throw new Error(`PR1D_CI_GATE_MISSING: ${fragment}`);
}

for (const retained of [
  'npm run test:pr1b',
  'npm run test:pr1c',
  'npm run test:migrations:pr1a',
  'npm run test:migrations:pr1b',
  'npm run test:migrations:pr1c',
  'npm run test:browser',
  'npm run test:browser:pr1d',
]) {
  if (!source.includes(retained)) throw new Error(`PR1D_CI_REGRESSION_GATE_REMOVED: ${retained}`);
}

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const scripts = packageJson.scripts ?? {};
for (const command of ['lint:pr1d', 'test:pr1d', 'test:pr1d-coverage', 'test:migrations:pr1d', 'test:browser:pr1d', 'test:docs:pr1d']) {
  if (typeof scripts[command] !== 'string' || scripts[command].length === 0) throw new Error(`PR1D_PACKAGE_GATE_MISSING: ${command}`);
}
for (const required of ['checkPr1dSourceBoundaries.mjs', 'checkPr1dMigrationContract.mjs', 'checkPr1dCi.mjs']) {
  if (!scripts['lint:pr1d'].includes(required)) throw new Error(`PR1D_LINT_GATE_MISSING: ${required}`);
}
if (!scripts['test:pr1d'].includes('test:docs:pr1d')) throw new Error('PR1D_DOC_GATE_NOT_AGGREGATED');

console.log('PR 1D CI and package-script gates verified.');
