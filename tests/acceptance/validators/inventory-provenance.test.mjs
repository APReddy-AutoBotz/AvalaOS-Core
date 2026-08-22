import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const validator = path.join(root, 'scripts/exhaustiveAcceptanceValidate.mjs');
const catalogPath = path.join(root, 'tests/acceptance/catalog/test-catalog.json');
const bindingsPath = path.join(root, 'tests/acceptance/execution-bindings.json');
const bindings = JSON.parse(readFileSync(bindingsPath, 'utf8'));
const hostedSpec = readFileSync(path.join(root, 'tests/browser/exhaustiveHostedAcceptance.spec.ts'), 'utf8');
const inventory = JSON.parse(readFileSync(path.join(root, 'tests/acceptance/inventory.json'), 'utf8'));

assert.equal(inventory.schemaVersion, 2);
assert.equal(inventory.coveredBranchesSource, 'tests/acceptance/catalog/test-catalog.json');
assert.equal(inventory.uncoveredBranches.some(branch => branch.branchId === 'STUDIO-LEASE_CONCURRENCY'), false);
assert.equal(inventory.uncoveredBranches.length, 0);
assert.equal(JSON.parse(readFileSync(catalogPath, 'utf8')).cases.some(item => item.testId === 'SAFETY-005' && item.branchIds.includes('SAFETY-RESPONSE_LOST_AFTER_COMMIT')), true);

const run = (document, bindingsDocument = bindings) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'acceptance-inventory-v2-'));
  const inventoryPath = path.join(directory, 'inventory.json');
  writeFileSync(inventoryPath, JSON.stringify(document));
  const generatedBindingsPath = path.join(directory, 'execution-bindings.json');
  writeFileSync(generatedBindingsPath, JSON.stringify(bindingsDocument));
  return spawnSync(process.execPath, [validator], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      ACCEPTANCE_CATALOG: catalogPath,
      ACCEPTANCE_BINDINGS: generatedBindingsPath,
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
    branchId:'TEST-MISSING-SOURCE', module:'Test', rule:'missing source', criticality:'standard', uncoveredReason:'test', recommendedAction:'test', provenance:{kind:'required-scenario',limitation:'test'},
    sourceReferences: ['services/not-present.ts'],
  }],
});
assert.notEqual(missingSource.status, 0);
assert.match(missingSource.stderr, /references missing source/u);

const withoutPixel7 = structuredClone(bindings);
withoutPixel7.hostedTests.find(item => item.testId === 'SANDBOX-009').projects = ['desktop-chromium'];
const omittedProject = run(inventory, withoutPixel7);
assert.notEqual(omittedProject.status, 0);
assert.match(omittedProject.stderr, /SANDBOX-009 hosted projects must exactly match catalog viewports/u);

const duplicateProjects = structuredClone(bindings);
duplicateProjects.hostedTests.find(item => item.testId === 'SANDBOX-009').projects = ['desktop-chromium', 'pixel-7-chromium', 'pixel-7-chromium'];
const duplicateProject = run(inventory, duplicateProjects);
assert.notEqual(duplicateProject.status, 0);
assert.match(duplicateProject.stderr, /SANDBOX-009 hosted binding has duplicate projects/u);

assert.match(hostedSpec, /case 'serious-critical-a11y':[\s\S]*for \(const \[label\] of personas\)/u, 'SAFETY-007 must enter every bounded canonical persona');
assert.match(hostedSpec, /case 'serious-critical-a11y':[\s\S]*await enterPersona\(page, label\)/u, 'chooser-only axe coverage is insufficient');
assert.match(hostedSpec, /case 'serious-critical-a11y':[\s\S]*item\.impact === 'serious' \|\| item\.impact === 'critical'/u);
assert.match(hostedSpec, /case 'serious-critical-a11y':[\s\S]*observer\.assertSafe\(\)/u, 'post-entry accessibility must retain network safety');

console.log('Acceptance inventory provenance validation tests passed.');
