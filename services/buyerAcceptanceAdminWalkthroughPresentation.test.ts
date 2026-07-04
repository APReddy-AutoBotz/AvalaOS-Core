import assert from 'node:assert/strict';

import {
  CURRENT_BUYER_ACCEPTANCE_ADMIN_WALKTHROUGH_SNAPSHOT,
  buildBuyerAcceptanceAdminWalkthroughSnapshot,
} from './buyerAcceptanceAdminWalkthrough';
import {
  assertAdminWalkthroughHasExportBlockers,
  assertAdminWalkthroughHasReadinessBlockers,
  assertAdminWalkthroughNotReady,
  assertAdminWalkthroughProofSafeCopy,
  getWalkthroughDeferredTracks,
  getWalkthroughExportBlockers,
  getWalkthroughFindingStatusLabel,
  getWalkthroughFindingsRequiredBeforeBuyerSignoff,
  getWalkthroughFindingsRequiredBeforeExport,
  getWalkthroughReadinessBlockers,
  getWalkthroughStatusLabel,
  getWalkthroughStepLabel,
  groupWalkthroughStepsByAdminSection,
  summarizeAdminWalkthroughStatus,
} from './buyerAcceptanceAdminWalkthroughPresentation';

console.log('Running Buyer Acceptance Admin Walkthrough presentation tests...');

const walkthrough = buildBuyerAcceptanceAdminWalkthroughSnapshot();

assert.deepEqual(
  groupWalkthroughStepsByAdminSection(walkthrough),
  groupWalkthroughStepsByAdminSection(buildBuyerAcceptanceAdminWalkthroughSnapshot()),
);
assert.deepEqual(
  getWalkthroughExportBlockers(walkthrough),
  getWalkthroughExportBlockers(buildBuyerAcceptanceAdminWalkthroughSnapshot()),
);
assert.deepEqual(
  getWalkthroughReadinessBlockers(walkthrough),
  getWalkthroughReadinessBlockers(buildBuyerAcceptanceAdminWalkthroughSnapshot()),
);
assert.deepEqual(CURRENT_BUYER_ACCEPTANCE_ADMIN_WALKTHROUGH_SNAPSHOT, buildBuyerAcceptanceAdminWalkthroughSnapshot());

assertAdminWalkthroughNotReady(walkthrough);
assert.notEqual(walkthrough.walkthroughStatus, 'ready');
assert.notEqual(walkthrough.walkthroughStatus, 'success');
assert.equal(walkthrough.sourcePackStatus, 'evidence_required');
assert.notEqual(walkthrough.sourceReviewGateStatus, 'review_ready');

const summary = summarizeAdminWalkthroughStatus(walkthrough);
assert.match(summary, /read-only internal rehearsal/i);
assert.match(summary, /export\/PDF\/download remains blocked/i);
assert.match(summary, /browser automation is not implemented/i);
assert.match(summary, /screenshot capture is not implemented/i);
assert.doesNotMatch(summary, /approval complete|approved for buyer use|export available|download available|PDF available/i);

const groupedSteps = groupWalkthroughStepsByAdminSection(walkthrough);
const groupedSectionKeys = new Set(groupedSteps.map(group => group.adminSectionKey));
for (const sectionKey of [
  'overview',
  'trust_center',
  'buyer_acceptance_pack',
  'buyer_acceptance_review_gate',
  'evidence_policy',
] as const) {
  assert.ok(groupedSectionKeys.has(sectionKey), `Missing grouped steps for Admin section: ${sectionKey}`);
}

for (const group of groupedSteps) {
  assert.ok(group.label.length > 0, `${group.adminSectionKey} group should have a label.`);
  assert.ok(group.steps.length > 0, `${group.adminSectionKey} group should have steps.`);
}

for (const step of walkthrough.steps) {
  assert.equal(getWalkthroughStepLabel(step), step.title);
}

