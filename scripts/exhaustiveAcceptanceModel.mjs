import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PROOF_COMMAND_CONTRACTS, PROOF_EXECUTION_CONTEXTS, PROOF_OWNER_SOURCE_CONTRACTS, PROOF_SOURCE_ANCHORS } from '../tests/acceptance/proof-owner-source-contracts.mjs';

export const repoRoot = process.cwd();
export const catalogPath = process.env.ACCEPTANCE_CATALOG || path.join(repoRoot, 'tests/acceptance/catalog/test-catalog.json');
export const inventoryPath = process.env.ACCEPTANCE_INVENTORY || path.join(repoRoot, 'tests/acceptance/inventory.json');
export const bindingsPath = process.env.ACCEPTANCE_BINDINGS || path.join(repoRoot, 'tests/acceptance/execution-bindings.json');
export const provenancePath = process.env.ACCEPTANCE_PROVENANCE || path.join(repoRoot, 'tests/acceptance/source-provenance.json');
export const proofOwnersPath = process.env.ACCEPTANCE_PROOF_OWNERS || path.join(repoRoot, 'tests/acceptance/proof-owner-registry.json');

export const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
export const loadCatalog = () => readJson(catalogPath);
export const loadInventoryDocument = () => readJson(inventoryPath);
export const loadExecutionBindings = () => readJson(bindingsPath);
export const loadSourceProvenance = () => readJson(provenancePath);
export const loadProofOwnerRegistry = () => readJson(proofOwnersPath);
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
    const format = bindings.oracleExecution?.assertionIdFormat ?? '';
    const assertionId = format.replace('{testId}', item.testId).replace('{scenario}', item.scenario);
    if (item.testId === testId) owners.push({
      kind: 'oracle-scenario',
      ownerId: item.scenario,
      assertionIds: assertionId ? [assertionId] : [],
      scenarioIds: [item.scenario],
    });
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
      scenarioIds: item.scenarioIds ?? [],
    });
  }
  return owners.sort((a, b) => `${a.kind}:${a.ownerId}`.localeCompare(`${b.kind}:${b.ownerId}`));
};

const safeRelativeSource = (root, source) => {
  if (typeof source !== 'string' || path.isAbsolute(source) || source.includes('..')) return null;
  const resolved = path.resolve(root, source);
  return resolved.startsWith(`${path.resolve(root)}${path.sep}`) ? resolved : null;
};

