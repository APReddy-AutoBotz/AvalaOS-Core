import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const validator = path.join(root, 'scripts/exhaustiveAcceptanceValidate.mjs');
const catalogPath = path.join(root, 'tests/acceptance/catalog/test-catalog.json');
const bindingsPath = path.join(root, 'tests/acceptance/execution-bindings.json');
const inventory = JSON.parse(readFileSync(path.join(root, 'tests/acceptance/inventory.json'), 'utf8'));

assert.equal(inventory.schemaVersion, 2);
assert.equal(inventory.coveredBranchesSource, 'tests/acceptance/catalog/test-catalog.json');
assert.equal(inventory.uncoveredBranches.some(branch => branch.branchId === 'STUDIO-LEASE_CONCURRENCY'), false);
assert.equal(inventory.uncoveredBranches.length, 1);
const responseLoss = inventory.uncoveredBranches[0];
assert.equal(responseLoss.branchId, 'SAFETY-RESPONSE_LOST_AFTER_COMMIT');
assert.equal(responseLoss.provenance?.kind, 'required-scenario');
assert.match(responseLoss.provenance?.limitation ?? '', /no response-loss simulation, replay, or recovery contract/u);

const run = document => {
  const directory = mkdtempSync(path.join(tmpdir(), 'acceptance-inventory-v2-'));
  const inventoryPath = path.join(directory, 'inventory.json');
  writeFileSync(inventoryPath, JSON.stringify(document));
  return spawnSync(process.execPath, [validator], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      ACCEPTANCE_CATALOG: catalogPath,
      ACCEPTANCE_BINDINGS: bindingsPath,
      ACCEPTANCE_INVENTORY: inventoryPath,
    },
  });
};

const v1 = run({ schemaVersion: 1, branches: [] });
assert.notEqual(v1.status, 0);
assert.match(v1.stderr, /schemaVersion must be 2|SCHEMA_V2_REQUIRED/u);

const inventedLease = run({
  ...inventory,
  uncoveredBranches: [...inventory.uncoveredBranches, {
    branchId: 'STUDIO-LEASE_CONCURRENCY',
    module: 'Studio',
    rule: 'lease concurrency',
    sourceReferences: ['services/studioArtifacts/contracts.ts'],
    criticality: 'standard',
    uncoveredReason: 'Invented test fixture.',
    recommendedAction: 'Reject.',
    provenance: { kind: 'source-backed', contract: 'STUDIO_LEASE_CONCURRENCY' },
  }],
});
assert.notEqual(inventedLease.status, 0);
assert.match(inventedLease.stderr, /required-scenario provenance|invented Studio lease branch/u);

const missingSource = run({
  ...inventory,
  uncoveredBranches: [{
    ...responseLoss,
    sourceReferences: ['services/not-present.ts'],
  }],
});
assert.notEqual(missingSource.status, 0);
assert.match(missingSource.stderr, /references missing source/u);

console.log('Acceptance inventory provenance validation tests passed.');
