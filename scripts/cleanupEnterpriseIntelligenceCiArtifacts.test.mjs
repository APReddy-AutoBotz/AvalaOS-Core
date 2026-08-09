import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const generatedDirectories = [
  '.agent/enterprise-intelligence-tests',
  '.agent/enterprise-intelligence-playwright',
  '.agent/provider-resolver-tests',
  '.agent/provider-resolver-integration-tests',
];
const forbiddenFixture = '.ai-boundary-cleanup-regression-forbidden.js';
const forbiddenReservedName = ['GROQ', 'API', 'KEY'].join('_');

const runNode = script => spawnSync(process.execPath, [script], {
  cwd: process.cwd(),
  encoding: 'utf8',
});

try {
  for (const directory of generatedDirectories) {
    mkdirSync(directory, { recursive: true });
    writeFileSync(resolve(directory, 'providerSecretAdapter.js'), `export const generated = '${forbiddenReservedName}';\n`);
  }

  const cleanup = runNode('scripts/cleanupEnterpriseIntelligenceCiArtifacts.mjs');
  assert.equal(cleanup.status, 0, cleanup.stderr || cleanup.stdout);
  for (const directory of generatedDirectories) {
    assert.equal(existsSync(directory), false, `${directory} must not survive the cleanup boundary`);
  }

  const cleanScan = runNode('scripts/check-ai-boundary.mjs');
  assert.equal(cleanScan.status, 0, cleanScan.stderr || cleanScan.stdout);

  writeFileSync(forbiddenFixture, `export const browserProviderSecret = '${forbiddenReservedName}';\n`);
  const forbiddenScan = runNode('scripts/check-ai-boundary.mjs');
  assert.notEqual(forbiddenScan.status, 0, 'a genuine forbidden repository hit must fail closed');
  assert.match(
    `${forbiddenScan.stdout}\n${forbiddenScan.stderr}`,
    new RegExp(`${forbiddenFixture.replace('.', '\\.')}:1`, 'u'),
    'the static scan must report the genuine forbidden source fixture',
  );
} finally {
  rmSync(forbiddenFixture, { force: true });
  for (const directory of generatedDirectories) rmSync(directory, { recursive: true, force: true });
}

console.log('Enterprise Intelligence cleanup boundary regression checks passed.');
