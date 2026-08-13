import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const validator = path.join(root, 'scripts/exhaustiveAcceptanceValidate.mjs');
const catalog = JSON.parse(readFileSync(path.join(root, 'tests/acceptance/catalog/test-catalog.json'), 'utf8'));
const inventory = JSON.parse(readFileSync(path.join(root, 'tests/acceptance/inventory.json'), 'utf8'));

assert.equal(inventory.branches.some(branch => branch.branchId === 'STUDIO-LEASE_CONCURRENCY'), false);
const responseLoss = inventory.branches.find(branch => branch.branchId === 'SAFETY-RESPONSE_LOST_AFTER_COMMIT');
assert.equal(responseLoss?.coverageStatus, 'UNCOVERED');
assert.equal(responseLoss?.provenance?.kind, 'required-scenario');
assert.match(responseLoss?.provenance?.limitation ?? '', /no response-loss simulation, replay, or recovery contract/u);

const runWithInventory = branches => {
  const directory = mkdtempSync(path.join(tmpdir(), 'acceptance-provenance-'));
  const catalogPath = path.join(directory, 'catalog.json');
  const inventoryPath = path.join(directory, 'inventory.json');
  writeFileSync(catalogPath, JSON.stringify(catalog));
  writeFileSync(inventoryPath, JSON.stringify({ branches }));
  return spawnSync(process.execPath, [validator], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ACCEPTANCE_CATALOG: catalogPath, ACCEPTANCE_INVENTORY: inventoryPath },
  });
};

const inventedSourceRule = {
  branchId: 'STUDIO-INVENTED_LEASE',
  module: 'Studio',
  rule: 'invented lease concurrency',
  sourceReference: 'services/studioArtifacts/contracts.ts',
  criticality: 'standard',
  coverageStatus: 'UNCOVERED',
  testIds: [],
  uncoveredReason: 'Adversarial fixture.',
  recommendedAction: 'Reject it.',
  provenance: { kind: 'source-backed', contract: 'STUDIO_LEASE_CONCURRENCY' },
};
const missingContract = runWithInventory([inventedSourceRule]);
assert.notEqual(missingContract.status, 0);
assert.match(missingContract.stderr, /declared rule has no exact source-backed contract/u);

const absentSource = runWithInventory([{ ...inventedSourceRule, sourceReference: 'services/not-a-contract.ts', provenance: { kind: 'source-backed', contract: 'anything' } }]);
assert.notEqual(absentSource.status, 0);
assert.match(absentSource.stderr, /references missing source/u);

const inventedCoveredRule = runWithInventory([{ ...inventedSourceRule, coverageStatus: 'COVERED', testIds: ['STUDIO-001'], provenance: undefined }]);
assert.notEqual(inventedCoveredRule.status, 0);
assert.match(inventedCoveredRule.stderr, /no catalog declaration that maps the branch to its exact sourceReference/u);

const validRequiredScenario = runWithInventory([responseLoss]);
assert.equal(validRequiredScenario.status, 0, validRequiredScenario.stderr);
console.log('Acceptance inventory provenance validation tests passed.');
