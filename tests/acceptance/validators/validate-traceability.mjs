import fs from 'node:fs';
import path from 'node:path';
import {
  classifyExecutionBindings,
  deriveInventory,
  loadCatalog,
  loadExecutionBindings,
  loadInventoryDocument,
  loadSourceProvenance,
  repoRoot,
  validateSourceProvenance,
} from '../../../scripts/exhaustiveAcceptanceModel.mjs';

const fixtures = JSON.parse(fs.readFileSync(path.join(repoRoot, 'tests/acceptance/fixtures/process-discovery-transcripts.json'), 'utf8'));
const catalog = loadCatalog();
const bindings = loadExecutionBindings();
const provenance = loadSourceProvenance();
const inventory = deriveInventory(catalog, loadInventoryDocument(), provenance, bindings);
const errors = [];
errors.push(...validateSourceProvenance(catalog, bindings, provenance));
const ids = new Set((catalog.cases ?? []).map(item => item.testId));
const classification = classifyExecutionBindings(catalog, bindings);

for (const item of catalog.cases ?? []) {
  for (const branchId of item.branchIds ?? []) {
    if (!inventory.some(branch => branch.branchId === branchId && branch.testIds.includes(item.testId))) {
      errors.push(`${item.testId}: branch ${branchId} not present in derived inventory`);
    }
  }
  const kinds = classification.get(item.testId) ?? [];
  if (!kinds.length) errors.push(`${item.testId}: execution binding count 0`);
  if (kinds.length > 1) {
    const server = (bindings.serverTests ?? []).find(binding => binding.testId === item.testId);
    if (!server || JSON.stringify([...server.components].sort()) !== JSON.stringify([...kinds].sort())) errors.push(`${item.testId}: invalid composite execution binding`);
  }
}

for (const branch of inventory) {
  if (branch.coverageStatus === 'DECLARED') {
    if (!branch.testIds.length) errors.push(`${branch.branchId}: declared without Test ID`);
    for (const testId of branch.testIds) if (!ids.has(testId)) errors.push(`${branch.branchId}: unknown Test ID ${testId}`);
    if (!branch.uncoveredReason || !branch.recommendedAction) errors.push(`${branch.branchId}: declaration must state source-proof limitation and action`);
  } else if (branch.coverageStatus === 'SOURCE_BACKED') {
    if (!branch.testIds.length) errors.push(`${branch.branchId}: source-backed without Test ID`);
    for (const testId of branch.testIds) if (!ids.has(testId)) errors.push(`${branch.branchId}: unknown Test ID ${testId}`);
  } else if (branch.coverageStatus === 'UNCOVERED') {
    if (!branch.uncoveredReason || !branch.recommendedAction) errors.push(`${branch.branchId}: uncovered without reason/action`);
    if (branch.criticality === 'critical') errors.push(`${branch.branchId}: critical branch uncovered`);
  } else {
    errors.push(`${branch.branchId}: unsupported coverage status ${branch.coverageStatus}`);
  }
}

if (fixtures.fixtures.length < 17) errors.push(`only ${fixtures.fixtures.length} transcripts`);
for (const fixture of fixtures.fixtures) {
  if (!fixture.synthetic || !fixture.knownExpectedOutcome || fixture.knownExpectedOutcome.realProviderCallCount !== 0 || fixture.knownExpectedOutcome.customerRecordCount !== 0) {
    errors.push(`${fixture.fixtureId}: unsafe or missing oracle`);
  }
}

const declared = inventory.filter(item => item.coverageStatus === 'DECLARED');
const sourceBacked = inventory.filter(item => item.coverageStatus === 'SOURCE_BACKED');
const uncovered = inventory.filter(item => item.coverageStatus === 'UNCOVERED');
const summary = {
  branches: inventory.length,
  catalogCases: catalog.cases.length,
  declared: declared.length,
  sourceBacked: sourceBacked.length,
  uncovered: uncovered.length,
  retainedCases: [...classification.values()].filter(kinds => kinds.includes('retained')).length,
  oracleCases: [...classification.values()].filter(kinds => kinds.includes('oracle')).length,
  hostedCases: [...classification.values()].filter(kinds => kinds.includes('hosted')).length,
  serverCases: [...classification.values()].filter(kinds => kinds.includes('server')).length,
  compositeCases: [...classification.values()].filter(kinds => kinds.length > 1).length,
  transcripts: fixtures.fixtures.length,
  errors,
};
console.log(JSON.stringify(summary, null, 2));
if (errors.length) process.exitCode = 1;