assertAdminWalkthroughHasExportBlockers(walkthrough);
assertAdminWalkthroughHasReadinessBlockers(walkthrough);
assert.ok(getWalkthroughExportBlockers(walkthrough).length > 0);
assert.ok(getWalkthroughReadinessBlockers(walkthrough).length > 0);
assert.ok(getWalkthroughDeferredTracks(walkthrough).length > 0);
assert.ok(getWalkthroughFindingsRequiredBeforeExport(walkthrough).length > 0);
assert.ok(getWalkthroughFindingsRequiredBeforeBuyerSignoff(walkthrough).length > 0);

assert.ok(getWalkthroughExportBlockers(walkthrough).includes('No export/PDF/download scope approved.'));
for (const blocker of [
  'production readiness',
  'hosted readiness',
  'deployment readiness',
  'RLS readiness',
  'tenant-isolation proof',
  'security readiness',
  'buyer readiness',
  'product readiness',
  'release-candidate readiness',
  'compliance certification',
]) {
  assert.ok(getWalkthroughReadinessBlockers(walkthrough).includes(blocker), `Missing readiness blocker: ${blocker}`);
}
for (const track of [
  'export/PDF/download generation',
  'approval workflow',
  'DB-backed persistence',
  'editable buyer controls',
  'DB/RLS/artifact proof',
  'hosted/deployment/security proof tracks',
]) {
  assert.ok(getWalkthroughDeferredTracks(walkthrough).includes(track), `Missing deferred track: ${track}`);
}

for (const status of ['evidence_required', 'rehearsal_required', 'blocked'] as const) {
  assert.doesNotMatch(getWalkthroughStatusLabel(status), /ready|success|approved|complete/i);
  assert.doesNotMatch(getWalkthroughFindingStatusLabel(status), /ready|success|approved|complete/i);
}

assertAdminWalkthroughProofSafeCopy(walkthrough);

for (const unsafePhrase of [
  'production ready',
  'hosted ready',
  'deployment ready',
  'RLS ready',
  'RLS active',
  'RLS verified',
  'tenant isolation verified',
  'security ready',
  'buyer ready',
  'product ready',
  'release-candidate ready',
  'compliance certified',
  'approved for buyer use',
  'export available',
  'download available',
  'PDF available',
  'screenshot evidence captured',
  'browser walkthrough verified',
  'Avala Govern Lite',
  'Avala Delivery Lite',
]) {
  assert.throws(
    () => assertAdminWalkthroughProofSafeCopy({ ...walkthrough, summary: `${walkthrough.summary} ${unsafePhrase}` }),
    /unsupported claim wording/,
    `Expected unsafe phrase to be rejected: ${unsafePhrase}`,
  );
}

const labelsAndSummary = [
  summary,
  getWalkthroughStatusLabel(walkthrough.walkthroughStatus),
  ...walkthrough.steps.map(step => getWalkthroughStepLabel(step)),
  ...walkthrough.findings.map(finding => finding.label),
].join('\n');

for (const pattern of [
  /production ready/i,
  /hosted ready/i,
  /deployment ready/i,
  /RLS ready/i,
  /RLS active/i,
  /RLS verified/i,
  /tenant isolation verified/i,
  /security ready/i,
  /buyer ready/i,
  /product ready/i,
  /release-candidate ready/i,
  /compliance certified/i,
  /approved for buyer use/i,
  /export available/i,
  /download available/i,
  /PDF available/i,
  /screenshot evidence captured/i,
  /browser walkthrough verified/i,
]) {
  assert.doesNotMatch(labelsAndSummary, pattern);
}

const snapshotBefore = JSON.parse(JSON.stringify(walkthrough));
groupWalkthroughStepsByAdminSection(walkthrough);
getWalkthroughExportBlockers(walkthrough);
getWalkthroughReadinessBlockers(walkthrough);
getWalkthroughDeferredTracks(walkthrough);
getWalkthroughFindingsRequiredBeforeExport(walkthrough);
getWalkthroughFindingsRequiredBeforeBuyerSignoff(walkthrough);
summarizeAdminWalkthroughStatus(walkthrough);
assert.deepEqual(walkthrough, snapshotBefore);

console.log('Buyer Acceptance Admin Walkthrough presentation tests passed.');
