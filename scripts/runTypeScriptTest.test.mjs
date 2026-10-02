import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const fixtureRoot = path.join(root, '.agent', 'run-typescript-test-selftest');
const runner = path.join(root, 'scripts', 'runTypeScriptTest.mjs');
const generatedOutput = path.join(root, '.agent', 'ts-tests');

const write = (relative, value) => {
  const destination = path.join(fixtureRoot, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, value);
  return path.relative(root, destination);
};

const run = files => spawnSync(process.execPath, [runner, 'types.ts', ...files], {
  cwd: root,
  encoding: 'utf8',
});

try {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
  fs.mkdirSync(fixtureRoot, { recursive: true });

  const positive = path.join(fixtureRoot, 'positive');
  const middle = write('positive/middle.ts', "import { value } from './helper.mjs';\nexport const result = value;\n");
  write('positive/helper.d.ts', 'export const value: number;\n');
  write('positive/helper.mjs', "import { nested } from './nested.mjs';\nexport const value = nested + 1;\n");
  write('positive/nested.mjs', 'export const nested = 41;\n');
  write('positive/unreferenced.mjs', "throw new Error('must not be copied');\n");
  const positiveEntry = write('positive/main.test.ts', "import assert from 'node:assert/strict';\nimport { result } from './middle';\nassert.equal(result, 42);\n");
  const positiveRun = run([middle, positiveEntry]);
  assert.equal(positiveRun.status, 0, positiveRun.stderr || positiveRun.stdout);
  const emittedFixture = path.relative(root, positive);
  assert.equal(fs.existsSync(path.join(generatedOutput, emittedFixture, 'helper.mjs')), true);
  assert.equal(fs.existsSync(path.join(generatedOutput, emittedFixture, 'nested.mjs')), true);
  assert.equal(fs.existsSync(path.join(generatedOutput, emittedFixture, 'unreferenced.mjs')), false);

  const missingSource = write('missing/source.ts', "import { value } from './missing.mjs';\nexport { value };\n");
  write('missing/missing.d.ts', 'export const value: number;\n');
  const missingEntry = write('missing/main.test.ts', "import './source';\n");
  const missingRun = run([missingSource, missingEntry]);
  assert.notEqual(missingRun.status, 0);
  assert.match(`${missingRun.stdout}\n${missingRun.stderr}`, /Required local [.]mjs module does not exist/u);

  const escapingSource = write('escaping/source.ts', "import '../../../../../../outside.mjs';\n");
  const escapingEntry = write('escaping/main.test.ts', "import './source';\n");
  const escapingRun = run([escapingSource, escapingEntry]);
  assert.notEqual(escapingRun.status, 0);
  assert.match(`${escapingRun.stdout}\n${escapingRun.stderr}`, /must resolve to a file inside the repository/u);

  const absoluteSource = write('absolute/source.ts', "import 'C:/substituted/outside.mjs';\n");
  const absoluteEntry = write('absolute/main.test.ts', "import './source';\n");
  const absoluteRun = run([absoluteSource, absoluteEntry]);
  assert.notEqual(absoluteRun.status, 0);
  assert.match(`${absoluteRun.stdout}\n${absoluteRun.stderr}`, /Absolute [.]mjs module specifiers are not permitted/u);

  console.log('TypeScript test harness .mjs graph: 10 assertions passed');
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
