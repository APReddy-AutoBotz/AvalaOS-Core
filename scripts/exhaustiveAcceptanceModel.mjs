import fs from 'node:fs';
import path from 'node:path';

export const repoRoot = process.cwd();
export const catalogPath = process.env.ACCEPTANCE_CATALOG || path.join(repoRoot, 'tests/acceptance/catalog/test-catalog.json');
export const inventoryPath = process.env.ACCEPTANCE_INVENTORY || path.join(repoRoot, 'tests/acceptance/inventory.json');
export const bindingsPath = process.env.ACCEPTANCE_BINDINGS || path.join(repoRoot, 'tests/acceptance/execution-bindings.json');

export const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
export const loadCatalog = () => readJson(catalogPath);
export const loadInventoryDocument = () => readJson(inventoryPath);
export const loadExecutionBindings = () => readJson(bindingsPath);
export const canonicalHostedTitle = testCase => `[${testCase.testId}] ${testCase.title}`;

export const retainedBindingMap = bindings => {
  const map = new Map();
  for (const suite of bindings.retainedSuites ?? []) {
    for (const testId of suite.testIds ?? []) {
      const current = map.get(testId) ?? [];
      current.push(suite.suiteId);
      map.set(testId, current);
    }
  }
  return map;
};

export const oracleBindingMap = bindings => new Map((bindings.oracleTests ?? []).map(item => [item.testId, item]));
export const hostedBindingMap = bindings => new Map((bindings.hostedTests ?? []).map(item => [item.testId, item]));
export const serverBindingMap = bindings => new Map((bindings.serverTests ?? []).map(item => [item.testId, item]));

// Catalog membership is a declaration only. Source-backed coverage requires a separate proven provenance contract.
export const deriveInventory = (catalog, inventoryDocument) => {
  if (inventoryDocument.schemaVersion !== 2) throw new Error('ACCEPTANCE_INVENTORY_SCHEMA_V2_REQUIRED');

  const declaredById = new Map();
  for (const testCase of catalog.cases ?? []) {
    for (const branchId of testCase.branchIds ?? []) {
      const refs = [...new Set(testCase.sourceReference ?? [])];
      const existing = declaredById.get(branchId);
      if (existing) {
        existing.testIds.push(testCase.testId);
        existing.sourceReferences = [...new Set([...existing.sourceReferences, ...refs])];
      } else {
        declaredById.set(branchId, {
          branchId,
          module: testCase.module,
          rule: testCase.ruleRequirement,
          sourceReferences: refs,
          criticality: testCase.criticality ?? 'standard',
          coverageStatus: 'DECLARED',
          testIds: [testCase.testId],
          uncoveredReason: 'Catalog-declared requirement has not yet been independently source-backed.',
          recommendedAction: 'Add machine-verified source provenance before counting this branch as source/business coverage.',
        });
      }
    }
  }

  const uncovered = (inventoryDocument.uncoveredBranches ?? []).map(branch => ({
    ...branch,
    sourceReferences: Array.isArray(branch.sourceReferences)
      ? branch.sourceReferences
      : branch.sourceReference
        ? [branch.sourceReference]
        : [],
    coverageStatus: 'UNCOVERED',
    testIds: [],
  }));

  const collisions = uncovered.filter(branch => declaredById.has(branch.branchId));
  if (collisions.length) throw new Error(`ACCEPTANCE_INVENTORY_COLLISION:${collisions.map(item => item.branchId).join(',')}`);
  return [...declaredById.values(), ...uncovered];
};

export const classifyExecutionBindings = (catalog, bindings) => {
  const retained = retainedBindingMap(bindings);
  const oracle = oracleBindingMap(bindings);
  const hosted = hostedBindingMap(bindings);
  const server = serverBindingMap(bindings);
  const result = new Map();
  for (const testCase of catalog.cases ?? []) {
    const kinds = [];
    if (retained.has(testCase.testId)) kinds.push('retained');
    if (oracle.has(testCase.testId)) kinds.push('oracle');
    if (hosted.has(testCase.testId)) kinds.push('hosted');
    if (server.has(testCase.testId)) kinds.push('server');
    result.set(testCase.testId, kinds);
  }
  return result;
};
