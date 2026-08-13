import fs from 'node:fs';
import path from 'node:path';
import {
  classifyExecutionBindings,
  deriveInventory,
  loadCatalog,
  loadExecutionBindings,
  loadInventoryDocument,
  repoRoot,
} from '../../../scripts/exhaustiveAcceptanceModel.mjs';

const fixtures = JSON.parse(fs.readFileSync(path.join(repoRoot, 'tests/acceptance/fixtures/process-discovery-transcripts.json'), 'utf8'));
const catalog = loadCatalog();
const bindings = loadExecutionBindings();
const inventory = deriveInventory(catalog, loadInventoryDocument());
const errors = [];
const ids = new Set((catalog.cases ?? []).map(item => item.testId));
const classification = classifyExecutionBindings(catalog, bindings);

for (const item of catalog.cases ?? []) {
  for (const branchId of item.branchIds ?? []) {
    if (!inventory.some(branch => branch.branchId === branchId && branch.testIds.includes(item.testId))) {
      errors.push(`${item.testId}: branch ${branchId} not present in derived inventory`);
    }
  }
  const kinds = classification.get(item.testId) ?? [];
  if (kinds.length !== 1) errors.push(`${item.testId}: execution binding count ${kinds.length}`);
}

for (const branch of inventory) {
  if (branch.coverageStatus === 'COVERED') {
    if (!branch.testIds.length) errors.push(`${branch.branchId}: covered without Test ID`);
    for (const testId of branch.testIds) if (!ids.has(testId)) errors.push(`${branch.branchId}: unknown Test ID ${testId}`);
  } else {
    if (!branch.uncoveredReason || !branch.recommendedAction) errors.push(`${branch.branchId}: uncovered without reason/action`);
    if (branch.criticality === 'critical') errors.push(`${branch.branchId}: critical branch uncovered`);
  }
}

if (fixtures.fixtures.length < 17) errors.push(`only ${fixtures.fixtures.length} transcripts`);
for (const fixture of fixtures.fixtures) {
  if (!fixture.synthetic || !fixture.knownExpectedOutcome || fixture.knownExpectedOutcome.realProviderCallCount !== 0 || fixture.knownExpectedOutcome.customerRecordCount !== 0) {
    errors.push(`${fixture.fixtureId}: unsafe or missing oracle`);
  }
}

const uncovered = inventory.filter(item => item.coverageStatus === 'UNCOVERED');
const summary = {
  branches: inventory.length,
  catalogCases: catalog.cases.length,
  declaredCovered: inventory.length - uncovered.length,
  uncovered: uncovered.length,
  retainedCases: [...classification.values()].filter(kinds => kinds[0] === 'retained').length,
  oracleCases: [...classification.values()].filter(kinds => kinds[0] === 'oracle').length,
  hostedCases: [...classification.values()].filter(kinds => kinds[0] === 'hosted').length,
  transcripts: fixtures.fixtures.length,
  errors,
};
console.log(JSON.stringify(summary, null, 2));
if (errors.length) process.exitCode = 1;
