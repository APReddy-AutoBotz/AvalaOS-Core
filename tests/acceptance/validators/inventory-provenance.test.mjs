import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { canonicalSourceSha256 } from '../../../scripts/exhaustiveAcceptanceModel.mjs';

const root = process.cwd();
const validator = path.join(root, 'scripts/exhaustiveAcceptanceValidate.mjs');
const catalogPath = path.join(root, 'tests/acceptance/catalog/test-catalog.json');
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
const bindingsPath = path.join(root, 'tests/acceptance/execution-bindings.json');
const bindings = JSON.parse(readFileSync(bindingsPath, 'utf8'));
const provenancePath = path.join(root, 'tests/acceptance/source-provenance.json');
const provenance = JSON.parse(readFileSync(provenancePath, 'utf8'));
const proofOwnersPath = path.join(root, 'tests/acceptance/proof-owner-registry.json');
const proofOwners = JSON.parse(readFileSync(proofOwnersPath, 'utf8'));
const hostedSpec = readFileSync(path.join(root, 'tests/browser/exhaustiveHostedAcceptance.spec.ts'), 'utf8');
const hostedRouteSource = readFileSync(path.join(root, 'services/hostedSandboxRoute.ts'), 'utf8');
const inventory = JSON.parse(readFileSync(path.join(root, 'tests/acceptance/inventory.json'), 'utf8'));

assert.equal(inventory.schemaVersion, 3);
assert.equal(inventory.coveredBranchesSource, 'tests/acceptance/catalog/test-catalog.json');
assert.equal(inventory.sourceProvenanceSource, 'tests/acceptance/source-provenance.json');
assert.equal(inventory.uncoveredBranches.some(branch => branch.branchId === 'STUDIO-LEASE_CONCURRENCY'), false);
assert.equal(inventory.uncoveredBranches.length, 0);
assert.equal(JSON.parse(readFileSync(catalogPath, 'utf8')).cases.some(item => item.testId === 'SAFETY-005' && item.branchIds.includes('SAFETY-RESPONSE_LOST_AFTER_COMMIT')), true);
assert.equal(
  canonicalSourceSha256('line one\r\nline two\r\n'),
  canonicalSourceSha256('line one\nline two\n'),
  'source provenance must hash canonical Git text independently of checkout line endings',
);

