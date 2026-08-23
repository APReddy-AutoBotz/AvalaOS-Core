import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const repoRoot = process.cwd();
export const catalogPath = process.env.ACCEPTANCE_CATALOG || path.join(repoRoot, 'tests/acceptance/catalog/test-catalog.json');
export const inventoryPath = process.env.ACCEPTANCE_INVENTORY || path.join(repoRoot, 'tests/acceptance/inventory.json');
export const bindingsPath = process.env.ACCEPTANCE_BINDINGS || path.join(repoRoot, 'tests/acceptance/execution-bindings.json');
export const provenancePath = process.env.ACCEPTANCE_PROVENANCE || path.join(repoRoot, 'tests/acceptance/source-provenance.json');

export const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
export const loadCatalog = () => readJson(catalogPath);
export const loadInventoryDocument = () => readJson(inventoryPath);
export const loadExecutionBindings = () => readJson(bindingsPath);
export const loadSourceProvenance = () => readJson(provenancePath);
export const canonicalHostedTitle = testCase => `[${testCase.testId}] ${testCase.title}`;
export const canonicalCommand = command => command.join(' ');

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

const sortedUnique = values => [...new Set(values)].sort();
const normalize = value => Array.isArray(value)
  ? value.map(normalize)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])]))
    : value;
const canonicalValue = value => JSON.stringify(normalize(value));
export const canonicalSourceSha256 = bytes => {
  const text = Buffer.isBuffer(bytes) ? bytes.toString('utf8') : String(bytes);
  return `sha256:${createHash('sha256').update(text.replace(/\r\n/gu, '\n'), 'utf8').digest('hex')}`;
};
const fileSha256 = file => canonicalSourceSha256(fs.readFileSync(file));

export const expectedExecutionOwnership = (testId, bindings) => {
  const owners = [];
  for (const suite of bindings.retainedSuites ?? []) {
    if ((suite.testIds ?? []).includes(testId)) {
      owners.push({
        kind: 'retained-assertion',
        ownerId: suite.suiteId,
        assertionId: `${suite.suiteId}::${testId}`,
        scenarioId: `${testId}::retained-contract`,
      });
    }
  }
  for (const item of bindings.oracleTests ?? []) {
    if (item.testId === testId) owners.push({ kind: 'oracle-scenario', ownerId: item.scenario });
  }
  for (const item of bindings.hostedTests ?? []) {
    if (item.testId === testId) owners.push({
      kind: 'hosted-scenario',
      ownerId: item.scenario ?? `blocked:${testId}`,
    });
  }
  for (const item of bindings.serverTests ?? []) {
    if (item.testId === testId) owners.push({
      kind: 'server-assertion',
      ownerId: item.suiteId,
      assertionIds: item.assertionIds ?? [`${item.suiteId}::${testId}`],
    });
  }
  return owners.sort((a, b) => `${a.kind}:${a.ownerId}`.localeCompare(`${b.kind}:${b.ownerId}`));
};