export const validateProofOwnerRegistry = (catalog, bindings, registry, root = repoRoot) => {
  const errors = [];
  if (registry?.schemaVersion !== 1) return ['proof-owner-schema'];
  const anchors = Array.isArray(registry?.sourceAnchors) ? registry.sourceAnchors : [];
  const contracts = Array.isArray(registry?.contracts) ? registry.contracts : [];
  if (!anchors.length) errors.push('proof-owner-anchor-array');
  if (!contracts.length) errors.push('proof-owner-contract-array');
  if (canonicalValue(anchors) !== canonicalValue(PROOF_SOURCE_ANCHORS)) errors.push('proof-owner-anchor-source-contract');
  if (canonicalValue(registry?.executionContexts) !== canonicalValue(PROOF_EXECUTION_CONTEXTS)) errors.push('proof-owner-execution-context-source-contract');
  if (canonicalValue(bindings?.oracleExecution) !== canonicalValue(PROOF_EXECUTION_CONTEXTS.oracle)) errors.push('proof-owner-oracle-execution-context');
  if (canonicalValue(bindings?.serverExecution) !== canonicalValue(PROOF_EXECUTION_CONTEXTS.server)) errors.push('proof-owner-server-execution-context');
  const bindingCommands = {
    retainedCommands: Object.fromEntries((bindings.retainedSuites ?? []).map(item => [item.suiteId, item.command])),
    serverCommands: Object.fromEntries((bindings.serverTests ?? []).map(item => [item.suiteId, item.command])),
  };
  if (canonicalValue(registry?.commandContracts) !== canonicalValue(PROOF_COMMAND_CONTRACTS)) errors.push('proof-owner-command-source-contract');
  if (canonicalValue(bindingCommands) !== canonicalValue(PROOF_COMMAND_CONTRACTS)) errors.push('proof-owner-command-binding');

  const anchorById = new Map();
  for (const anchor of anchors) {
    const key = anchor?.anchorId ?? 'missing';
    if (!anchor?.anchorId || anchorById.has(anchor.anchorId)) errors.push(`proof-owner-anchor-duplicate:${key}`);
    anchorById.set(anchor?.anchorId, anchor);
    const resolved = safeRelativeSource(root, anchor?.sourceReference);
    if (!resolved || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      errors.push(`proof-owner-anchor-source:${key}`);
      continue;
    }
    if (typeof anchor?.selector !== 'string' || anchor.selector.length < 12) {
      errors.push(`proof-owner-anchor-selector:${key}`);
      continue;
    }
    const source = fs.readFileSync(resolved, 'utf8').replace(/\r\n/gu, '\n');
    const occurrences = source.split(anchor.selector.replace(/\r\n/gu, '\n')).length - 1;
    if (occurrences !== 1) errors.push(`proof-owner-anchor-resolution:${key}`);
  }

  const catalogClaims = new Map();
  for (const testCase of catalog.cases ?? []) for (const branchId of testCase.branchIds ?? []) catalogClaims.set(branchId, testCase);
  const sourceContracts = new Map(PROOF_OWNER_SOURCE_CONTRACTS.map(item => [item.branchId, item]));
  const seen = new Set();
  for (const contract of contracts) {
    const key = contract?.branchId ?? 'missing';
    if (!contract?.branchId || seen.has(contract.branchId)) errors.push(`proof-owner-duplicate:${key}`);
    seen.add(contract?.branchId);
    const testCase = catalogClaims.get(contract?.branchId);
    if (!testCase || contract?.testId !== testCase.testId) {
      errors.push(`proof-owner-claim:${key}`);
      continue;
    }
    const contractAnchors = Array.isArray(contract.sourceAnchorIds) ? contract.sourceAnchorIds : [];
    if (!contractAnchors.length || new Set(contractAnchors).size !== contractAnchors.length) errors.push(`proof-owner-anchors:${key}`);
    const anchoredSources = sortedUnique(contractAnchors.map(id => anchorById.get(id)?.sourceReference).filter(Boolean));
    if (canonicalValue(anchoredSources) !== canonicalValue(sortedUnique(testCase.sourceReference ?? []))) errors.push(`proof-owner-sources:${key}`);
    if (contractAnchors.some(id => !anchorById.has(id))) errors.push(`proof-owner-anchor-missing:${key}`);
    const expectedOwners = expectedExecutionOwnership(testCase.testId, bindings);
    const sourceContract = sourceContracts.get(key);
    if (!sourceContract
      || sourceContract.testId !== testCase.testId
      || canonicalValue(sourceContract.sourceAnchorIds) !== canonicalValue(contractAnchors)
      || canonicalValue(sourceContract.ownership) !== canonicalValue(contract.ownership)) errors.push(`proof-owner-source-contract:${key}`);
    if (!expectedOwners.length || canonicalValue(expectedOwners) !== canonicalValue(contract?.ownership)) errors.push(`proof-owner-ownership:${key}`);
  }
  for (const branchId of catalogClaims.keys()) if (!seen.has(branchId)) errors.push(`proof-owner-missing:${branchId}`);
  for (const branchId of seen) if (!catalogClaims.has(branchId)) errors.push(`proof-owner-unknown:${branchId}`);
  for (const branchId of sourceContracts.keys()) if (!catalogClaims.has(branchId)) errors.push(`proof-owner-source-contract-unknown:${branchId}`);
  for (const branchId of catalogClaims.keys()) if (!sourceContracts.has(branchId)) errors.push(`proof-owner-source-contract-missing:${branchId}`);
  return errors;
};

export const validateSourceProvenance = (catalog, bindings, provenanceDocument, root = repoRoot, proofOwnerRegistry = loadProofOwnerRegistry()) => {
  const errors = [];
  if (provenanceDocument?.schemaVersion !== 2) return ['source-provenance-schema'];
  if (!provenanceDocument?.inventoryId) errors.push('source-provenance-inventory-id');
  if (provenanceDocument?.proofOwnerRegistrySource !== 'tests/acceptance/proof-owner-registry.json') errors.push('source-provenance-proof-owner-source');
  errors.push(...validateProofOwnerRegistry(catalog, bindings, proofOwnerRegistry, root));
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
    const proofContract = (proofOwnerRegistry?.contracts ?? []).find(item => item.branchId === key);
    if (!proofContract || canonicalValue(actualOwners) !== canonicalValue(proofContract.ownership)) errors.push(`source-provenance-proof-owner:${key}`);
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
