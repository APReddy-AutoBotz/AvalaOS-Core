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
const provenancePath = path.join(root, 'tests/acceptance/source-provenance.json');
const provenance = JSON.parse(readFileSync(provenancePath, 'utf8'));
const hostedSpec = readFileSync(path.join(root, 'tests/browser/exhaustiveHostedAcceptance.spec.ts'), 'utf8');
const hostedRouteSource = readFileSync(path.join(root, 'services/hostedSandboxRoute.ts'), 'utf8');
const inventory = JSON.parse(readFileSync(path.join(root, 'tests/acceptance/inventory.json'), 'utf8'));

assert.equal(inventory.schemaVersion, 3);
assert.equal(inventory.coveredBranchesSource, 'tests/acceptance/catalog/test-catalog.json');
assert.equal(inventory.sourceProvenanceSource, 'tests/acceptance/source-provenance.json');
assert.equal(inventory.uncoveredBranches.some(branch => branch.branchId === 'STUDIO-LEASE_CONCURRENCY'), false);
assert.equal(inventory.uncoveredBranches.length, 0);
assert.equal(JSON.parse(readFileSync(catalogPath, 'utf8')).cases.some(item => item.testId === 'SAFETY-005' && item.branchIds.includes('SAFETY-RESPONSE_LOST_AFTER_COMMIT')), true);

const run = (document, bindingsDocument = bindings, provenanceDocument = provenance) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'acceptance-inventory-v3-'));
  const inventoryPath = path.join(directory, 'inventory.json');
  writeFileSync(inventoryPath, JSON.stringify(document));
  const generatedBindingsPath = path.join(directory, 'execution-bindings.json');
  writeFileSync(generatedBindingsPath, JSON.stringify(bindingsDocument));
  const generatedProvenancePath = path.join(directory, 'source-provenance.json');
  writeFileSync(generatedProvenancePath, JSON.stringify(provenanceDocument));
  return spawnSync(process.execPath, [validator], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      ACCEPTANCE_CATALOG: catalogPath,
      ACCEPTANCE_BINDINGS: generatedBindingsPath,
      ACCEPTANCE_INVENTORY: inventoryPath,
      ACCEPTANCE_PROVENANCE: generatedProvenancePath,
    },
  });
};

const v2 = run({ schemaVersion: 2, branches: [] });
assert.notEqual(v2.status, 0);
assert.match(v2.stderr, /schemaVersion must be 3|SCHEMA_V3_REQUIRED/u);

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

const fakeSource = structuredClone(provenance);
fakeSource.sourceDigests['services/hostedSandboxRoute.ts'] = `sha256:${'0'.repeat(64)}`;
const fakeSourceResult = run(inventory, bindings, fakeSource);
assert.notEqual(fakeSourceResult.status, 0);
assert.match(fakeSourceResult.stderr, /source-provenance-digest/u, 'a declared path with a substituted digest is not source proof');

const fakeOwner = structuredClone(provenance);
fakeOwner.contracts.find(item => item.testId === 'SANDBOX-004').ownership[0].ownerId = 'network-observer-ended-early';
const fakeOwnerResult = run(inventory, bindings, fakeOwner);
assert.notEqual(fakeOwnerResult.status, 0);
assert.match(fakeOwnerResult.stderr, /source-provenance-ownership/u, 'fake scenario ownership must fail closed');

const partialComposite = structuredClone(bindings);
partialComposite.serverTests.find(item => item.testId === 'ASSESS-002').components = ['server'];
const partialCompositeResult = run(inventory, partialComposite);
assert.notEqual(partialCompositeResult.status, 0);
assert.match(partialCompositeResult.stderr, /composite execution kinds must exactly match/u);

const sandboxDescendant = JSON.parse(readFileSync(catalogPath, 'utf8')).cases.find(item => item.testId === 'SANDBOX-006');
assert.equal(sandboxDescendant.branchIds[0], 'SANDBOX-ACCEPTED_DESCENDANT_ROUTE');
assert.equal(sandboxDescendant.expectedDenial, false, 'an accepted descendant cannot be relabeled as denied evidence');
assert.match(hostedRouteSource, /pathname\.startsWith\(`\$\{HOSTED_SANDBOX_ROUTE\}\/`\)/u, 'source routing explicitly accepts sandbox descendants');
assert.match(hostedSpec, /case 'network-safety':[\s\S]*await signOutToSandbox\(page\);[\s\S]*observer\.assertSafe\(\);[\s\S]*observer\.stop\(\);/u, 'SANDBOX-004 must observe the complete post-entry and sign-out workflow');
for (const scenario of ['desktop-layout', 'mobile-layout', 'keyboard-a11y']) {
  const block = new RegExp(`case '${scenario}':[\\s\\S]*for \\(const \\[label, userName\\] of personas\\)[\\s\\S]*await enterPersona\\(page, label\\)`, 'u');
  assert.match(hostedSpec, block, `${scenario} must enter every bounded persona post-entry`);
}

assert.match(hostedSpec, /case 'serious-critical-a11y':[\s\S]*for \(const \[label\] of personas\)/u, 'SAFETY-007 must enter every bounded canonical persona');
assert.match(hostedSpec, /case 'serious-critical-a11y':[\s\S]*await enterPersona\(page, label\)/u, 'chooser-only axe coverage is insufficient');
assert.match(hostedSpec, /case 'serious-critical-a11y':[\s\S]*item\.impact === 'serious' \|\| item\.impact === 'critical'/u);
assert.match(hostedSpec, /case 'serious-critical-a11y':[\s\S]*observer\.assertSafe\(\)/u, 'post-entry accessibility must retain network safety');

console.log('Acceptance inventory provenance validation tests passed.');