const run = (document, bindingsDocument = bindings, provenanceDocument = provenance, proofOwnerDocument = proofOwners, catalogDocument = catalog) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'acceptance-inventory-v3-'));
  const generatedCatalogPath = path.join(directory, 'test-catalog.json');
  writeFileSync(generatedCatalogPath, JSON.stringify(catalogDocument));
  const inventoryPath = path.join(directory, 'inventory.json');
  writeFileSync(inventoryPath, JSON.stringify(document));
  const generatedBindingsPath = path.join(directory, 'execution-bindings.json');
  writeFileSync(generatedBindingsPath, JSON.stringify(bindingsDocument));
  const generatedProvenancePath = path.join(directory, 'source-provenance.json');
  writeFileSync(generatedProvenancePath, JSON.stringify(provenanceDocument));
  const generatedProofOwnersPath = path.join(directory, 'proof-owner-registry.json');
  writeFileSync(generatedProofOwnersPath, JSON.stringify(proofOwnerDocument));
  return spawnSync(process.execPath, [validator], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      ACCEPTANCE_CATALOG: generatedCatalogPath,
      ACCEPTANCE_BINDINGS: generatedBindingsPath,
      ACCEPTANCE_INVENTORY: inventoryPath,
      ACCEPTANCE_PROVENANCE: generatedProvenancePath,
      ACCEPTANCE_PROOF_OWNERS: generatedProofOwnersPath,
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

const keyboardCase = catalog.cases.find(item => item.testId === 'SANDBOX-009');
const keyboardOwnership = proofOwners.contracts.find(item => item.testId === 'SANDBOX-009');
assert.deepEqual(keyboardCase.sourceReference, ['App.tsx', 'components/shared/CustomDashboardView.tsx', 'index.css', 'services/hostedSandboxRoute.ts'], 'keyboard evidence must bind the actual focus, Home contrast target, shared motion and entry routing');
assert.deepEqual(keyboardOwnership.sourceAnchorIds, ['hosted-sandbox-route', 'sandbox-main-focus-target', 'sandbox-readable-screen-motion', 'sandbox-home-contrast-target', 'sandbox-opaque-contrast-surface', 'sandbox-contrast-foreground-token']);
assert.equal(provenance.sourceDigests['index.css'], canonicalSourceSha256(readFileSync(path.join(root, 'index.css'), 'utf8')), 'motion proof must bind the actual canonical CSS bytes');
assert.equal(provenance.sourceDigests['components/shared/CustomDashboardView.tsx'], canonicalSourceSha256(readFileSync(path.join(root, 'components/shared/CustomDashboardView.tsx'), 'utf8')), 'the real contrast paragraph must bind its actual component bytes');
assert.equal(
  proofOwners.sourceAnchors.find(item => item.anchorId === 'sandbox-readable-screen-motion').selector,
  '@keyframes kp-screen-in {\n  from {\n    transform: translateY(8px);\n  }\n  to {\n    transform: translateY(0);\n  }\n}',
  'a keyframe name alone cannot prove that every screen-entry frame preserves readable content',
);

const routeOnlyCatalog = structuredClone(catalog);
const routeOnlyProvenance = structuredClone(provenance);
const routeOnlyOwners = structuredClone(proofOwners);
routeOnlyCatalog.cases.find(item => item.testId === 'SANDBOX-009').sourceReference = ['services/hostedSandboxRoute.ts'];
routeOnlyProvenance.contracts.find(item => item.testId === 'SANDBOX-009').sourceReferences = ['services/hostedSandboxRoute.ts'];
routeOnlyOwners.contracts.find(item => item.testId === 'SANDBOX-009').sourceAnchorIds = ['hosted-sandbox-route'];
const routeOnlyResult = run(inventory, bindings, routeOnlyProvenance, routeOnlyOwners, routeOnlyCatalog);
assert.notEqual(routeOnlyResult.status, 0);
assert.match(routeOnlyResult.stderr, /proof-owner-source-contract:SANDBOX-KEYBOARD_ACCESSIBILITY/u, 'coordinated route-only catalog/provenance/registry claims must fail against independent keyboard source ownership');

const fakeMotionDigest = structuredClone(provenance);
fakeMotionDigest.sourceDigests['index.css'] = `sha256:${'0'.repeat(64)}`;
const fakeMotionDigestResult = run(inventory, bindings, fakeMotionDigest);
assert.notEqual(fakeMotionDigestResult.status, 0);
assert.match(fakeMotionDigestResult.stderr, /source-provenance-digest:SANDBOX-KEYBOARD_ACCESSIBILITY:index\.css/u, 'a substituted CSS digest cannot attest readable motion');

for (const [anchorId, selector] of [
  ['sandbox-main-focus-target', 'function App() {'],
  ['sandbox-readable-screen-motion', '@keyframes kp-screen-in {'],
  ['sandbox-home-contrast-target', 'Open work'],
  ['sandbox-home-contrast-target', '<div className="av-stat-strip"><p className="av-eyebrow">Needs review</p>'],
  ['sandbox-opaque-contrast-surface', '.av-stat-strip {'],
  ['sandbox-contrast-foreground-token', '.av-eyebrow {'],
]) {
  const markerOnlyOwners = structuredClone(proofOwners);
  markerOnlyOwners.sourceAnchors.find(item => item.anchorId === anchorId).selector = selector;
  const markerOnlyResult = run(inventory, bindings, provenance, markerOnlyOwners);
  assert.notEqual(markerOnlyResult.status, 0);
  assert.match(markerOnlyResult.stderr, /proof-owner-anchor-source-contract/u, `${anchorId} must reject an existing but non-behavioral marker as source proof`);
}

const omittedMotionOwner = structuredClone(proofOwners);
omittedMotionOwner.contracts.find(item => item.testId === 'SANDBOX-009').sourceAnchorIds = ['hosted-sandbox-route', 'sandbox-main-focus-target'];
const omittedMotionResult = run(inventory, bindings, provenance, omittedMotionOwner);
assert.notEqual(omittedMotionResult.status, 0);
assert.match(omittedMotionResult.stderr, /proof-owner-(?:sources|source-contract):SANDBOX-KEYBOARD_ACCESSIBILITY/u, 'focus ownership without the actual CSS motion owner is incomplete proof');

const omittedHomeOwner = structuredClone(proofOwners);
omittedHomeOwner.contracts.find(item => item.testId === 'SANDBOX-009').sourceAnchorIds = keyboardOwnership.sourceAnchorIds.filter(id => id !== 'sandbox-home-contrast-target');
const omittedHomeResult = run(inventory, bindings, provenance, omittedHomeOwner);
assert.notEqual(omittedHomeResult.status, 0);
assert.match(omittedHomeResult.stderr, /proof-owner-(?:sources|source-contract):SANDBOX-KEYBOARD_ACCESSIBILITY/u, 'CSS-only contrast ownership cannot substitute for the actual product paragraph');

const fakeHomeDigest = structuredClone(provenance);
fakeHomeDigest.sourceDigests['components/shared/CustomDashboardView.tsx'] = `sha256:${'0'.repeat(64)}`;
const fakeHomeResult = run(inventory, bindings, fakeHomeDigest);
assert.notEqual(fakeHomeResult.status, 0);
assert.match(fakeHomeResult.stderr, /source-provenance-digest:SANDBOX-KEYBOARD_ACCESSIBILITY:components\/shared\/CustomDashboardView\.tsx/u, 'a substituted Home-component digest cannot prove real product contrast');

const fakeOwner = structuredClone(provenance);
fakeOwner.contracts.find(item => item.testId === 'SANDBOX-004').ownership[0].ownerId = 'network-observer-ended-early';
const fakeOwnerResult = run(inventory, bindings, fakeOwner);
assert.notEqual(fakeOwnerResult.status, 0);
assert.match(fakeOwnerResult.stderr, /source-provenance-ownership/u, 'fake scenario ownership must fail closed');

const coordinatedBindings = structuredClone(bindings);
const coordinatedProvenance = structuredClone(provenance);
const coordinatedProofOwners = structuredClone(proofOwners);
coordinatedBindings.hostedTests.find(item => item.testId === 'SANDBOX-004').scenario = 'network-observer-ended-early';
coordinatedProvenance.contracts.find(item => item.testId === 'SANDBOX-004').ownership[0].ownerId = 'network-observer-ended-early';
coordinatedProofOwners.contracts.find(item => item.testId === 'SANDBOX-004').ownership[0].ownerId = 'network-observer-ended-early';
const coordinatedSubstitution = run(inventory, coordinatedBindings, coordinatedProvenance, coordinatedProofOwners);
assert.notEqual(coordinatedSubstitution.status, 0);
assert.match(coordinatedSubstitution.stderr, /proof-owner-source-contract/u, 'coordinated binding, provenance, and registry substitution must fail against the independent source contract');

const missingOwner = structuredClone(proofOwners);
missingOwner.contracts.find(item => item.testId === 'SANDBOX-004').ownership = [];
const missingOwnerResult = run(inventory, bindings, provenance, missingOwner);
assert.notEqual(missingOwnerResult.status, 0);
assert.match(missingOwnerResult.stderr, /proof-owner-(?:source-contract|ownership)/u, 'missing proof owner must fail closed');

const missingAnchor = structuredClone(proofOwners);
missingAnchor.contracts.find(item => item.testId === 'SANDBOX-004').sourceAnchorIds = ['missing-source-anchor'];
const missingAnchorResult = run(inventory, bindings, provenance, missingAnchor);
assert.notEqual(missingAnchorResult.status, 0);
assert.match(missingAnchorResult.stderr, /proof-owner-(?:anchor-missing|source-contract)/u, 'missing source anchor must fail closed');

const fakeFamilyAnchor = structuredClone(proofOwners);
fakeFamilyAnchor.sourceAnchors.find(item => item.anchorId === 'hosted-sandbox-route').selector = 'Sandbox';
const fakeFamilyAnchorResult = run(inventory, bindings, provenance, fakeFamilyAnchor);
assert.notEqual(fakeFamilyAnchorResult.status, 0);
assert.match(fakeFamilyAnchorResult.stderr, /proof-owner-anchor-(?:source-contract|selector|resolution)/u, 'a generic family-like source token is not an exact source ownership anchor');

const substitutedCommands = structuredClone(bindings);
const substitutedCommandRegistry = structuredClone(proofOwners);
substitutedCommands.retainedSuites.find(item => item.suiteId === 'pilot-operations').command = ['node', 'fake-green-suite.mjs'];
substitutedCommandRegistry.commandContracts.retainedCommands['pilot-operations'] = ['node', 'fake-green-suite.mjs'];
const substitutedCommand = run(inventory, substitutedCommands, provenance, substitutedCommandRegistry);
assert.notEqual(substitutedCommand.status, 0);
assert.match(substitutedCommand.stderr, /proof-owner-command-source-contract/u, 'coordinated canonical command substitution must fail against the independent source contract');

const partialComposite = structuredClone(bindings);
partialComposite.serverTests.find(item => item.testId === 'ASSESS-002').components = ['server'];
const partialCompositeResult = run(inventory, partialComposite);
assert.notEqual(partialCompositeResult.status, 0);
assert.match(partialCompositeResult.stderr, /composite execution kinds must exactly match/u);

const sandboxDescendant = JSON.parse(readFileSync(catalogPath, 'utf8')).cases.find(item => item.testId === 'SANDBOX-006');
assert.equal(sandboxDescendant.branchIds[0], 'SANDBOX-ACCEPTED_DESCENDANT_ROUTE');
assert.equal(sandboxDescendant.expectedDenial, false, 'an accepted descendant cannot be relabeled as denied evidence');
assert.match(hostedRouteSource, /pathname\.startsWith\(`\$\{HOSTED_SANDBOX_ROUTE\}\/`\)/u, 'source routing explicitly accepts sandbox descendants');
assert.match(hostedSpec, /const runObservedPersonaJourney[\s\S]*await signOutToSandbox\(page\);[\s\S]*await observer\.stopAfterQuiescence\([\s\S]*observer\.assertSafe\(\);/u, 'SANDBOX-004 must observe the complete post-entry and sign-out workflow through network quiescence');
assert.match(hostedSpec, /case 'network-safety':[\s\S]*await runObservedPersonaJourney\(page, label, userName\);/u, 'SANDBOX-004 must use the full observed persona journey');
for (const scenario of ['desktop-layout', 'mobile-layout']) {
  const block = new RegExp(`case '${scenario}':[\\s\\S]*for \\(const \\[label, userName\\] of personas\\)[\\s\\S]*await enterPersona\\(page, label\\)`, 'u');
  assert.match(hostedSpec, block, `${scenario} must enter every bounded persona post-entry`);
}
assert.match(hostedSpec, /case 'keyboard-a11y': \{\s*for \(const \[personaIndex, \[label, userName\]\] of personas\.entries\(\)\) \{\s*await page\.emulateMedia\(\{ reducedMotion: 'no-preference' \}\);\s*await enterPersona\(page, label\);\s*await assertActivePersona\(page, userName\);/u, 'keyboard-a11y must enumerate and enter every bounded persona, including the once-per-project negative oracle');

assert.match(hostedSpec, /case 'serious-critical-a11y':[\s\S]*for \(const \[label, userName\] of personas\)[\s\S]*await runObservedPersonaJourney\(page, label, userName/u, 'SAFETY-007 must enter every bounded canonical persona through the observed journey');
assert.match(hostedSpec, /case 'serious-critical-a11y':[\s\S]*item\.impact === 'serious' \|\| item\.impact === 'critical'/u);
assert.match(hostedSpec, /const runObservedPersonaJourney[\s\S]*observer\.assertSafe\(\)/u, 'post-entry accessibility must retain network safety through the observed journey');

console.log('Acceptance inventory provenance validation tests passed.');
