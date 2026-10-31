import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const validator = path.join(repositoryRoot, 'scripts/checkPr1dDocs.mjs');

const runValidator = fixtureRoot => {
  try {
    return {
      output: execFileSync(process.execPath, [validator], {
        cwd: fixtureRoot,
        encoding: 'utf8',
        env: { ...process.env, PR1D_DOC_ROOT: fixtureRoot },
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
      error: '',
    };
  } catch (error) {
    return {
      output: String(error.stdout ?? ''),
      error: String(error.stderr ?? ''),
    };
  }
};

test('current documentation route replaces repeated historical heading pins without weakening claims or links', async t => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'avalaos-pr1d-docs-'));
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }));
  await cp(path.join(repositoryRoot, 'docs'), path.join(fixtureRoot, 'docs'), { recursive: true });
  for (const file of ['README.md', 'AGENTS.md', 'PLANS.md']) {
    await cp(path.join(repositoryRoot, file), path.join(fixtureRoot, file));
  }

  const passing = runValidator(fixtureRoot);
  assert.equal(passing.error, '');
  assert.match(passing.output, /claims, and links verified/u);

  const guidePath = path.join(fixtureRoot, 'docs/09_END_TO_END_PRODUCT_GUIDE.md');
  const originalGuide = await readFile(guidePath, 'utf8');
  await writeFile(guidePath, originalGuide.replace('| Monitor |', '| Observability |'));
  assert.match(runValidator(fixtureRoot).error, /CURRENT_DOC_ROUTE_MISSING: docs\/09_END_TO_END_PRODUCT_GUIDE\.md -> \| Monitor \|/u);

  await writeFile(guidePath, `${originalGuide}\nAvalaOS Core is production-ready.\n`);
  assert.match(runValidator(fixtureRoot).error, /PR1D_UNSUPPORTED_CLAIM: docs\/09_END_TO_END_PRODUCT_GUIDE\.md/u);

  await writeFile(guidePath, originalGuide);
  const readmePath = path.join(fixtureRoot, 'README.md');
  const originalReadme = await readFile(readmePath, 'utf8');
  await writeFile(readmePath, `${originalReadme}\n[Missing canonical page](docs/DOES_NOT_EXIST.md)\n`);
  assert.match(runValidator(fixtureRoot).error, /PR1D_BROKEN_RELATIVE_LINK: README\.md -> docs\/DOES_NOT_EXIST\.md/u);
});
