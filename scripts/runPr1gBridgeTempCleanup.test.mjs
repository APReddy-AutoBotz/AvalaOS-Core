import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const generatedDirectories = prefix => new Set(readdirSync(os.tmpdir())
  .filter(entry => entry.startsWith(prefix)));

test('PR 1G bridge runners remove invocation-owned compiler output after child failure', () => {
  const inputDirectory = mkdtempSync(path.join(os.tmpdir(), 'avalaos-pr1g-bridge-input-'));
  const parityInput = path.join(inputDirectory, 'parity.json');
  const projectionInput = path.join(inputDirectory, 'projection.json');
  writeFileSync(parityInput, '{', 'utf8');
  writeFileSync(projectionInput, '{', 'utf8');
  const fixtures = [
    {
      prefix: 'avalaos-pr1g-parity-bridge-',
      script: 'scripts/runPr1gApplicationPortfolioParityBridge.mjs',
      args: [parityInput],
      formerCheckoutOutput: '.agent/pr1g-parity-bridge',
    },
    {
      prefix: 'avalaos-pr1g-projection-bridge-',
      script: 'scripts/runPr1gProjectionDecoderBridge.mjs',
      args: [projectionInput, '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'],
      formerCheckoutOutput: '.agent/pr1g-projection-bridge',
    },
  ];
  try {
    for (const fixture of fixtures) {
      const before = generatedDirectories(fixture.prefix);
      assert.equal(existsSync(fixture.formerCheckoutOutput), false);
      const result = spawnSync(process.execPath, [fixture.script, ...fixture.args], {
        cwd: process.cwd(),
        encoding: 'utf8',
        windowsHide: true,
      });
      assert.equal(result.error, undefined);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /SyntaxError/u);
      assert.match(result.stderr, /pr1g(?:ApplicationPortfolioParity|ProjectionDecoder)Bridge\.js/u);
      assert.deepEqual(generatedDirectories(fixture.prefix), before);
      assert.equal(existsSync(fixture.formerCheckoutOutput), false);
    }
  } finally {
    rmSync(inputDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
