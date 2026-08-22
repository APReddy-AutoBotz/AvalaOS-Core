import fs from 'node:fs';
import path from 'node:path';
import {
  classifyExecutionBindings,
  deriveInventory,
  loadCatalog,
  loadExecutionBindings,
  loadInventoryDocument,
  repoRoot,
} from './exhaustiveAcceptanceModel.mjs';

const required = ['testId','title','module','feature','ruleRequirement','sourceReference','environment','persona','fixture','transcript','preconditions','actions','expectedResult','expectedMutation','expectedMutationCount','expectedDenial','expectedErrorCode','expectedStateBefore','expectedStateAfter','expectedScore','expectedClassification','expectedLineage','expectedEvidence','expectedAudit','viewport','browser','destructiveOrNonDestructive','realProviderAllowed','customerDataAllowed'];
const fail = message => { throw new Error(`[acceptance-catalog] ${message}`); };
const catalog = loadCatalog();
const inventoryDocument = loadInventoryDocument();
const bindings = loadExecutionBindings();
const exhaustivePlaywrightConfig = fs.readFileSync(path.join(repoRoot, 'playwright.exhaustive-acceptance.config.ts'), 'utf8');
if (!/\btrace:\s*['"]off['"]/u.test(exhaustivePlaywrightConfig)) fail('exhaustive hosted Playwright traces must remain disabled so raw request data cannot enter uploaded evidence');
const cases = catalog.cases ?? [];
const ids = new Set();

for (const [index, item] of cases.entries()) {
  for (const key of required) if (!(key in item)) fail(`catalog[${index}] (${item.testId ?? 'unknown'}) missing ${key}`);
  if (!/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d{3}$/.test(item.testId)) fail(`${item.testId} is not a stable deterministic Test ID`);
  if (ids.has(item.testId)) fail(`duplicate Test ID ${item.testId}`);
  ids.add(item.testId);
  if (!Array.isArray(item.branchIds) || item.branchIds.length === 0) fail(`${item.testId} must declare at least one branchId`);
  if (!Array.isArray(item.sourceReference) || item.sourceReference.length === 0) fail(`${item.testId} must declare sourceReference`);
  for (const ref of item.sourceReference) {
    const sourcePath = path.join(repoRoot, ref);
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) fail(`${item.testId} references missing source ${ref}`);
  }
  if (item.realProviderAllowed !== false || item.customerDataAllowed !== false) fail(`${item.testId} violates synthetic-only safety flags`);
  if (!['destructive','non-destructive','nonDestructive','non_destructive','destructive_synthetic_disposable'].includes(item.destructiveOrNonDestructive)) fail(`${item.testId} has invalid destructive classification`);
}

if (inventoryDocument.schemaVersion !== 2) fail('inventory schemaVersion must be 2');
if (inventoryDocument.coveredBranchesSource !== 'tests/acceptance/catalog/test-catalog.json') fail('catalog branch declarations must derive from the canonical catalog');
for (const branch of inventoryDocument.uncoveredBranches ?? []) {
  if (!branch.branchId || !branch.uncoveredReason || !branch.recommendedAction) fail('every explicit uncovered branch needs id, reason, and action');
  if (branch.provenance?.kind !== 'required-scenario' || !branch.provenance?.limitation) fail(`${branch.branchId} must declare required-scenario provenance`);
  for (const ref of branch.sourceReferences ?? []) {
    const sourcePath = path.join(repoRoot, ref);
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) fail(`${branch.branchId} references missing source ${ref}`);
  }
}
const inventory = deriveInventory(catalog, inventoryDocument);
const branchIds = new Set();
for (const branch of inventory) {
  if (branchIds.has(branch.branchId)) fail(`duplicate branch ${branch.branchId}`);
  branchIds.add(branch.branchId);
  if (!['DECLARED','SOURCE_BACKED','UNCOVERED'].includes(branch.coverageStatus)) fail(`${branch.branchId} has unsupported coverage status ${branch.coverageStatus}`);
}
if (branchIds.has('STUDIO-LEASE_CONCURRENCY')) fail('invented Studio lease branch must not reappear');

