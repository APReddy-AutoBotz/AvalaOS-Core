import fs from 'node:fs';

const file = '.github/workflows/ci.yml';
const writeMode = process.argv.includes('--write');
let source = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

if (writeMode && !source.includes('PR 1D V1 compatibility and V2 decision-intelligence source lint')) {
  source = source.replace(
    `      - name: PR 1C enterprise Assess and handoff source lint\n        run: npm run lint:pr1c\n`,
    `      - name: PR 1C enterprise Assess and handoff source lint\n        run: npm run lint:pr1c\n\n      - name: PR 1D V1 compatibility and V2 decision-intelligence source lint\n        run: npm run lint:pr1d\n`,
  );
  source = source.replace(
    `      - name: PR 1C tenant, Govern, Studio, and coverage gates\n        run: npm run test:pr1c\n`,
    `      - name: PR 1C tenant, Govern, Studio, and coverage gates\n        run: npm run test:pr1c\n\n      - name: PR 1D compatibility, rules, commands, presentation, coverage, and docs gates\n        run: npm run test:pr1d\n`,
  );
  source = source.replace(
    'name: PR 1A and PR 1C Chromium, accessibility, viewport, and performance gates',
    'name: PR 1A, PR 1C, and PR 1D Chromium, accessibility, viewport, and performance gates',
  );
  const pr1dMigrationJob = `\n  pr1d-migrations:\n    name: PR 1D V2 Schema, RLS, Snapshot, ACL, and Atomicity Migration Gates\n    runs-on: ubuntu-latest\n    services:\n      postgres:\n        image: postgres:15\n        env:\n          POSTGRES_PASSWORD: postgres\n        ports:\n          - 5432:5432\n        options: >-\n          --health-cmd pg_isready\n          --health-interval 10s\n          --health-timeout 5s\n          --health-retries 5\n    env:\n      PR1D_MIGRATION_DATABASE_URL: postgresql://postgres:postgres@localhost:5432/postgres\n    steps:\n      - name: Checkout\n        uses: actions/checkout@v4\n      - name: Setup Node\n        uses: actions/setup-node@v4\n        with:\n          node-version: 22\n          cache: npm\n      - name: Install dependencies\n        run: npm ci\n      - name: Fresh, PR 1C upgrade, populated, ACL, RLS, hash, idempotency, concurrency, audit, and rollback checks\n        run: npm run test:migrations:pr1d\n`;
  source = source.replace('\n  supabase-smoke:\n', `${pr1dMigrationJob}\n  supabase-smoke:\n`);
  fs.writeFileSync(file, source);
}

source = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
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

console.log(writeMode ? 'PR 1D CI jobs updated and verified.' : 'PR 1D CI jobs verified.');
