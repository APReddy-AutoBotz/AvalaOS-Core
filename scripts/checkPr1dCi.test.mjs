import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const validator = path.join(repositoryRoot, 'scripts/checkPr1dCi.mjs');
const runValidator = fixtureRoot => {
  try {
    return {
      output: execFileSync(process.execPath, [validator], {
        cwd: fixtureRoot,
        encoding: 'utf8',
        env: { ...process.env, PR1D_CI_ROOT: fixtureRoot },
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
      error: '',
    };
  } catch (error) {
    return { output: String(error.stdout ?? ''), error: String(error.stderr ?? '') };
  }
};

test('Core CI runs composed gates once while retaining candidate and release coverage', async t => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'avalaos-pr1d-ci-'));
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }));
  await cp(path.join(repositoryRoot, 'package.json'), path.join(fixtureRoot, 'package.json'));
  await cp(path.join(repositoryRoot, '.github/workflows/ci.yml'), path.join(fixtureRoot, '.github/workflows/ci.yml'), { recursive: true });

  assert.equal(runValidator(fixtureRoot).error, '');

  const workflowPath = path.join(fixtureRoot, '.github/workflows/ci.yml');
  const workflow = await readFile(workflowPath, 'utf8');
  await writeFile(workflowPath, workflow.replace('      - master', "      - master\n      - 'codex/**'"));
  assert.match(runValidator(fixtureRoot).error, /PR1D_CI_DUPLICATE_BRANCH_TRIGGER/u);

  await writeFile(workflowPath, workflow.replace('      - name: Production build', '      - run: npm run test:pr1d\n\n      - name: Production build'));
  assert.match(runValidator(fixtureRoot).error, /PR1D_CI_DUPLICATE_COMPOSED_GATE: npm run test:pr1d/u);

  await writeFile(workflowPath, workflow);
  const packagePath = path.join(fixtureRoot, 'package.json');
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
  packageJson.scripts['test:runtime'] = packageJson.scripts['test:runtime'].replace('npm run test:pr1d:runtime && ', '');
  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
  assert.match(runValidator(fixtureRoot).error, /CORE_RUNTIME_COMPOSITION_MISSING: test:pr1d:runtime/u);
  const original = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'));
  for (const feature of ['test:pr1a', 'test:pr1b', 'test:pr1c', 'test:pr1e:runtime']) {
    const missing = structuredClone(original);
    missing.scripts['test:runtime'] = missing.scripts['test:runtime'].replace(`npm run ${feature} && `, '');
    await writeFile(packagePath, JSON.stringify(missing));
    assert.ok(runValidator(fixtureRoot).error.includes(`CORE_RUNTIME_COMPOSITION_MISSING: ${feature}`));
  }
  original.scripts['test:runtime'] += ' && npm run test:pr1b';
  await writeFile(packagePath, JSON.stringify(original));
  assert.match(runValidator(fixtureRoot).error, /CORE_RUNTIME_COMPOSITION_DUPLICATED: test:pr1b/u);
});
