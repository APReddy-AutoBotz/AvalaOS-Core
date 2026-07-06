import assert from 'node:assert/strict';

import {
  AUTHORITY_SURFACE_IDS,
  RLS_ASSERTION_CATEGORY_IDS,
  buildRlsTenantIsolationPreparationSnapshot,
} from './rlsTenantIsolationPreparationModel';
import {
  getAuthoritySurfacePreparationRows,
  getRlsAssertionMatrixRows,
  getRlsPreparationProofStatusLabel,
  getRlsTenantIsolationPreparationSummary,
  summarizeRlsPreparationProofStatuses,
} from './rlsTenantIsolationPreparationPresentation';

console.log('Running M5.6a RLS tenant-isolation preparation presentation tests...');

const snapshot = buildRlsTenantIsolationPreparationSnapshot();

assert.equal(getRlsPreparationProofStatusLabel('unproven'), 'Unproven');
assert.equal(getRlsPreparationProofStatusLabel('evidence_required'), 'Evidence Required');
assert.equal(getRlsPreparationProofStatusLabel('planned'), 'Planned');
assert.equal(getRlsPreparationProofStatusLabel('blocked'), 'Blocked');

const proofSummary = summarizeRlsPreparationProofStatuses(snapshot);
assert.deepEqual(proofSummary.map(summary => summary.status), [
  'unproven',
  'evidence_required',
  'planned',
  'blocked',
]);
assert.equal(proofSummary.find(summary => summary.status === 'planned')?.count, 0);
assert.equal(proofSummary.find(summary => summary.status === 'blocked')?.count, 0);
assert.equal(
  proofSummary.reduce((total, summary) => total + summary.count, 0),
  snapshot.authoritySurfaces.length + snapshot.assertionMatrix.length,
);

const surfaceRows = getAuthoritySurfacePreparationRows(snapshot);
assert.equal(surfaceRows.length, AUTHORITY_SURFACE_IDS.length);
assert.deepEqual(surfaceRows.map(row => row.id), AUTHORITY_SURFACE_IDS);
assert.ok(surfaceRows.every(row => row.proofStatus === 'unproven' || row.proofStatus === 'evidence_required'));
assert.ok(surfaceRows.every(row => row.schemaInspectionPerformed === false));
assert.ok(surfaceRows.every(row => row.rlsExecutionPerformed === false));
assert.ok(surfaceRows.every(row => row.tenantIsolationVerified === false));
assert.ok(surfaceRows.every(row => row.artifactSelectVerified === false));
assert.ok(surfaceRows.every(row => row.conceptualAuthorityAreaCount > 0));
assert.ok(surfaceRows.every(row => row.plannedImplementationScopeCount > 0));
assert.ok(surfaceRows.every(row => row.requiredFutureProofCount > 0));
assert.ok(surfaceRows.every(row => row.prohibitedOutputFieldCount > 0));
assert.ok(surfaceRows.every(row => row.readOnlySummary.includes('Read-only RLS preparation summary')));
assert.ok(surfaceRows.every(row => row.readOnlySummary.includes('no DB execution, RLS execution, artifact SELECT check, schema inspection, migration, approval, status change, or readiness evidence action is exposed')));

const assertionRows = getRlsAssertionMatrixRows(snapshot);
assert.equal(assertionRows.length, RLS_ASSERTION_CATEGORY_IDS.length);
assert.deepEqual(assertionRows.map(row => row.id), RLS_ASSERTION_CATEGORY_IDS);
assert.ok(assertionRows.every(row => row.proofStatus === 'evidence_required'));
assert.ok(assertionRows.every(row => row.assertionExecuted === false));
assert.ok(assertionRows.every(row => row.assertionPassed === false));
assert.ok(assertionRows.every(row => row.assertionVerified === false));
assert.ok(assertionRows.every(row => row.plannedAssertionScopeCount > 0));
assert.ok(assertionRows.every(row => row.requiredFutureProofCount > 0));
assert.ok(assertionRows.every(row => row.prohibitedOutputFieldCount > 0));
assert.ok(assertionRows.every(row => row.readOnlySummary.includes('Read-only future assertion summary')));
assert.ok(assertionRows.every(row => row.readOnlySummary.includes('no assertion run, pass/fail result, DB output, RLS output, artifact output, schema output, or readiness evidence action is exposed')));

const summary = getRlsTenantIsolationPreparationSummary(snapshot);
assert.equal(summary.headline, 'RLS and tenant-isolation preparation contracts');
assert.match(summary.summary, /modeled for review only/i);
assert.match(summary.summary, /AP approval remains ungranted/i);
assert.match(summary.summary, /no DB\/RLS\/artifact execution is represented/i);
assert.equal(summary.authoritySurfaceCount, AUTHORITY_SURFACE_IDS.length);
assert.equal(summary.assertionCategoryCount, RLS_ASSERTION_CATEGORY_IDS.length);
assert.equal(summary.blockedClaimCount, snapshot.blockedReadinessClaims.length);
assert.equal(summary.apApprovalGranted, false);
assert.equal(summary.dbExecutionApproved, false);
assert.equal(summary.dbExecutionPerformed, false);
assert.equal(summary.schemaInspectionPerformed, false);
assert.equal(summary.tenantIsolationVerified, false);
assert.equal(summary.readinessEvidenceProduced, false);
assert.deepEqual(summary.proofStatusSummary, proofSummary);
assert.match(summary.readOnlyNotice, /Read-only summary only/i);
assert.match(summary.readOnlyNotice, /no AP approval, DB execution, RLS execution, artifact SELECT check, schema inspection, migration, Supabase stack, Docker, hosted validation, deployment validation, assertion run, status change, or readiness evidence action is exposed/i);

const presentationCopy = [
  ...surfaceRows.flatMap(row => [row.label, row.proofStatusLabel, row.readOnlySummary]),
  ...assertionRows.flatMap(row => [row.label, row.proofStatusLabel, row.readOnlySummary]),
  summary.headline,
  summary.summary,
  summary.readOnlyNotice,
].join('\n');

assert.doesNotMatch(presentationCopy, /Avala Govern Lite|Avala Delivery Lite/);
assert.doesNotMatch(presentationCopy, /\bRLS\s+(ready|verified|passed|active)\b/i);
assert.doesNotMatch(presentationCopy, /\btenant[- ]isolation\s+(ready|verified|proven|passed)\b/i);
assert.doesNotMatch(presentationCopy, /\bartifact\s+SELECT\s+(ready|verified|proven|passed)\b/i);
assert.doesNotMatch(presentationCopy, /\bschema\s+(ready|verified|proven|available)\b/i);
assert.doesNotMatch(presentationCopy, /\blocal\s+(ready|verified|proven)\b/i);
assert.doesNotMatch(presentationCopy, /\bhosted\s+ready\b|\bproduction\s+ready\b|\bdeployment\s+ready\b|\bsecurity\s+ready\b|\bcompliance\s+certified\b/i);

console.log('M5.6a RLS tenant-isolation preparation presentation tests passed.');