const suiteIds = new Set();
for (const suite of bindings.retainedSuites ?? []) {
  if (!suite.suiteId || suiteIds.has(suite.suiteId)) fail(`duplicate or missing retained suite ${suite.suiteId ?? 'missing'}`);
  suiteIds.add(suite.suiteId);
  if (!Array.isArray(suite.command) || suite.command.length === 0 || suite.command.some(part => typeof part !== 'string' || !part)) fail(`${suite.suiteId} has invalid command`);
  for (const testId of suite.testIds ?? []) if (!ids.has(testId)) fail(`${suite.suiteId} references unknown Test ID ${testId}`);
}
for (const item of bindings.oracleTests ?? []) if (!ids.has(item.testId) || !item.scenario) fail(`invalid oracle binding ${item.testId ?? 'missing'}`);
for (const item of bindings.hostedTests ?? []) {
  if (!ids.has(item.testId)) fail(`hosted binding references unknown Test ID ${item.testId}`);
  if (!Array.isArray(item.projects) || item.projects.length === 0) fail(`${item.testId} hosted binding has no projects`);
  for (const project of item.projects) if (!['desktop-chromium','pixel-7-chromium'].includes(project)) fail(`${item.testId} has unsupported project ${project}`);
  if (new Set(item.projects).size !== item.projects.length) fail(`${item.testId} hosted binding has duplicate projects`);
  const catalogCase = cases.find(testCase => testCase.testId === item.testId);
  const requiredProjects = [...new Set(catalogCase?.viewport ?? [])].sort();
  const boundProjects = [...item.projects].sort();
  if (JSON.stringify(boundProjects) !== JSON.stringify(requiredProjects)) fail(`${item.testId} hosted projects must exactly match catalog viewports`);
  if (!item.scenario && !item.blockedReason) fail(`${item.testId} has neither executable scenario nor explicit blocked reason`);
}
const requiredExplicitBlocks = [
  'ASSESS-003',
  'DELIVERY-009',
  'MONITOR-001','MONITOR-002','MONITOR-003',
  'ADMIN-002','ADMIN-003',
];
for (const testId of requiredExplicitBlocks) {
  const binding = (bindings.hostedTests ?? []).find(item => item.testId === testId);
  if (!binding || binding.scenario !== null || !binding.blockedReason) fail(`${testId} must remain explicitly BLOCKED until its full canonical authority/lineage/persona contract is executable`);
}

const classification = classifyExecutionBindings(catalog, bindings);
for (const testCase of cases) {
  const kinds = classification.get(testCase.testId) ?? [];
  if (kinds.length !== 1) fail(`${testCase.testId} must have exactly one execution binding, found ${kinds.join(',') || 'none'}`);
}

const retainedTestIds = [...classification.entries()].filter(([, kinds]) => kinds[0] === 'retained').length;
const oracleTestIds = [...classification.entries()].filter(([, kinds]) => kinds[0] === 'oracle').length;
const hostedTestIds = [...classification.entries()].filter(([, kinds]) => kinds[0] === 'hosted').length;
const executableHosted = (bindings.hostedTests ?? []).filter(item => item.scenario).length;
const blockedHosted = hostedTestIds - executableHosted;
const declared = inventory.filter(item => item.coverageStatus === 'DECLARED');
const sourceBacked = inventory.filter(item => item.coverageStatus === 'SOURCE_BACKED');
const uncovered = inventory.filter(item => item.coverageStatus === 'UNCOVERED');

console.log(JSON.stringify({
  status:'PASS',
  catalogTests: cases.length,
  inventoryBranches: inventory.length,
  declaredBranches: declared.length,
  sourceBackedBranches: sourceBacked.length,
  uncoveredBranches: uncovered.length,
  retainedTestIds,
  oracleTestIds,
  hostedTestIds,
  executableHosted,
  blockedHosted,
}, null, 2));