export const validateSourceProvenance = (catalog, bindings, provenanceDocument, root = repoRoot) => {
  const errors = [];
  if (provenanceDocument?.schemaVersion !== 1) return ['source-provenance-schema'];
  if (!provenanceDocument?.inventoryId) errors.push('source-provenance-inventory-id');
  const digestTable = provenanceDocument?.sourceDigests ?? {};
  const contracts = provenanceDocument?.contracts;
  if (!Array.isArray(contracts)) return [...errors, 'source-provenance-contract-array'];

  const catalogClaims = new Map();
  for (const testCase of catalog.cases ?? []) {
    for (const branchId of testCase.branchIds ?? []) {
      if (catalogClaims.has(branchId)) errors.push(`source-provenance-catalog-duplicate:${branchId}`);
      catalogClaims.set(branchId, testCase);
    }
  }

  const seen = new Set();
  for (const contract of contracts) {
    const key = contract?.branchId ?? 'missing';
    if (!contract?.branchId || seen.has(contract.branchId)) errors.push(`source-provenance-duplicate:${key}`);
    seen.add(contract?.branchId);
    const testCase = catalogClaims.get(contract?.branchId);
    if (!testCase || contract?.testId !== testCase.testId) {
      errors.push(`source-provenance-claim:${key}`);
      continue;
    }
    const declaredSources = sortedUnique(testCase.sourceReference ?? []);
    const contractSources = sortedUnique(contract.sourceReferences ?? []);
    if (JSON.stringify(declaredSources) !== JSON.stringify(contractSources)) errors.push(`source-provenance-sources:${key}`);
    for (const source of contractSources) {
      if (typeof source !== 'string' || path.isAbsolute(source) || source.includes('..')) {
        errors.push(`source-provenance-unsafe-source:${key}`);
        continue;
      }
      const resolved = path.resolve(root, source);
      if (!resolved.startsWith(`${path.resolve(root)}${path.sep}`) || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
        errors.push(`source-provenance-missing-source:${key}:${source}`);
        continue;
      }
      if (!/^sha256:[0-9a-f]{64}$/u.test(digestTable[source] ?? '') || fileSha256(resolved) !== digestTable[source]) {
        errors.push(`source-provenance-digest:${key}:${source}`);
      }
    }
    const expectedOwners = expectedExecutionOwnership(testCase.testId, bindings);
    const actualOwners = Array.isArray(contract.ownership)
      ? [...contract.ownership].sort((a, b) => `${a.kind}:${a.ownerId}`.localeCompare(`${b.kind}:${b.ownerId}`))
      : [];
    if (canonicalValue(actualOwners) !== canonicalValue(expectedOwners)) errors.push(`source-provenance-ownership:${key}`);
    const scope = contract.scope ?? {};
    if (scope.fixtureId !== testCase.fixture || !['planned-fixture','executed-fixture'].includes(scope.evidenceScope)) errors.push(`source-provenance-scope:${key}`);
    if (scope.evidenceScope === 'planned-fixture' && (scope.organizationId !== null || scope.workspaceId !== null)) errors.push(`source-provenance-planned-scope:${key}`);
    if (scope.evidenceScope === 'executed-fixture' && (!/^[0-9a-f-]{36}$/u.test(scope.organizationId ?? '') || !/^[0-9a-f-]{36}$/u.test(scope.workspaceId ?? ''))) errors.push(`source-provenance-executed-scope:${key}`);
    if (testCase.testId === 'SAFETY-005' && canonicalValue(scope) !== canonicalValue({
      evidenceScope:'executed-fixture',
      fixtureId:'synthetic-pilot-operations-response-loss',
      organizationId:'97000000-0000-4000-8000-000000000010',
      workspaceId:'97000000-0000-4000-8000-000000000011',
    })) errors.push(`source-provenance-server-scope:${key}`);
  }
  for (const branchId of catalogClaims.keys()) if (!seen.has(branchId)) errors.push(`source-provenance-missing:${branchId}`);
  for (const branchId of seen) if (!catalogClaims.has(branchId)) errors.push(`source-provenance-unknown:${branchId}`);
  return errors;
};

// Catalog membership is a declaration only. Source-backed coverage requires a separate proven provenance contract.
export const deriveInventory = (catalog, inventoryDocument, provenanceDocument = loadSourceProvenance(), bindings = loadExecutionBindings()) => {
  if (inventoryDocument.schemaVersion !== 3) throw new Error('ACCEPTANCE_INVENTORY_SCHEMA_V3_REQUIRED');
  if (inventoryDocument.sourceProvenanceSource !== 'tests/acceptance/source-provenance.json') throw new Error('ACCEPTANCE_INVENTORY_PROVENANCE_SOURCE_REQUIRED');
  if (provenanceDocument?.inventoryId !== inventoryDocument.inventoryId) throw new Error('ACCEPTANCE_INVENTORY_PROVENANCE_ID_MISMATCH');
  const provenanceErrors = validateSourceProvenance(catalog, bindings, provenanceDocument);
  if (provenanceErrors.length) throw new Error(`ACCEPTANCE_SOURCE_PROVENANCE_INVALID:${provenanceErrors.join(',')}`);
  const provenanceByBranch = new Map((provenanceDocument.contracts ?? []).map(item => [item.branchId, item]));

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
          coverageStatus: 'SOURCE_BACKED',
          testIds: [testCase.testId],
          provenance: provenanceByBranch.get(branchId),
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
