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

// COVERED below means catalog-mapped only; executed/proven state is calculated from exact evidence later.
export const deriveInventory = (catalog, inventoryDocument) => {
  if (inventoryDocument.schemaVersion !== 2) throw new Error('ACCEPTANCE_INVENTORY_SCHEMA_V2_REQUIRED');

  const coveredById = new Map();
  for (const testCase of catalog.cases ?? []) {
    for (const branchId of testCase.branchIds ?? []) {
      const refs = [...new Set(testCase.sourceReference ?? [])];
      const existing = coveredById.get(branchId);
      if (existing) {
        existing.testIds.push(testCase.testId);
        existing.sourceReferences = [...new Set([...existing.sourceReferences, ...refs])];
      } else {
        coveredById.set(branchId, {
          branchId,
          module: testCase.module,
          rule: testCase.ruleRequirement,
          sourceReferences: refs,
          criticality: testCase.criticality ?? 'standard',
          coverageStatus: 'COVERED',
          testIds: [testCase.testId],
          uncoveredReason: null,
          recommendedAction: null,
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

  const collisions = uncovered.filter(branch => coveredById.has(branch.branchId));
  if (collisions.length) throw new Error(`ACCEPTANCE_INVENTORY_COLLISION:${collisions.map(item => item.branchId).join(',')}`);
  return [...coveredById.values(), ...uncovered];
};

export const classifyExecutionBindings = (catalog, bindings) => {
  const retained = retainedBindingMap(bindings);
  const oracle = oracleBindingMap(bindings);
  const hosted = hostedBindingMap(bindings);
  const result = new Map();
  for (const testCase of catalog.cases ?? []) {
    const kinds = [];
    if (retained.has(testCase.testId)) kinds.push('retained');
    if (oracle.has(testCase.testId)) kinds.push('oracle');
    if (hosted.has(testCase.testId)) kinds.push('hosted');
    result.set(testCase.testId, kinds);
  }
  return result;
};
