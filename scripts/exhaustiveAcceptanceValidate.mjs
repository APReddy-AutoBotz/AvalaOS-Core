import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const catalogPath = process.env.ACCEPTANCE_CATALOG || path.join(root, 'tests/acceptance/catalog/test-catalog.json');
const inventoryPath = process.env.ACCEPTANCE_INVENTORY || path.join(root, 'tests/acceptance/inventory.json');
const required = ['testId','title','module','feature','ruleRequirement','sourceReference','environment','persona','fixture','transcript','preconditions','actions','expectedResult','expectedMutation','expectedMutationCount','expectedDenial','expectedErrorCode','expectedStateBefore','expectedStateAfter','expectedScore','expectedClassification','expectedLineage','expectedEvidence','expectedAudit','viewport','browser','destructiveOrNonDestructive','realProviderAllowed','customerDataAllowed'];
const fail = message => { throw new Error(`[acceptance-catalog] ${message}`); };
const read = file => { if (!fs.existsSync(file)) fail(`missing ${path.relative(root,file)}`); try { return JSON.parse(fs.readFileSync(file,'utf8')); } catch (e) { fail(`invalid JSON in ${path.relative(root,file)}: ${e.message}`); } };
const asArray = (value, label) => { const result = Array.isArray(value) ? value : value?.cases ?? value?.tests ?? value?.branches ?? value?.items; if (!Array.isArray(result)) fail(`${label} must be an array or contain an array`); return result; };
const validateInventoryProvenance = (branch, id) => {
  const provenance = branch.provenance;
  if (provenance?.kind === 'source-backed') {
    if (typeof provenance.contract !== 'string' || !provenance.contract.trim()) fail(`${id} source-backed provenance is missing an exact contract`);
    if (typeof branch.sourceReference !== 'string' || !branch.sourceReference.trim()) fail(`${id} source-backed provenance is missing a sourceReference`);
    const sourcePath = path.resolve(root, branch.sourceReference);
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) fail(`${id} source-backed provenance references missing source ${branch.sourceReference}`);
    if (!fs.readFileSync(sourcePath, 'utf8').includes(provenance.contract)) fail(`${id} declared rule has no exact source-backed contract ${JSON.stringify(provenance.contract)} in ${branch.sourceReference}`);
    return;
  }
  if (provenance?.kind === 'required-scenario') {
    if (typeof provenance.limitation !== 'string' || !provenance.limitation.trim()) fail(`${id} required-scenario provenance is missing its source limitation`);
    return;
  }
  fail(`${id} must declare source-backed or required-scenario provenance`);
};
const catalog = asArray(read(catalogPath), 'catalog');
const inventory = asArray(read(inventoryPath), 'inventory');
const ids = new Set();
const catalogById = new Map();
for (const [index, item] of catalog.entries()) {
  for (const key of required) if (!(key in item)) fail(`catalog[${index}] (${item.testId ?? 'unknown'}) missing ${key}`);
  if (!/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d{3}$/.test(item.testId)) fail(`${item.testId} is not a stable deterministic Test ID`);
  if (ids.has(item.testId)) fail(`duplicate Test ID ${item.testId}`); ids.add(item.testId);
  catalogById.set(item.testId, item);
  if (item.realProviderAllowed !== false || item.customerDataAllowed !== false) fail(`${item.testId} violates synthetic-only safety flags`);
  if (!['destructive','non-destructive','nonDestructive','non_destructive','destructive_synthetic_disposable'].includes(item.destructiveOrNonDestructive)) fail(`${item.testId} has invalid destructive classification`);
}
const branchIds = new Set();
for (const [index, branch] of inventory.entries()) {
  const id = branch.branchId ?? branch.ruleId ?? branch.id; if (!id) fail(`inventory[${index}] missing branchId`);
  if (branchIds.has(id)) fail(`duplicate branch ID ${id}`); branchIds.add(id);
  const refs = branch.testIds ?? branch.testId ?? [];
  for (const ref of Array.isArray(refs) ? refs : [refs]) if (ref && !ids.has(ref)) fail(`${id} references unknown Test ID ${ref}`);
  const disposition = branch.coverageDisposition ?? branch.coverageStatus ?? branch.status;
  if (disposition === 'UNCOVERED' && !(branch.uncoveredReason ?? branch.reason)) fail(`${id} is UNCOVERED without a reason`);
  if (disposition === 'COVERED') {
    const mapped = (Array.isArray(refs) ? refs : [refs]).map(ref => catalogById.get(ref)).filter(Boolean);
    if (!mapped.some(item => item.branchIds?.includes(id) && item.sourceReference?.includes(branch.sourceReference))) fail(`${id} has no catalog declaration that maps the branch to its exact sourceReference`);
  }
  if (disposition === 'UNCOVERED' || branch.provenance) validateInventoryProvenance(branch, id);
}
console.log(JSON.stringify({status:'PASS',catalogTests:catalog.length,inventoryBranches:inventory.length,catalogPath:path.relative(root,catalogPath),inventoryPath:path.relative(root,inventoryPath)}));
